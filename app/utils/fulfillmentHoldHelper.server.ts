/**
 * fulfillmentHoldHelper.server.ts
 *
 * Helper to apply a fulfillment hold and attach the "Payment-Pending" tag
 * to an order whenever an order edit creates an unpaid balance due (balanceDue > 0).
 */

import { addOrderTags } from "./orderTagsHelper.server";

export interface AdminGraphQL {
  graphql: (
    query: string,
    options?: { variables?: Record<string, unknown> },
  ) => Promise<Response>;
}

export const TAG_PAYMENT_PENDING = "Payment-Pending";

const GET_FULFILLMENT_ORDERS_QUERY = `#graphql
  query GetOrderFulfillmentOrders($id: ID!) {
    order(id: $id) {
      id
      fulfillmentOrders(first: 10) {
        nodes {
          id
          status
          supportedActions {
            action
          }
        }
      }
    }
  }
`;

const FULFILLMENT_ORDER_HOLD_MUTATION = `#graphql
  mutation FulfillmentOrderHold($id: ID!, $fulfillmentHold: FulfillmentOrderHoldInput!) {
    fulfillmentOrderHold(id: $id, fulfillmentHold: $fulfillmentHold) {
      fulfillmentOrder {
        id
        status
      }
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Places open fulfillment orders on hold with reason AWAITING_PAYMENT,
 * and attaches the "Payment-Pending" tag to the order.
 *
 * @param admin Shopify Admin GraphQL client
 * @param orderId GID of the order (e.g. "gid://shopify/Order/123")
 */
export async function applyPaymentPendingHold(
  admin: AdminGraphQL,
  orderId: string,
): Promise<{ success: boolean; holdsApplied: number; errors: string[] }> {
  const normalizedOrderId = orderId.includes("gid://shopify/Order/")
    ? orderId
    : `gid://shopify/Order/${orderId}`;

  const errors: string[] = [];
  let holdsApplied = 0;

  try {
    // 1. Add "Payment-Pending" tag (also preserves existing tags and "Order-Updated")
    await addOrderTags(admin, normalizedOrderId, false, [TAG_PAYMENT_PENDING]);
  } catch (tagErr) {
    console.error("[applyPaymentPendingHold] Error tagging order:", tagErr);
    errors.push(
      tagErr instanceof Error
        ? tagErr.message
        : "Failed to add Payment-Pending tag",
    );
  }

  try {
    // 2. Fetch fulfillment orders for this order
    const foRes = await admin.graphql(GET_FULFILLMENT_ORDERS_QUERY, {
      variables: { id: normalizedOrderId },
    });
    const foJson = (await foRes.json()) as any;
    if (foJson.errors?.length) {
      console.warn(
        "[applyPaymentPendingHold] GraphQL errors fetching fulfillment orders:",
        foJson.errors,
      );
      errors.push(foJson.errors[0]?.message || "GraphQL error on fulfillmentOrders query");
    }
    const fulfillmentOrders =
      foJson.data?.order?.fulfillmentOrders?.nodes ?? [];

    // 3. For each open fulfillment order that can be placed on hold, call fulfillmentOrderHold
    for (const fo of fulfillmentOrders) {
      // If already on hold, skip
      if (fo.status === "ON_HOLD") continue;

      // Check if HOLD action is supported or status is OPEN / SCHEDULED
      const canHold =
        fo.supportedActions?.some(
          (a: { action: string }) => a.action === "HOLD",
        ) ||
        fo.status === "OPEN" ||
        fo.status === "SCHEDULED";

      if (!canHold) continue;

      try {
        const holdRes = await admin.graphql(FULFILLMENT_ORDER_HOLD_MUTATION, {
          variables: {
            id: fo.id,
            fulfillmentHold: {
              reason: "AWAITING_PAYMENT",
              reasonNotes:
                "Order edit created an unpaid balance due. Awaiting customer invoice payment.",
              notifyMerchant: false,
            },
          },
        });
        const holdJson = (await holdRes.json()) as any;
        const userErrors =
          holdJson.data?.fulfillmentOrderHold?.userErrors ?? [];

        if (userErrors.length > 0) {
          console.warn(
            `[applyPaymentPendingHold] Fulfillment hold errors on ${fo.id}:`,
            userErrors,
          );
          errors.push(userErrors.map((e: any) => e.message).join(", "));
        } else {
          holdsApplied++;
        }
      } catch (holdErr) {
        console.error(
          `[applyPaymentPendingHold] Failed to hold fulfillment order ${fo.id}:`,
          holdErr,
        );
        errors.push(
          holdErr instanceof Error
            ? holdErr.message
            : `Failed to hold FO ${fo.id}`,
        );
      }
    }
  } catch (err) {
    console.error(
      "[applyPaymentPendingHold] Error fetching fulfillment orders:",
      err,
    );
    errors.push(
      err instanceof Error ? err.message : "Error fetching fulfillment orders",
    );
  }

  return {
    success: errors.length === 0,
    holdsApplied,
    errors,
  };
}

const RELEASE_FULFILLMENT_ORDER_HOLD_MUTATION = `#graphql
  mutation ReleaseFulfillmentOrderHold($id: ID!) {
    fulfillmentOrderReleaseHold(id: $id) {
      fulfillmentOrder {
        id
        status
        requestStatus
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const REMOVE_TAGS_MUTATION = `#graphql
  mutation RemoveOrderTags($id: ID!, $tags: [String!]!) {
    tagsRemove(id: $id, tags: $tags) {
      userErrors {
        field
        message
      }
    }
  }
`;

/**
 * Releases any open fulfillment holds and removes the "Payment-Pending" tag
 * once the order is fully paid.
 *
 * @param admin Shopify Admin GraphQL client
 * @param orderId GID of the order (e.g. "gid://shopify/Order/123")
 */
export async function releasePaymentPendingHold(
  admin: AdminGraphQL,
  orderId: string,
): Promise<{ success: boolean; holdsReleased: number; errors: string[] }> {
  const normalizedOrderId = orderId.includes("gid://shopify/Order/")
    ? orderId
    : `gid://shopify/Order/${orderId}`;

  const errors: string[] = [];
  let holdsReleased = 0;

  try {
    // 1. Remove "Payment-Pending" tag
    await admin.graphql(REMOVE_TAGS_MUTATION, {
      variables: {
        id: normalizedOrderId,
        tags: [TAG_PAYMENT_PENDING],
      },
    });
  } catch (tagErr) {
    console.error("[releasePaymentPendingHold] Error removing tag:", tagErr);
    errors.push(
      tagErr instanceof Error ? tagErr.message : "Error removing tag",
    );
  }

  try {
    // 2. Fetch fulfillment orders for this order
    const foRes = await admin.graphql(GET_FULFILLMENT_ORDERS_QUERY, {
      variables: { id: normalizedOrderId },
    });
    const foJson = (await foRes.json()) as any;
    const fulfillmentOrders =
      foJson.data?.order?.fulfillmentOrders?.nodes ?? [];

    // 3. Release hold on each held fulfillment order
    for (const fo of fulfillmentOrders) {
      if (fo.status !== "ON_HOLD") continue;

      try {
        const relRes = await admin.graphql(
          RELEASE_FULFILLMENT_ORDER_HOLD_MUTATION,
          { variables: { id: fo.id } },
        );
        const relJson = (await relRes.json()) as any;
        const userErrors =
          relJson.data?.fulfillmentOrderReleaseHold?.userErrors ?? [];

        if (userErrors.length > 0) {
          console.warn(
            `[releasePaymentPendingHold] Errors releasing FO ${fo.id}:`,
            userErrors,
          );
          errors.push(userErrors.map((e: any) => e.message).join(", "));
        } else {
          holdsReleased++;
        }
      } catch (relErr) {
        console.error(
          `[releasePaymentPendingHold] Failed releasing FO ${fo.id}:`,
          relErr,
        );
        errors.push(
          relErr instanceof Error
            ? relErr.message
            : `Failed releasing FO ${fo.id}`,
        );
      }
    }
  } catch (err) {
    console.error(
      "[releasePaymentPendingHold] Error fetching fulfillment orders:",
      err,
    );
    errors.push(
      err instanceof Error ? err.message : "Error fetching fulfillment orders",
    );
  }

  return {
    success: errors.length === 0,
    holdsReleased,
    errors,
  };
}
