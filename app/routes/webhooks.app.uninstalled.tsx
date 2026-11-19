import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // Unconditionally delete all sessions for the uninstalled shop to prevent retaining stale tokens.
  const normalizedShop = (shop || "").replace(/^https?:\/\//, "").toLowerCase().trim();

  if (normalizedShop) {
    try {
      await db.session.deleteMany({
        where: {
          shop: { in: [normalizedShop, shop] },
        },
      });
      console.log(`Successfully deleted sessions for uninstalled shop: ${normalizedShop}`);
    } catch (error) {
      console.error(`Error deleting sessions for uninstalled shop ${normalizedShop}:`, error);
    }
  }

  return new Response();
};
