import db from "../db.server";
import { getMerchantPlan, getMonthlyQuotaStatus, normalizeShop } from "./planHelper.server";

/**
 * Checks whether an order has reached the maximum allowed edit limit set by the merchant
 * or if the merchant has exceeded their plan's monthly order quota.
 *
 * @param shop The merchant shop domain (e.g. store.myshopify.com)
 * @param orderId Shopify Order GID or raw ID
 */
export async function checkOrderEditLimit({
  shop: rawShop,
  orderId,
}: {
  shop: string;
  orderId: string;
}): Promise<{
  isLimitReached: boolean;
  currentEditCount: number;
  maxEdits: number | null;
  quotaExceeded?: boolean;
  quotaMessage?: string;
}> {
  const shop = normalizeShop(rawShop);
  if (!shop || !orderId) {
    return { isLimitReached: false, currentEditCount: 0, maxEdits: null };
  }

  // Robust order ID normalization across OrderIdentity GID, Order GID, and raw numeric ID
  const numericMatch = String(orderId).match(/\d+/);
  const rawId = numericMatch ? numericMatch[0] : String(orderId).replace(/^gid:\/\/shopify\/Order\//, "");
  const standardGid = `gid://shopify/Order/${rawId}`;
  const identityGid = `gid://shopify/OrderIdentity/${rawId}`;
  const orderIdVariants = Array.from(new Set([standardGid, identityGid, rawId, String(orderId)]));

  // 1. Fetch merchant's active plan
  const plan = await getMerchantPlan(shop);

  // 2. Check if shop exceeded their monthly order quota
  const quota = await getMonthlyQuotaStatus(shop);
  if (quota.isExceeded) {
    // Check if this specific order was already counted this month
    const existingEditForOrder = await db.editedOrder.findFirst({
      where: {
        shop,
        orderId: { in: orderIdVariants },
      },
    });

    // If order was never edited yet and quota is full, block edits
    if (!existingEditForOrder) {
      return {
        isLimitReached: true,
        currentEditCount: 0,
        maxEdits: plan.id === "free" ? 3 : null,
        quotaExceeded: true,
        quotaMessage: `This store has reached its monthly order edit quota (${quota.limit} orders) on the ${plan.name} plan.`,
      };
    }
  }

  // 3. Determine max edits allowed per order
  let maxEdits: number | null = 3;

  if (plan.id === "free") {
    // Free plan is strictly locked to 3 edits per order
    maxEdits = 3;
  } else if (plan.id === "pro") {
    // Pro plan provides Unlimited edited orders by default
    const timeLimitRecord = await db.orderEditTimeLimit.findUnique({
      where: { shop },
    });
    // On Pro: if merchant explicitly configured a custom limit (e.g. 5, 10), respect it; otherwise Unlimited (null)
    if (
      timeLimitRecord &&
      typeof timeLimitRecord.maxEdits === "number" &&
      timeLimitRecord.maxEdits > 0 &&
      timeLimitRecord.maxEdits !== 3
    ) {
      maxEdits = timeLimitRecord.maxEdits;
    } else {
      maxEdits = null; // Unlimited on Pro
    }
  } else {
    // Starter & Growth: configurable (default to 3 if unset; <= 0 is unlimited)
    const timeLimitRecord = await db.orderEditTimeLimit.findUnique({
      where: { shop },
    });
    maxEdits = timeLimitRecord ? timeLimitRecord.maxEdits : 3;
    if (maxEdits !== null && maxEdits <= 0) {
      maxEdits = null; // Unlimited
    }
  }

  // 4. Count existing edit events recorded in EditedOrder table for this specific order
  const currentEditCount = await db.editedOrder.count({
    where: {
      shop,
      orderId: { in: orderIdVariants },
    },
  });

  const isLimitReached = maxEdits !== null && currentEditCount >= maxEdits;

  return {
    isLimitReached,
    currentEditCount,
    maxEdits,
    quotaExceeded: false,
  };
}
