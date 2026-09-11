/**
 * bxgyDiscountHelper.server.ts
 * ----------------------------
 * Helper for managing and validating Buy X Get Y (BXGY) discounts during order edits.
 *
 * Ensures that if qualifying "Buy X" products are removed (quantity set to 0) or
 * replaced with another product, any dependent discount applied to Product Y is
 * automatically removed from the order edit session before committing.
 */

export const TAG_PREFIX = "@d2:";

export interface BxgyMetadata {
  code: string;
  buyVariantIds?: string[];
  buyProductIds?: string[];
  buyCollectionIds?: string[];
  minQuantity?: number;
  minAmount?: number;
  getVariantIds?: string[];
  getProductIds?: string[];
  getCollectionIds?: string[];
  getQuantity?: number;
}

export interface DecodedTag {
  checkoutAmount: number;
  productAmount: number;
  orderAmount: number;
  label: string;
  bxgy?: BxgyMetadata;
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/**
 * Decodes the tagged metadata stored in a discount application's description field.
 * Safely handles nested JSON objects (such as BXGY metadata).
 */
export function decodeTag(description?: string | null): DecodedTag | null {
  if (!description || !description.startsWith(TAG_PREFIX)) return null;
  const rest = description.slice(TAG_PREFIX.length).trim();
  if (!rest.startsWith("{")) return null;

  let depth = 0;
  let endIdx = -1;
  for (let i = 0; i < rest.length; i++) {
    if (rest[i] === "{") depth++;
    else if (rest[i] === "}") {
      depth--;
      if (depth === 0) {
        endIdx = i;
        break;
      }
    }
  }
  if (endIdx === -1) return null;

  const rawJson = rest.slice(0, endIdx + 1);
  const label = rest.slice(endIdx + 1).trim();

  try {
    const parsed = JSON.parse(rawJson) as {
      c?: number;
      p?: number;
      o?: number;
      bxgy?: BxgyMetadata;
    };
    return {
      checkoutAmount: parsed.c ?? 0,
      productAmount: parsed.p ?? 0,
      orderAmount: parsed.o ?? 0,
      label,
      bxgy: parsed.bxgy,
    };
  } catch {
    return null;
  }
}

/**
 * Encodes tag metadata into the description field string.
 */
export function encodeTag(tag: DecodedTag): string {
  const payload: Record<string, unknown> = {
    c: round2(tag.checkoutAmount),
    p: round2(tag.productAmount),
    o: round2(tag.orderAmount),
  };
  if (tag.bxgy) {
    payload.bxgy = tag.bxgy;
  }
  const raw = JSON.stringify(payload);
  return `${TAG_PREFIX}${raw} ${tag.label}`.trim();
}

type AdminClient = {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<{
    json: () => Promise<any>;
  }>;
};

interface LineItemNodeForBxgy {
  id: string;
  quantity: number;
  editableQuantity?: number;
  title?: string | null;
  variant?: {
    id: string;
    title?: string | null;
    product?: {
      id: string;
      title?: string | null;
      collections?: { nodes: { id: string }[] } | null;
    } | null;
  } | null;
  originalUnitPriceSet?: { shopMoney?: { amount: string; currencyCode: string } | null } | null;
  calculatedDiscountAllocations?: Array<{
    allocatedAmountSet?: { shopMoney?: { amount: string; currencyCode: string } | null } | null;
    discountApplication?: {
      id: string;
      __typename: string;
      description?: string | null;
      title?: string | null;
    } | null;
  }> | null;
}

/**
 * Checks whether an active line item satisfies a Buy X condition.
 */
function lineItemMatchesBuyX(
  item: LineItemNodeForBxgy,
  buyRule: {
    variantIds: Set<string>;
    productIds: Set<string>;
    collectionIds: Set<string>;
  },
): boolean {
  const variantId = item.variant?.id;
  const productId = item.variant?.product?.id;
  const collectionIds = item.variant?.product?.collections?.nodes?.map((c) => c.id) ?? [];

  if (variantId && buyRule.variantIds.has(variantId)) return true;
  if (productId && buyRule.productIds.has(productId)) return true;
  if (collectionIds.some((id) => buyRule.collectionIds.has(id))) return true;

  return false;
}

/**
 * Looks up a discount code definition by code string to determine if it is a BXGY discount.
 */
export async function getBxgyRuleForCode(
  admin: AdminClient,
  code: string,
): Promise<{
  isBxgy: boolean;
  code: string;
  title: string;
  buyVariantIds: string[];
  buyProductIds: string[];
  buyCollectionIds: string[];
  minQuantity: number;
  minAmount: number;
  getVariantIds: string[];
  getProductIds: string[];
  getCollectionIds: string[];
} | null> {
  try {
    const res = await admin.graphql(
      `#graphql
      query LookupBxgyCode($code: String!) {
        codeDiscountNodeByCode(code: $code) {
          codeDiscount {
            __typename
            ... on DiscountCodeBxgy {
              title
              status
              customerBuys {
                value {
                  ... on DiscountQuantity { quantity }
                  ... on DiscountPurchaseAmount { amount }
                }
                items {
                  __typename
                  ... on DiscountProducts {
                    productVariants(first: 250) { nodes { id } }
                    products(first: 250) { nodes { id } }
                  }
                  ... on DiscountCollections {
                    collections(first: 250) { nodes { id } }
                  }
                }
              }
              customerGets {
                value {
                  ... on DiscountOnQuantity {
                    quantity { quantity }
                    effect {
                      ... on DiscountPercentage { percentage }
                      ... on DiscountAmount { amount { amount currencyCode } }
                    }
                  }
                }
                items {
                  __typename
                  ... on DiscountProducts {
                    productVariants(first: 250) { nodes { id } }
                    products(first: 250) { nodes { id } }
                  }
                  ... on DiscountCollections {
                    collections(first: 250) { nodes { id } }
                  }
                }
              }
            }
          }
        }
      }`,
      { variables: { code: code.trim().toUpperCase() } },
    );
    const json = await res.json();
    const node = json.data?.codeDiscountNodeByCode;
    const discount = node?.codeDiscount;

    if (!discount || discount.__typename !== "DiscountCodeBxgy") {
      return null;
    }

    const buyItems = discount.customerBuys?.items;
    const buyVal = discount.customerBuys?.value;
    const getItems = discount.customerGets?.items;

    const buyVariantIds = (buyItems?.productVariants?.nodes ?? []).map((n: { id: string }) => n.id);
    const buyProductIds = (buyItems?.products?.nodes ?? []).map((n: { id: string }) => n.id);
    const buyCollectionIds = (buyItems?.collections?.nodes ?? []).map((n: { id: string }) => n.id);

    const getVariantIds = (getItems?.productVariants?.nodes ?? []).map((n: { id: string }) => n.id);
    const getProductIds = (getItems?.products?.nodes ?? []).map((n: { id: string }) => n.id);
    const getCollectionIds = (getItems?.collections?.nodes ?? []).map((n: { id: string }) => n.id);

    let minQuantity = 1;
    let minAmount = 0;
    if (buyVal?.quantity) {
      minQuantity = parseInt(String(buyVal.quantity), 10) || 1;
    } else if (buyVal?.amount) {
      minAmount = parseFloat(String(buyVal.amount)) || 0;
    }

    const getQuantity = parseInt(String(discount.customerGets?.value?.quantity?.quantity || 1), 10) || 1;

    return {
      isBxgy: true,
      code: code.trim().toUpperCase(),
      title: discount.title || code,
      buyVariantIds,
      buyProductIds,
      buyCollectionIds,
      minQuantity,
      minAmount,
      getVariantIds,
      getProductIds,
      getCollectionIds,
      getQuantity,
    };
  } catch (err) {
    console.warn("[bxgy] Error resolving discount code:", err);
    return null;
  }
}

/**
 * Scans a CalculatedOrder session to identify any line items with a BXGY discount.
 * If the qualifying "Buy X" product is missing, has 0 quantity, or was replaced,
 * it immediately calls orderEditRemoveDiscount on the discount application.
 */
export async function checkAndRemoveInvalidBxgyDiscounts(
  admin: AdminClient,
  calculatedOrderId: string,
): Promise<{
  removedCount: number;
  removedProducts: string[];
}> {
  // Query all line items in the current calculated order session
  const res = await admin.graphql(
    `#graphql
    query GetCalculatedOrderForBxgy($id: ID!) {
      node(id: $id) {
        ... on CalculatedOrder {
          id
          lineItems(first: 100) {
            nodes {
              id
              quantity
              editableQuantity
              title
              variant {
                id
                title
                product {
                  id
                  title
                  collections(first: 50) { nodes { id } }
                }
              }
              originalUnitPriceSet { shopMoney { amount currencyCode } }
              calculatedDiscountAllocations {
                allocatedAmountSet { shopMoney { amount currencyCode } }
                discountApplication {
                  id
                  __typename
                  description
                }
              }
            }
          }
        }
      }
    }`,
    { variables: { id: calculatedOrderId } },
  );

  const json = await res.json();
  const calculatedOrder = json.data?.node;
  const lineItems: LineItemNodeForBxgy[] = calculatedOrder?.lineItems?.nodes ?? [];

  if (lineItems.length === 0) {
    return { removedCount: 0, removedProducts: [] };
  }

  // Identify active items (items that still have quantity > 0)
  const activeItems = lineItems.filter((item) => {
    const qty = item.editableQuantity ?? item.quantity;
    return qty > 0;
  });

  // Collect all discount applications sitting on line items
  type BxgyCandidate = {
    lineItemId: string;
    lineItemTitle: string;
    discountApplicationId: string;
    rule: {
      code: string;
      buyVariantIds: Set<string>;
      buyProductIds: Set<string>;
      buyCollectionIds: Set<string>;
      minQuantity: number;
      minAmount: number;
      getQuantity: number;
    };
  };

  const candidates: BxgyCandidate[] = [];

  for (const item of activeItems) {
    const allocations = item.calculatedDiscountAllocations ?? [];
    for (const alloc of allocations) {
      const app = alloc.discountApplication;
      if (!app) continue;

      // 1. Check if the app description contains our encoded BXGY tag
      const decoded = decodeTag(app.description);
      if (decoded?.bxgy) {
        candidates.push({
          lineItemId: item.id,
          lineItemTitle: item.variant?.product?.title || item.title || "Product",
          discountApplicationId: app.id,
          rule: {
            code: decoded.bxgy.code,
            buyVariantIds: new Set(decoded.bxgy.buyVariantIds ?? []),
            buyProductIds: new Set(decoded.bxgy.buyProductIds ?? []),
            buyCollectionIds: new Set(decoded.bxgy.buyCollectionIds ?? []),
            minQuantity: decoded.bxgy.minQuantity ?? 1,
            minAmount: decoded.bxgy.minAmount ?? 0,
            getQuantity: decoded.bxgy.getQuantity ?? 1,
          },
        });
        continue;
      }

      // 2. Check if the description or title corresponds to a known BXGY discount code (e.g. checkout-applied)
      const potentialCode = (app.description || "").trim();
      if (potentialCode && !potentialCode.startsWith(TAG_PREFIX)) {
        const bxgyRule = await getBxgyRuleForCode(admin, potentialCode);
        if (bxgyRule) {
          candidates.push({
            lineItemId: item.id,
            lineItemTitle: item.variant?.product?.title || item.title || "Product",
            discountApplicationId: app.id,
            rule: {
              code: bxgyRule.code,
              buyVariantIds: new Set(bxgyRule.buyVariantIds),
              buyProductIds: new Set(bxgyRule.buyProductIds),
              buyCollectionIds: new Set(bxgyRule.buyCollectionIds),
              minQuantity: bxgyRule.minQuantity,
              minAmount: bxgyRule.minAmount,
              getQuantity: bxgyRule.getQuantity ?? 1,
            },
          });
        }
      }
    }
  }

  if (candidates.length === 0) {
    return { removedCount: 0, removedProducts: [] };
  }

  let removedCount = 0;
  const removedProducts: string[] = [];

  for (const candidate of candidates) {
    // Check if the required "Buy X" condition is met among the active line items
    // If the discounted item Y is the SAME as X, active quantity on that item must exceed the discounted portion.
    let totalMatchingQty = 0;
    let totalMatchingAmt = 0;
    const getQty = candidate.rule.getQuantity || 1;

    for (const activeItem of activeItems) {
      if (lineItemMatchesBuyX(activeItem, candidate.rule)) {
        const itemQty = activeItem.editableQuantity ?? activeItem.quantity;
        const itemPrice = parseFloat(activeItem.originalUnitPriceSet?.shopMoney?.amount ?? "0");

        if (activeItem.id === candidate.lineItemId) {
          // Same product for both X and Y: must have extra units beyond the free/discounted units
          if (itemQty > getQty) {
            totalMatchingQty += (itemQty - getQty);
            totalMatchingAmt += itemPrice * (itemQty - getQty);
          }
        } else {
          totalMatchingQty += itemQty;
          totalMatchingAmt += itemPrice * itemQty;
        }
      }
    }

    const hasRequiredQty = totalMatchingQty >= candidate.rule.minQuantity;
    const hasRequiredAmt = candidate.rule.minAmount <= 0 || totalMatchingAmt >= candidate.rule.minAmount;

    // If Product X is removed or active quantity is below required, remove discount from Y
    if (!hasRequiredQty || !hasRequiredAmt) {
      console.log(
        `[bxgy] Removing BXGY discount "${candidate.rule.code}" from "${candidate.lineItemTitle}" (ID: ${candidate.lineItemId}) ` +
          `because qualifying Product X was removed or replaced (found matching qty: ${totalMatchingQty}, required: ${candidate.rule.minQuantity}).`,
      );

      const removeRes = await admin.graphql(
        `#graphql
        mutation RemoveInvalidBxgyDiscount($id: ID!, $discountApplicationId: ID!) {
          orderEditRemoveDiscount(id: $id, discountApplicationId: $discountApplicationId) {
            calculatedOrder { id }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            id: calculatedOrderId,
            discountApplicationId: candidate.discountApplicationId,
          },
        },
      );

      const removeJson = await removeRes.json();
      const errors = removeJson.data?.orderEditRemoveDiscount?.userErrors ?? [];
      if (errors.length) {
        console.warn(`[bxgy] Failed to remove discount application ${candidate.discountApplicationId}:`, errors);
      } else {
        removedCount++;
        removedProducts.push(candidate.lineItemTitle);
      }
    }
  }

  return { removedCount, removedProducts };
}
