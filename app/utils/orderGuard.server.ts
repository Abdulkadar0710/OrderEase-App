import db from "../db.server";
import { checkOrderEditLimit } from "./editLimitHelper.server";

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
): number {
  if (!record || !record.timeLimit) return 60 * 60 * 1000; // default 1 hour
  const preset = record.timeLimit;
  if (preset === "15m") return 15 * 60 * 1000;
  if (preset === "30m") return 30 * 60 * 1000;
  if (preset === "1h") return 60 * 60 * 1000;
  if (preset === "2h") return 2 * 60 * 60 * 1000;
  if (preset === "1d") return 24 * 60 * 60 * 1000;
  if (preset === "2d") return 48 * 60 * 60 * 1000;
  if (preset === "custom") {
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
 * 1. Existence: Verifies order exists in Shopify.
 * 2. Ownership: Verifies order belongs to the authenticated customer (sessionToken.sub).
 * 3. Cancellation: Rejects if order has already been cancelled.
 * 4. Fulfillment: Rejects if order is already fulfilled or shipped.
 * 5. Time Window: Rejects if order creation time exceeds merchant's configured time limit.
 * 6. Edit Limits: Rejects if order edit count exceeds merchant's max edits limit.
 */
export async function validateOrderEditable({
  admin,
  shop,
  orderId,
  customerAccountId,
  checkFulfillment = true,
  checkCancellation = true,
  checkTimeLimit = true,
  checkEditLimit = true,
}: ValidateOrderOptions): Promise<OrderGuardResult> {
  if (!orderId) {
    return { allowed: false, status: 400, message: "Missing order ID." };
  }

  const normalizedOrderId = orderId.includes("gid://shopify/Order/")
    ? orderId
    : `gid://shopify/Order/${orderId}`;

  // 1. Fetch order details from Shopify Admin GraphQL
  try {
    const res = await admin.graphql(ORDER_GUARD_QUERY, {
      variables: { id: normalizedOrderId },
    });
    const json = (await res.json()) as any;
    const order = json.data?.order as GuardedOrder | null | undefined;

    if (!order) {
      return { allowed: false, status: 404, message: "Order not found." };
    }

    // 2. CHECK: Ownership
    if (!isCustomerAuthorized(order.customer?.id, customerAccountId)) {
      return {
        allowed: false,
        status: 403,
        message: "You are not authorized to modify this order.",
      };
    }

    // 3. CHECK: Cancellation status
    if (checkCancellation && order.cancelledAt) {
      return {
        allowed: false,
        status: 422,
        message: "This order has already been cancelled and cannot be modified.",
      };
    }

    // 4. CHECK: Fulfillment status
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

    // 5. CHECK: Server-side Time Window
    if (checkTimeLimit && order.createdAt) {
      const timeLimitRecord = await db.orderEditTimeLimit.findUnique({
        where: { shop },
      });
      const limitMs = getTimeLimitInMs(timeLimitRecord);

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

    // 6. CHECK: Max Edits Limit
    if (checkEditLimit) {
      const editLimitCheck = await checkOrderEditLimit({
        shop,
        orderId: normalizedOrderId,
      });
      if (editLimitCheck.isLimitReached) {
        return {
          allowed: false,
          status: 422,
          message: `You have reached the maximum allowed edits (${editLimitCheck.maxEdits} edits) for this order.`,
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
