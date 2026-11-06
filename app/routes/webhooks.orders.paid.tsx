import type { ActionFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { releasePaymentPendingHold } from "../utils/fulfillmentHoldHelper.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);

  console.log(`[webhooks.orders.paid] Received ${topic} for ${shop}`);

  const orderId = payload?.admin_graphql_api_id || (payload?.id ? `gid://shopify/Order/${payload.id}` : null);

  if (orderId && shop) {
    try {
      const { admin } = await unauthenticated.admin(shop);
      const res = await releasePaymentPendingHold(admin, orderId);
      console.log(`[webhooks.orders.paid] Released hold for ${orderId}:`, res);
    } catch (err) {
      console.error(`[webhooks.orders.paid] Error releasing hold for ${orderId}:`, err);
    }
  }

  return new Response(null, { status: 200 });
};
