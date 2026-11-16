import db from "../db.server";
import {
  PLANS,
  getPlan,
  getRequiredPlanForService,
  isServiceAllowedOnPlan,
  type PlanDefinition,
} from "../config/plans";

export interface MonthlyQuotaInfo {
  plan: PlanDefinition;
  usedCount: number;
  limit: number | null;
  isExceeded: boolean;
  remaining: number | null;
}

/**
 * Normalizes shop domain string.
 */
export function normalizeShop(shop: string): string {
  return shop
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase()
    .trim();
}

/**
 * Retrieves the merchant's current active plan definition from SQLite DB.
 * If no subscription record exists, auto-creates a record with "free".
 */
export async function getMerchantPlan(shopRaw: string): Promise<PlanDefinition> {
  const shop = normalizeShop(shopRaw);
  if (!shop) return PLANS.free;

  let sub = await db.merchantSubscription.findUnique({
    where: { shop },
  });

  if (!sub) {
    try {
      sub = await db.merchantSubscription.create({
        data: {
          shop,
          planId: "free",
          billingCycle: "monthly",
        },
      });
    } catch (e) {
      // In case of concurrent creation, re-fetch
      sub = await db.merchantSubscription.findUnique({ where: { shop } });
    }
  }

  return getPlan(sub?.planId || "free");
}

/**
 * Calculates current month's edited order usage and verifies if monthly quota is exceeded.
 */
export async function getMonthlyQuotaStatus(shopRaw: string): Promise<MonthlyQuotaInfo> {
  const shop = normalizeShop(shopRaw);
  const plan = await getMerchantPlan(shop);

  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  const usedCount = await db.editedOrder.count({
    where: {
      shop,
      createdAt: { gte: startOfMonth },
    },
  });

  if (plan.monthlyOrderLimit === null) {
    return {
      plan,
      usedCount,
      limit: null,
      isExceeded: false,
      remaining: null,
    };
  }

  const isExceeded = usedCount >= plan.monthlyOrderLimit;
  const remaining = Math.max(0, plan.monthlyOrderLimit - usedCount);

  return {
    plan,
    usedCount,
    limit: plan.monthlyOrderLimit,
    isExceeded,
    remaining,
  };
}

/**
 * Validates whether a store can execute a specific service action based on their plan and quota.
 */
export async function canPerformService(
  shopRaw: string,
  serviceId: string,
): Promise<{
  allowed: boolean;
  reason?: string;
  requiredPlan?: PlanDefinition;
}> {
  const shop = normalizeShop(shopRaw);
  const plan = await getMerchantPlan(shop);

  // 1. Check if plan permits this service
  if (!isServiceAllowedOnPlan(plan.id, serviceId)) {
    const requiredPlan = getRequiredPlanForService(serviceId);
    return {
      allowed: false,
      reason: `This feature is not available on the ${plan.name} plan. Please upgrade to ${requiredPlan.name} ($${requiredPlan.monthlyPrice}/mo) to access it.`,
      requiredPlan,
    };
  }

  // 2. Check if monthly order quota is exceeded
  const quota = await getMonthlyQuotaStatus(shop);
  if (quota.isExceeded) {
    return {
      allowed: false,
      reason: `Your store has reached its monthly edit limit of ${quota.limit} orders on the ${plan.name} plan. Please upgrade your plan to continue editing orders.`,
      requiredPlan: plan.id === "free" ? PLANS.starter : plan.id === "starter" ? PLANS.growth : PLANS.pro,
    };
  }

  return { allowed: true };
}
