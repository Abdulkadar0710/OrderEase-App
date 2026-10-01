import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";

/**
 * GET /api/order-edit/variant-stock?variantId=gid://shopify/ProductVariant/...
 *
 * Returns real-time inventory quantity and availability for a product variant using Admin API.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { sessionToken, cors } = await authenticate.public.customerAccount(request);

  if (request.method === "OPTIONS") {
    return cors(new Response(null, { status: 200 }));
  }

  const url = new URL(request.url);
  const variantId = url.searchParams.get("variantId");

  if (!variantId) {
    return cors(Response.json({ error: "Missing variantId" }, { status: 400 }));
  }

  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  const { admin } = await unauthenticated.admin(storeDomain);

  try {
    const response = await admin.graphql(
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

    const json = await response.json();
    if (json.errors?.length) {
      return cors(Response.json({ error: json.errors[0].message }, { status: 400 }));
    }

    const variant = json.data?.productVariant;
    if (!variant) {
      return cors(Response.json({ error: "Variant not found" }, { status: 404 }));
    }

    return cors(
      Response.json({
        id: variant.id,
        availableForSale: Boolean(variant.availableForSale),
        inventoryQuantity: typeof variant.inventoryQuantity === "number" ? variant.inventoryQuantity : null,
      }),
    );
  } catch (err: unknown) {
    console.error("[variant-stock] Error fetching inventory:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return cors(Response.json({ error: message }, { status: 500 }));
  }
}

export async function action({ request }: ActionFunctionArgs) {
  return loader({ request } as LoaderFunctionArgs);
}
