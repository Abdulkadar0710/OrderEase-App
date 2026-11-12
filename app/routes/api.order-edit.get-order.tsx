import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { releasePaymentPendingHold } from "../utils/fulfillmentHoldHelper.server";

const GET_ORDER_DETAILS_QUERY = `#graphql
  query GetOrderLineItems($id: ID!) {
    order(id: $id) {
      id
      name
      createdAt
      cancelledAt
      cancelReason
      currencyCode
      customer { id }
      tags
      displayFinancialStatus
      displayFulfillmentStatus
      totalOutstandingSet {
        shopMoney { amount currencyCode }
        presentmentMoney { amount currencyCode }
      }
      currentSubtotalPriceSet {
        shopMoney { amount currencyCode }
      }
      currentTotalPriceSet {
        shopMoney { amount currencyCode }
      }
      lineItems(first: 100) {
        edges {
          node {
            id
            name
            title
            variantTitle
            sku
            currentQuantity
            quantity
            originalUnitPriceSet {
              shopMoney { amount currencyCode }
            }
            image {
              url
              altText
            }
            variant {
              id
              sku
              title
              product {
                id
                title
                vendor
              }
              selectedOptions {
                name
                value
              }
              media(first: 1) {
                edges {
                  node {
                    ... on MediaImage {
                      image { url altText }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  }
`;

export async function loader({ request }: LoaderFunctionArgs) {
  // if (request.method === "OPTIONS") {
  //   return new Response(null, {
  //     status: 204,
  //     headers: {
  //       "Access-Control-Allow-Origin": "*",
  //       "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  //       "Access-Control-Allow-Headers": "Content-Type, Authorization",
  //       "Access-Control-Max-Age": "7200",
  //     },
  //   });
  // }

  const { sessionToken, cors } = await authenticate.public.customerAccount(request);
  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  const { admin } = await unauthenticated.admin(storeDomain);

  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");

  if (!orderId) {
    return cors(Response.json({ error: "Missing orderId" }, { status: 400 }));
  }

  try {
    const response = await admin.graphql(GET_ORDER_DETAILS_QUERY, {
      variables: { id: orderId },
    });

    const json = (await response.json()) as any;

    if (json.errors?.length) {
      return cors(Response.json({ error: json.errors[0].message }, { status: 400 }));
    }

    const orderData = json.data?.order;
    if (!orderData) {
      return cors(Response.json({ error: "Order not found" }, { status: 404 }));
    }

    const numericId = (gidOrId?: string | null) => gidOrId?.match(/\d+$/)?.[0];
    if (
      !orderData.customer?.id ||
      numericId(orderData.customer.id) !== numericId(sessionToken.sub)
    ) {
      return cors(Response.json({ error: "Unauthorized access to order." }, { status: 403 }));
    }

    const rawEdges = json.data?.order?.lineItems?.edges ?? [];

    // Explicitly filter for items with currentQuantity > 0 (excluding soft-deleted items)
    const lineItems = rawEdges
      .filter((edge: any) => edge.node && edge.node.currentQuantity > 0)
      .map((edge: any) => {
        const node = edge.node;
        const unitPrice = Number(node.originalUnitPriceSet?.shopMoney?.amount || 0);
        const currencyCode = node.originalUnitPriceSet?.shopMoney?.currencyCode || "USD";
        
        // Compute total line item price based on currentQuantity
        const totalAmount = {
          amount: (unitPrice * node.currentQuantity).toFixed(2),
          currencyCode,
        };

        const image = node.image || node.variant?.media?.edges?.[0]?.node?.image || null;
        const selectedOptions = node.variant?.selectedOptions || [];
        const itemSku = node.sku || node.variant?.sku || "";
        const merchandise = {
          id: node.variant?.id || '',
          title: node.title || node.name || '',
          sku: itemSku,
          image,
          selectedOptions,
          product: {
            id: node.variant?.product?.id || '',
            title: node.variant?.product?.title || node.title || node.name || '',
            vendor: node.variant?.product?.vendor || '',
          },
        };
        const cost = {
          totalAmount,
        };

        return {
          id: node.id,
          name: node.name,
          title: node.title || node.name,
          variantTitle: node.variantTitle,
          sku: itemSku,
          currentQuantity: node.currentQuantity,
          quantity: node.currentQuantity,
          image,
          selectedOptions,
          price: totalAmount,
          cost,
          merchandise,
        };
      });

    let orderTags = (json.data?.order?.tags as string[]) ?? [];
    const totalOutstanding =
      json.data?.order?.totalOutstandingSet?.presentmentMoney ??
      json.data?.order?.totalOutstandingSet?.shopMoney ??
      null;
    const isPaid =
      json.data?.order?.displayFinancialStatus === "PAID" &&
      (!totalOutstanding || parseFloat(totalOutstanding.amount) <= 0);

    // If order has been fully paid, auto-release hold and remove Payment-Pending tag
    if (isPaid && orderTags.some((t) => t.toLowerCase() === "payment-pending")) {
      try {
        await releasePaymentPendingHold(admin, orderId);
        orderTags = orderTags.filter((t) => t.toLowerCase() !== "payment-pending");
      } catch (e) {
        console.warn("[get-order] Failed to auto-release hold on paid order:", e);
      }
    }

    const hasPaymentPending =
      !isPaid &&
      (orderTags.some((t) => t.toLowerCase() === "payment-pending") ||
        (totalOutstanding ? parseFloat(totalOutstanding.amount) > 0 : false));

    return cors(
      Response.json({
        order: {
          id: orderData.id,
          name: orderData.name,
          createdAt: orderData.createdAt,
          cancelledAt: orderData.cancelledAt ?? null,
          cancelReason: orderData.cancelReason ?? null,
          currencyCode: orderData.currencyCode,
          displayFinancialStatus: orderData.displayFinancialStatus,
          displayFulfillmentStatus: orderData.displayFulfillmentStatus,
          currentSubtotalPriceSet: orderData.currentSubtotalPriceSet ?? null,
          currentTotalPriceSet: orderData.currentTotalPriceSet ?? null,
          hasPaymentPending: Boolean(hasPaymentPending),
          totalOutstanding,
        },
        lineItems,
      }),
    );
  } catch (err: unknown) {
    console.error("[get-order] Unexpected error:", err);
    return cors(Response.json({ error: "Internal error" }, { status: 500 }));
  }
}

export async function action({ request }: ActionFunctionArgs) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "7200",
      },
    });
  }
  const { cors } = await authenticate.public.customerAccount(request);
  return cors(Response.json({ error: "Method not allowed" }, { status: 405 }));
}
