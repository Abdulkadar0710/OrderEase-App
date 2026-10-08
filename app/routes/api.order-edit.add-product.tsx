import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { addOrderTags } from "../utils/orderTagsHelper.server";
import { trackOrderEdit } from "../utils/analyticsHelper.server";
import { checkOrderEditLimit } from "../utils/editLimitHelper.server";

/**
 * Adds a product variant to an existing order, called from the
 * "Add a product to your order" panel in the customer account extension.
 */

export async function loader({ request }: LoaderFunctionArgs) {
  const { sessionToken, cors } = await authenticate.public.customerAccount(request);

  const url = new URL(request.url);
  const variantId = url.searchParams.get("variantId");

  if (!variantId) {
    return cors(
      Response.json({
        success: true,
        message: "Customer Account GET working!",
      }),
    );
  }

  const storeDomain = sessionToken?.dest?.replace(/^https?:\/\//, "");
  if (!storeDomain) {
    return cors(Response.json({ error: "Missing store domain" }, { status: 400 }));
  }

  const { admin } = await unauthenticated.admin(storeDomain);

  try {
    const variantRes = await admin.graphql(
      `#graphql
      query GetVariantStock($id: ID!) {
        productVariant(id: $id) {
          id
          title
          availableForSale
          inventoryQuantity
        }
      }`,
      { variables: { id: variantId } },
    );
    const variantJson = await variantRes.json();
    const variant = variantJson.data?.productVariant;
    const invQty = variant?.inventoryQuantity;

    return cors(
      Response.json({
        id: variant?.id || variantId,
        availableForSale: Boolean(variant?.availableForSale),
        inventoryQuantity: typeof invQty === "number" ? invQty : null,
      }),
    );
  } catch (err: unknown) {
    console.error("[add-product loader] Error fetching inventory:", err);
    return cors(Response.json({ error: "Failed to fetch stock" }, { status: 500 }));
  }
}


export async function action({ request }: ActionFunctionArgs) {
  const { sessionToken, cors } =
    await authenticate.public.customerAccount(request);

  if (request.method === "OPTIONS") {
    return cors(
      new Response(null, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  // Extract the store domain from the session token's dest property
  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  const { admin } = await unauthenticated.admin(storeDomain);

  const body = await request.json();
  const { orderId, variantId, quantity, confirmAvailableQuantity, source } = body || {};

  if (!orderId || !variantId || !quantity) {
    return cors(
      Response.json(
        {
          userErrors: [{ message: "Missing orderId, variantId, or quantity." }],
        },
        { status: 400 },
      ),
    );
  }

  // Check edit limit guard
  const editLimitCheck = await checkOrderEditLimit({ shop: storeDomain, orderId });
  if (editLimitCheck.isLimitReached) {
    return cors(
      Response.json(
        {
          userErrors: [
            {
              message: `You have reached the maximum allowed edits (${editLimitCheck.maxEdits} edits) for this order.`,
            },
          ],
        },
        { status: 422 },
      ),
    );
  }

  try {
    // Step 0: Check available product variant inventory
    let actualQuantity = Number(quantity);
    let quantityMessage: string | null = null;

    try {
      const variantRes = await admin.graphql(
        `#graphql
        query GetVariantStock($id: ID!) {
          productVariant(id: $id) {
            id
            inventoryQuantity
          }
        }`,
        { variables: { id: variantId } },
      );
      const variantJson = await variantRes.json();
      const invQty = variantJson.data?.productVariant?.inventoryQuantity;

      if (typeof invQty === "number") {
        if (invQty <= 0) {
          return cors(
            Response.json(
              { userErrors: [{ message: "Product is currently out of stock." }] },
              { status: 422 },
            ),
          );
        }
        if (actualQuantity > invQty) {
          if (!confirmAvailableQuantity) {
            return cors(
              Response.json(
                {
                  userErrors: [
                    {
                      message: `This product is not available in the required quantity of ${actualQuantity}. Only ${invQty} units are available in stock. Please confirm to add ${invQty} units to your order.`,
                    },
                  ],
                  availableQuantity: invQty,
                },
                { status: 422 },
              ),
            );
          }
          quantityMessage = `Only ${invQty} quantity available in stock. Added ${invQty} quantity to your order instead of ${actualQuantity}.`;
          actualQuantity = invQty;
        }
      }
    } catch (e) {
      console.warn("Server inventory check skipped:", e);
    }

    // Step 1: begin the edit session
    const beginResponse = await admin.graphql(
      `#graphql
      mutation OrderEditBegin($id: ID!) {
        orderEditBegin(id: $id) {
          calculatedOrder { id }
          userErrors { field message }
        }
      }`,
      { variables: { id: orderId } },
    );

    const beginJson = await beginResponse.json();
    const beginErrors = beginJson.data?.orderEditBegin?.userErrors ?? [];
    if (beginErrors.length) {
      return cors(Response.json({ userErrors: beginErrors }, { status: 422 }));
    }
    const calculatedOrderId = beginJson.data.orderEditBegin.calculatedOrder.id;

    // Step 2: add the variant
    const addResponse = await admin.graphql(
      `#graphql
      mutation OrderEditAddVariant($id: ID!, $variantId: ID!, $quantity: Int!) {
        orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity) {
          calculatedOrder {
            addedLineItems(first: 1) { nodes { id quantity } }
          }
          userErrors { field message }
        }
      }`,
      { variables: { id: calculatedOrderId, variantId, quantity: actualQuantity } },
    );
    const addJson = await addResponse.json();
    const addErrors = addJson.data?.orderEditAddVariant?.userErrors ?? [];
    if (addErrors.length) {
      return cors(Response.json({ userErrors: addErrors }, { status: 422 }));
    }

    // Step 3: commit — notifyCustomer sends the invoice/payment-link email
    // automatically if a balance is now due.
    const commitResponse = await admin.graphql(
      `#graphql
      mutation OrderEditCommit($id: ID!) {
        orderEditCommit(id: $id, notifyCustomer: true, staffNote: "Product added via customer account") {
          order {
            id
            name
            statusPageUrl
            totalOutstandingSet {
              presentmentMoney { amount currencyCode }
              shopMoney { amount currencyCode }
            }
          }
          userErrors { field message }
        }
      }`,
      { variables: { id: calculatedOrderId } },
    );
    const commitJson = await commitResponse.json();
    const commitErrors = commitJson.data?.orderEditCommit?.userErrors ?? [];
    if (commitErrors.length) {
      return cors(Response.json({ userErrors: commitErrors }, { status: 422 }));
    }

    const order = commitJson.data.orderEditCommit.order;
    const balanceDue =
      order?.totalOutstandingSet?.presentmentMoney ??
      order?.totalOutstandingSet?.shopMoney ??
      null;

    // Determine if the merchant owes the customer a refund
    // (negative outstanding balance after edit).
    const owesRefund = balanceDue ? parseFloat(balanceDue.amount) < 0 : false;
    await addOrderTags(admin, orderId, owesRefund);

    // Track order edit and feature usage
    await trackOrderEdit({
      shop: storeDomain,
      orderId,
      featureId: "add-product",
      source,
    });

    return cors(Response.json({ order, balanceDue, quantityMessage, userErrors: [] }));
  } catch (err: unknown) {
    console.error("[order-edit] Unexpected error:", err);
    const message =
      err instanceof Error ? err.message : "Internal server error";
    return cors(Response.json({ userErrors: [{ message }] }, { status: 500 }));
  }
}
