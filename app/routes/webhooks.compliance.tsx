import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

/**
 * Handles Shopify mandatory GDPR compliance webhooks:
 * - customers/data_request
 * - customers/redact
 * - shop/redact
 */
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);
  const normalizedTopic = topic.toUpperCase().replace(/\//g, "_");

  if (normalizedTopic === "SHOP_REDACT") {
    const shopVariants = Array.from(new Set([shop, shop.toLowerCase().trim()]));
    const shopFilter = { where: { shop: { in: shopVariants } } };

    await db.$transaction([
      db.session.deleteMany(shopFilter),
      db.serviceSettings.deleteMany(shopFilter),
      db.orderEditTimeLimit.deleteMany(shopFilter),
      db.googlePlacesConfig.deleteMany(shopFilter),
      db.editedOrder.deleteMany(shopFilter),
      db.featureUsage.deleteMany(shopFilter),
    ]);

    return new Response(null, { status: 200 });
  }

  if (
    normalizedTopic === "CUSTOMERS_DATA_REQUEST" ||
    normalizedTopic === "CUSTOMERS_REDACT"
  ) {
    // No customer PII tables are persisted in Prisma; only order-level edit counts exist.
    return new Response(null, { status: 200 });
  }

  return new Response(null, { status: 400 });
};
