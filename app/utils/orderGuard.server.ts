import db from "../db.server";
import { checkOrderEditLimit } from "./editLimitHelper.server";
import { getMerchantPlan, getMonthlyQuotaStatus, normalizeShop } from "./planHelper.server";

export interface AdminGraphQL {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
}

export interface ValidateOrderOptions {
  admin: AdminGraphQL;
  shop: string;
  orderId: string;
  customerAccountId: string; // sessionToken.sub
  checkFulfillment?: boolean; // defaults to true
  checkCancellation?: boolean; // defaults to true
  checkTimeLimit?: boolean; // defaults to true
  checkEditLimit?: boolean; // defaults to true
  requiredServiceId?: string | string[]; // optional ServiceSettings feature toggle(s) required
}

/**
 * Checks whether at least one of the specified merchant ServiceSettings features
 * is enabled for the shop AND allowed under the merchant's active plan.
 */
export async function isServiceEnabled(
  shop: string,
  serviceId: string | string[],
): Promise<boolean> {
  const ids = Array.isArray(serviceId) ? serviceId : [serviceId];
  if (ids.length === 0) return false;
  const normalizedShop = normalizeShop(shop);
  if (!normalizedShop) return false;

  // 1. Verify merchant's active plan and monthly quota
  const plan = await getMerchantPlan(normalizedShop);
  const quota = await getMonthlyQuotaStatus(normalizedShop);

  if (quota.isExceeded) {
    return false;
  }

  // 2. Filter requested ids by allowedServices for this plan
  const planAllowedIds = ids.filter((id) => plan.allowedServices.includes(id));
  if (planAllowedIds.length === 0) {
    return false;
  }

  // 3. Check if enabled in merchant's ServiceSettings
  const row = await db.serviceSettings.findFirst({
    where: {
      shop: normalizedShop,
      id: { in: planAllowedIds },
      enabled: true,
    },
    select: { id: true },
  });
  return Boolean(row);
}

export interface GuardedOrder {
  id: string;
  name?: string;
  createdAt: string;
  cancelledAt: string | null;
  displayFulfillmentStatus: string;
  displayFinancialStatus?: string;
  customer?: { id: string } | null;
}

export type OrderGuardResult =
  | { allowed: true; order: GuardedOrder }
  | { allowed: false; status: number; message: string };

/**
 * Extracts trailing numeric ID from a Shopify GID or raw ID string.
 */
export function extractNumericId(id?: string | null): string | null {
  if (!id) return null;
  const match = id.match(/\d+$/);
  return match ? match[0] : id;
}

/**
 * Checks if a session customer ID matches the order owner customer ID.
 */
export function isCustomerAuthorized(
  orderCustomerId?: string | null,
  sessionCustomerId?: string | null,
): boolean {
  if (!orderCustomerId || !sessionCustomerId) return false;
  if (orderCustomerId === sessionCustomerId) return true;
  const num1 = extractNumericId(orderCustomerId);
  const num2 = extractNumericId(sessionCustomerId);
  return Boolean(num1 && num2 && num1 === num2);
}

/**
 * Calculates merchant's configured edit time limit in milliseconds.
 */
export function getTimeLimitInMs(
  record?: {
    timeLimit?: string | null;
    customValue?: number | null;
    customUnit?: string | null;
  } | null,
  planId: string = "free",
): number {
  // Free plan is strictly 1 hour
  if (planId === "free") {
    return 60 * 60 * 1000;
  }

  if (!record || !record.timeLimit) return 60 * 60 * 1000; // default 1 hour
  const preset = record.timeLimit;
  if (preset === "15m") return 15 * 60 * 1000;
  if (preset === "30m") return 30 * 60 * 1000;
  if (preset === "1h") return 60 * 60 * 1000;
  if (preset === "2h") return 2 * 60 * 60 * 1000;
  if (preset === "1d") return 24 * 60 * 60 * 1000;
  if (preset === "2d") return 48 * 60 * 60 * 1000;

  if (preset === "custom") {
    // Only Pro plan allows custom durations; fall back to 1h otherwise
    if (planId !== "pro") {
      return 60 * 60 * 1000;
    }
    const val = Number(record.customValue) || 1;
    if (record.customUnit === "minutes") return val * 60 * 1000;
    if (record.customUnit === "hours") return val * 60 * 60 * 1000;
    if (record.customUnit === "days") return val * 24 * 60 * 60 * 1000;
    return val * 60 * 60 * 1000;
  }
  return 60 * 60 * 1000;
}

const ORDER_GUARD_QUERY = `#graphql
  query GetOrderForGuard($id: ID!) {
    order(id: $id) {
      id
      name
      createdAt
      cancelledAt
      displayFulfillmentStatus
      displayFinancialStatus
      customer {
        id
      }
    }
  }
`;

/**
 * Centralized server-side guard to validate that an order can be edited or cancelled.
 *
 * Checks performed:
 * 1. Plan & Service Eligibility: Verifies store plan allows the requested service.
 * 2. Monthly Quota: Verifies store has not exceeded its monthly edited orders quota.
 * 3. Existence: Verifies order exists in Shopify.
 * 4. Ownership: Verifies order belongs to the authenticated customer (sessionToken.sub).
 * 5. Cancellation: Rejects if order has already been cancelled.
 * 6. Fulfillment: Rejects if order is already fulfilled or shipped.
 * 7. Time Window: Rejects if order creation time exceeds merchant's configured (or plan-enforced) time limit.
 * 8. Edit Limits: Rejects if order edit count exceeds merchant's max edits limit (enforced 3 on Free).
 */
export async function validateOrderEditable({
  admin,
  shop: rawShop,
  orderId,
  customerAccountId,
  checkFulfillment = true,
  checkCancellation = true,
  checkTimeLimit = true,
  checkEditLimit = true,
  requiredServiceId,
}: ValidateOrderOptions): Promise<OrderGuardResult> {
  if (!orderId) {
    return { allowed: false, status: 400, message: "Missing order ID." };
  }

  const shop = normalizeShop(rawShop);

  // 1. Plan & Service Eligibility Check
  if (requiredServiceId) {
    const enabled = await isServiceEnabled(shop, requiredServiceId);
    if (!enabled) {
      return {
        allowed: false,
        status: 403,
        message: "This feature is not enabled or not included in the store's current plan.",
      };
    }
  }

  const plan = await getMerchantPlan(shop);
  const normalizedOrderId = orderId.includes("gid://shopify/Order/")
    ? orderId
    : `gid://shopify/Order/${orderId}`;

  // 2. Fetch order details from Shopify Admin GraphQL
  try {
    const res = await admin.graphql(ORDER_GUARD_QUERY, {
      variables: { id: normalizedOrderId },
    });
    const json = (await res.json()) as any;
    const order = json.data?.order as GuardedOrder | null | undefined;

    if (!order) {
      return { allowed: false, status: 404, message: "Order not found." };
    }

    // 3. CHECK: Ownership
    if (!isCustomerAuthorized(order.customer?.id, customerAccountId)) {
      return {
        allowed: false,
        status: 403,
        message: "You are not authorized to modify this order.",
      };
    }

    // 4. CHECK: Cancellation status
    if (checkCancellation && order.cancelledAt) {
      return {
        allowed: false,
        status: 422,
        message: "This order has already been cancelled and cannot be modified.",
      };
    }

    // 5. CHECK: Fulfillment status
    // Only UNFULFILLED or ON_HOLD can be modified/cancelled by customers
    if (
      checkFulfillment &&
      order.displayFulfillmentStatus &&
      order.displayFulfillmentStatus !== "UNFULFILLED" &&
      order.displayFulfillmentStatus !== "ON_HOLD"
    ) {
      return {
        allowed: false,
        status: 422,
        message:
          "This order has already been processed or shipped and can no longer be modified.",
      };
    }

    // 6. CHECK: Server-side Time Window (strictly 1 hour on Free)
    if (checkTimeLimit && order.createdAt) {
      const timeLimitRecord = await db.orderEditTimeLimit.findUnique({
        where: { shop },
      });
      const limitMs = getTimeLimitInMs(timeLimitRecord, plan.id);

      if (limitMs > 0) {
        const orderCreatedTime = new Date(order.createdAt).getTime();
        if (Date.now() > orderCreatedTime + limitMs) {
          return {
            allowed: false,
            status: 422,
            message: "The time limit to edit this order has expired.",
          };
        }
      }
    }

    // 7. CHECK: Max Edits Limit (strictly 3 edits on Free)
    if (checkEditLimit) {
      const editLimitCheck = await checkOrderEditLimit({
        shop,
        orderId: normalizedOrderId,
      });
      if (editLimitCheck.isLimitReached) {
        const msg = editLimitCheck.quotaExceeded
          ? (editLimitCheck.quotaMessage || "This store has reached its monthly order edit quota.")
          : `You have reached the maximum allowed edits (${editLimitCheck.maxEdits} edits) for this order.`;
        return {
          allowed: false,
          status: 422,
          message: msg,
        };
      }
    }

    return { allowed: true, order };
  } catch (err: unknown) {
    console.error("[validateOrderEditable] Error:", err);
    return {
      allowed: false,
      status: 500,
      message:
        err instanceof Error ? err.message : "Error validating order access.",
    };
  }
}
