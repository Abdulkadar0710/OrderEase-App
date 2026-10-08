import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { trackOrderEdit } from "../utils/analyticsHelper.server";
import { checkOrderEditLimit } from "../utils/editLimitHelper.server";
import {
  TAG_PREFIX,
  round2,
  decodeTag,
  encodeTag,
  type DecodedTag,
  type BxgyMetadata,
} from "../utils/bxgyDiscountHelper.server";
import { persistFreeShippingCode } from "../utils/freeShippingHelper.server";

/**
 * api.order.discount8.tsx
 * -----------------------
 * Discount application endpoint for the customer-account order-edit flow.
 *
 * Supported Discount Code Scenarios:
 *  1. "Amount off products" (DiscountCodeBasic targeting specific items/collections) - Allowed.
 *  2. "Buy X Get Y" (DiscountCodeBxgy) - Allowed.
 *     - Requires qualifying Buy X items in the order.
 *     - Applies discount to promotional Get Y item(s).
 *     - Stamped with BXGY metadata tag so if Product X is subsequently removed or replaced,
 *       the discount on Product Y is automatically removed.
 *  3. "Free shipping" (DiscountCodeFreeShipping) - Allowed.
 *     - Validates minimum order subtotal and/or quantity.
 *     - Replaces existing shipping line with a $0 shipping line.
 *  4. "Amount off order" (DiscountCodeBasic with AllDiscountItems / order-wide) - DISALLOWED.
 *     - Rejected with explicit message: `"${code}" is an order-level discount code. Only product-level discount codes can be applied here.`
 */

type Money = { amount: string; currencyCode: string };

export interface DiscountCombinesWith {
  orderDiscounts: boolean;
  productDiscounts: boolean;
  shippingDiscounts: boolean;
}

type DiscountApplicationNode = {
  id: string;
  __typename: string;
  description?: string | null;
  targetSelection?: string | null;
  appliedTo?: "LINE" | "ORDER" | string | null;
  code?: string | null;
};

type AllocationNode = {
  allocatedAmountSet?: { shopMoney: Money } | null;
  discountApplication?: DiscountApplicationNode | null;
};

type LineItemNode = {
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
  originalUnitPriceSet?: { shopMoney: Money } | null;
  calculatedDiscountAllocations?: AllocationNode[] | null;
};

type ShippingLineNode = {
  id: string;
  title?: string | null;
  price?: {
    shopMoney?: {
      amount: string;
      currencyCode: string;
    } | null;
  } | null;
};

/** Best available display name for a line item, for warning/summary messages. */
function lineItemDisplayName(item: LineItemNode): string {
  const productTitle = item.variant?.product?.title || item.title || "this product";
  const variantTitle = item.variant?.title;
  if (variantTitle && variantTitle !== "Default Title") {
    return `${productTitle} (${variantTitle})`;
  }
  return productTitle;
}

const APP_ORIGIN_TYPENAME = "ManualDiscountApplication";

/** Resolves a line item's current discount picture, regardless of origin. */
function readLineItemDiscountState(item: LineItemNode): {
  currencyCode: string;
  existingApplicationId: string | null;
  /** True only when the existing application is one THIS app created (and can therefore safely remove/replace). */
  existingIsOurs: boolean;
  /**
   * True only when there's a discount on this line item that we must leave
   * completely alone — a checkout-origin discount that specifically
   * targets this product (or another product-scoped selection).
   */
  blocked: boolean;
  tag: DecodedTag;
} {
  const allocations = item.calculatedDiscountAllocations ?? [];
  const currencyCode = item.originalUnitPriceSet?.shopMoney?.currencyCode ?? "";

  if (allocations.length === 0) {
    return {
      currencyCode,
      existingApplicationId: null,
      existingIsOurs: false,
      blocked: false,
      tag: { checkoutAmount: 0, productAmount: 0, orderAmount: 0, label: "" },
    };
  }

  let existingApplicationId: string | null = null;
  let existingIsOurs = false;
  let blocked = false;
  let tag: DecodedTag = { checkoutAmount: 0, productAmount: 0, orderAmount: 0, label: "" };
  let resolvedCurrency = currencyCode;

  for (const allocation of allocations) {
    const app = allocation.discountApplication;
    if (!app) continue;
    existingApplicationId = app.id;

    const allocatedAmount = parseFloat(allocation.allocatedAmountSet?.shopMoney?.amount ?? "0");
    if (allocation.allocatedAmountSet?.shopMoney?.currencyCode) {
      resolvedCurrency = allocation.allocatedAmountSet.shopMoney.currencyCode;
    }

    if (app.__typename === APP_ORIGIN_TYPENAME) {
      if (!blocked) {
        existingIsOurs = true;
      }
      const decoded = decodeTag(app.description);
      if (decoded) {
        tag = decoded;
      } else {
        tag = { checkoutAmount: 0, productAmount: allocatedAmount, orderAmount: 0, label: app.description ?? "" };
      }
    } else if (app.targetSelection === "ALL") {
      tag = {
        checkoutAmount: allocatedAmount,
        productAmount: tag.productAmount,
        orderAmount: tag.orderAmount,
        label: app.description || "Checkout discount",
      };
    } else {
      existingIsOurs = false;
      blocked = true;
      tag = {
        checkoutAmount: allocatedAmount,
        productAmount: 0,
        orderAmount: 0,
        label: app.description || "Checkout discount",
      };
    }
  }

  return { currencyCode: resolvedCurrency, existingApplicationId, existingIsOurs, blocked, tag };
}

/** What a resolved product-level discount code targets. */
type Targeting =
  | { type: "order" }
  | {
      type: "selection";
      variantIds: Set<string>;
      productIds: Set<string>;
      collectionIds: Set<string>;
    };

/** Discriminated union of supported discount configurations. */
type ResolvedDiscount =
  | {
      type: "basic";
      kind: "percentage" | "fixed";
      percentage?: number;
      amount?: string;
      currencyCode?: string;
      label: string;
      targeting: Targeting;
      combinesWith: DiscountCombinesWith;
    }
  | {
      type: "bxgy";
      label: string;
      code: string;
      buyRule: {
        variantIds: Set<string>;
        productIds: Set<string>;
        collectionIds: Set<string>;
        minQuantity: number;
        minAmount: number;
      };
      getRule: {
        variantIds: Set<string>;
        productIds: Set<string>;
        collectionIds: Set<string>;
        quantity: number;
        kind: "percentage" | "fixed";
        percentage?: number;
        amount?: string;
        currencyCode?: string;
      };
      combinesWith: DiscountCombinesWith;
    }
  | {
      type: "free_shipping";
      label: string;
      code: string;
      maximumShippingPrice?: number | null;
      minimumQuantity?: number | null;
      minimumSubtotal?: { amount: number; currencyCode: string } | null;
      combinesWith: DiscountCombinesWith;
    };

export interface ExistingDiscountSummary {
  id: string;
  typename: string;
  codeOrLabel: string;
  appliedTo: "LINE" | "ORDER";
  totalAmount: number;
  currencyCode: string;
  lineItemIds: string[];
  isOurs: boolean;
}

function collectExistingDiscounts(allLineItems: LineItemNode[]): Map<string, ExistingDiscountSummary> {
  const map = new Map<string, ExistingDiscountSummary>();

  for (const item of allLineItems) {
    const allocations = item.calculatedDiscountAllocations ?? [];
    for (const alloc of allocations) {
      const app = alloc.discountApplication;
      if (!app || !app.id) continue;

      const amount = parseFloat(alloc.allocatedAmountSet?.shopMoney?.amount ?? "0");
      const currency = alloc.allocatedAmountSet?.shopMoney?.currencyCode ?? "USD";

      let codeOrLabel = "";
      if (app.code) {
        codeOrLabel = app.code;
      } else if (app.description) {
        const decoded = decodeTag(app.description);
        codeOrLabel = (decoded?.bxgy?.code || decoded?.label || app.description).trim();
      }

      const appliedTo = app.appliedTo === "ORDER" || app.targetSelection === "ALL" ? "ORDER" : "LINE";
      const isOurs = app.__typename === APP_ORIGIN_TYPENAME || app.__typename === "CalculatedManualDiscountApplication";

      if (!map.has(app.id)) {
        map.set(app.id, {
          id: app.id,
          typename: app.__typename,
          codeOrLabel,
          appliedTo,
          totalAmount: amount,
          currencyCode: currency,
          lineItemIds: [item.id],
          isOurs,
        });
      } else {
        const existing = map.get(app.id)!;
        existing.totalAmount = round2(existing.totalAmount + amount);
        if (!existing.lineItemIds.includes(item.id)) {
          existing.lineItemIds.push(item.id);
        }
      }
    }
  }

  return map;
}

async function getCombinesWithForExistingDiscount(
  admin: Awaited<ReturnType<typeof unauthenticated.admin>>["admin"],
  code: string,
): Promise<DiscountCombinesWith> {
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) {
    return { orderDiscounts: false, productDiscounts: false, shippingDiscounts: false };
  }

  try {
    const res = await admin.graphql(
      `#graphql
      query LookupExistingDiscountCode($code: String!) {
        codeDiscountNodeByCode(code: $code) {
          codeDiscount {
            __typename
            ... on DiscountCodeBasic {
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
            ... on DiscountCodeBxgy {
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
            ... on DiscountCodeFreeShipping {
              combinesWith {
                orderDiscounts
                productDiscounts
                shippingDiscounts
              }
            }
          }
        }
      }`,
      { variables: { code: cleanCode } },
    );
    const json = await res.json();
    const codeDiscount = json.data?.codeDiscountNodeByCode?.codeDiscount;
    if (codeDiscount?.combinesWith) {
      return {
        orderDiscounts: !!codeDiscount.combinesWith.orderDiscounts,
        productDiscounts: !!codeDiscount.combinesWith.productDiscounts,
        shippingDiscounts: !!codeDiscount.combinesWith.shippingDiscounts,
      };
    }
  } catch (e) {
    console.error("[getCombinesWithForExistingDiscount] error:", e);
  }

  return {
    orderDiscounts: false,
    productDiscounts: false,
    shippingDiscounts: false,
  };
}

function canDiscountsCombine(
  incoming: { type: "product" | "order" | "shipping"; combinesWith: DiscountCombinesWith },
  existing: { appliedTo: "LINE" | "ORDER"; combinesWith: DiscountCombinesWith },
): boolean {
  if (incoming.type === "product") {
    if (existing.appliedTo === "LINE") {
      return incoming.combinesWith.productDiscounts && existing.combinesWith.productDiscounts;
    } else {
      return incoming.combinesWith.orderDiscounts && existing.combinesWith.productDiscounts;
    }
  }

  if (incoming.type === "shipping") {
    if (existing.appliedTo === "LINE") {
      return incoming.combinesWith.productDiscounts && existing.combinesWith.shippingDiscounts;
    } else {
      return incoming.combinesWith.orderDiscounts && existing.combinesWith.shippingDiscounts;
    }
  }

  return false;
}

/** Checks whether a line item matches targeting criteria. */
function lineItemMatchesRule(
  item: LineItemNode,
  rule: {
    variantIds: Set<string>;
    productIds: Set<string>;
    collectionIds: Set<string>;
  },
): boolean {
  const hasSpecific = rule.variantIds.size > 0 || rule.productIds.size > 0 || rule.collectionIds.size > 0;
  if (!hasSpecific) return true;

  const variantId = item.variant?.id;
  const productId = item.variant?.product?.id;
  const collectionIds = item.variant?.product?.collections?.nodes?.map((n) => n.id) ?? [];

  if (variantId && rule.variantIds.has(variantId)) return true;
  if (productId && rule.productIds.has(productId)) return true;
  if (collectionIds.some((id) => rule.collectionIds.has(id))) return true;

  return false;
}

/** Looks up a Shopify discount code and validates supported discount types. */
async function resolveDiscountCode(
  admin: Awaited<ReturnType<typeof unauthenticated.admin>>["admin"],
  code: string,
): Promise<
  | ({ ok: true } & ResolvedDiscount)
  | { ok: false; message: string }
> {
  const cleanCode = code.trim().toUpperCase();
  const res = await admin.graphql(
    `#graphql
    query LookupDiscountCode($code: String!) {
      codeDiscountNodeByCode(code: $code) {
        codeDiscount {
          __typename
          ... on DiscountCodeBasic {
            status
            title
            combinesWith {
              orderDiscounts
              productDiscounts
              shippingDiscounts
            }
            customerGets {
              value {
                ... on DiscountPercentage { percentage }
                ... on DiscountAmount {
                  amount { amount currencyCode }
                  appliesOnEachItem
                }
              }
              items {
                __typename
                ... on AllDiscountItems {
                  allItems
                }
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
          ... on DiscountCodeBxgy {
            status
            title
            combinesWith {
              orderDiscounts
              productDiscounts
              shippingDiscounts
            }
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
          ... on DiscountCodeFreeShipping {
            status
            title
            combinesWith {
              orderDiscounts
              productDiscounts
              shippingDiscounts
            }
            maximumShippingPrice {
              amount
            }
            minimumRequirement {
              ... on DiscountMinimumQuantity {
                greaterThanOrEqualToQuantity
              }
              ... on DiscountMinimumSubtotal {
                greaterThanOrEqualToSubtotal {
                  amount
                  currencyCode
                }
              }
            }
          }
        }
      }
    }`,
    { variables: { code: cleanCode } },
  );
  const json = await res.json();
  const node = json.data?.codeDiscountNodeByCode;
  if (!node) {
    return { ok: false, message: `Discount code "${code}" was not found.` };
  }

  const codeDiscount = node.codeDiscount;
  if (!codeDiscount) {
    return { ok: false, message: `Discount code "${code}" was not found.` };
  }

  if (codeDiscount.status && codeDiscount.status !== "ACTIVE") {
    return { ok: false, message: `Discount code "${code}" is ${String(codeDiscount.status).toLowerCase()}.` };
  }

  // 1. DiscountCodeBasic (Amount off products)
  if (codeDiscount.__typename === "DiscountCodeBasic") {
    const value = codeDiscount.customerGets?.value;
    const items = codeDiscount.customerGets?.items;

    // Check if amount has appliesOnEachItem === false (order-level amount off)
    const amountVal = value && "amount" in value ? value.amount : null;
    if (amountVal && amountVal.appliesOnEachItem === false) {
      return {
        ok: false,
        message: `"${code}" is an order-level discount code. Only product-level discount codes can be applied here.`,
      };
    }

    // "AllDiscountItems" means the code discounts everything in the cart —
    // that's an order-level discount code, which this route does not allow.
    if (!items || items.__typename === "AllDiscountItems") {
      return {
        ok: false,
        message: `"${code}" is an order-level discount code. Only product-level discount codes can be applied here.`,
      };
    }

    const variantIds = new Set<string>(
      (items.productVariants?.nodes ?? []).map((n: { id: string }) => n.id),
    );
    const productIds = new Set<string>(
      (items.products?.nodes ?? []).map((n: { id: string }) => n.id),
    );
    const collectionIds = new Set<string>(
      (items.collections?.nodes ?? []).map((n: { id: string }) => n.id),
    );

    if (variantIds.size === 0 && productIds.size === 0 && collectionIds.size === 0) {
      return {
        ok: false,
        message: `"${code}" is an order-level discount code. Only product-level discount codes can be applied here.`,
      };
    }

    const targeting: Targeting = { type: "selection", variantIds, productIds, collectionIds };
    const label = codeDiscount.title || cleanCode;
    const combinesWith: DiscountCombinesWith = {
      orderDiscounts: !!codeDiscount.combinesWith?.orderDiscounts,
      productDiscounts: !!codeDiscount.combinesWith?.productDiscounts,
      shippingDiscounts: !!codeDiscount.combinesWith?.shippingDiscounts,
    };

    if (value?.percentage != null) {
      return { ok: true, type: "basic", kind: "percentage", percentage: value.percentage * 100, label, targeting, combinesWith };
    }
    if (value?.amount?.amount) {
      return {
        ok: true,
        type: "basic",
        kind: "fixed",
        amount: value.amount.amount,
        currencyCode: value.amount.currencyCode,
        label,
        targeting,
        combinesWith,
      };
    }
    return { ok: false, message: `Discount code "${code}" does not have a supported percentage or fixed value.` };
  }

  // 2. DiscountCodeBxgy (Buy X Get Y)
  if (codeDiscount.__typename === "DiscountCodeBxgy") {
    const buyItems = codeDiscount.customerBuys?.items;
    const buyVal = codeDiscount.customerBuys?.value;
    const getItems = codeDiscount.customerGets?.items;
    const getVal = codeDiscount.customerGets?.value;

    const buyVariantIds = new Set<string>((buyItems?.productVariants?.nodes ?? []).map((n: { id: string }) => n.id));
    const buyProductIds = new Set<string>((buyItems?.products?.nodes ?? []).map((n: { id: string }) => n.id));
    const buyCollectionIds = new Set<string>((buyItems?.collections?.nodes ?? []).map((n: { id: string }) => n.id));

    const getVariantIds = new Set<string>((getItems?.productVariants?.nodes ?? []).map((n: { id: string }) => n.id));
    const getProductIds = new Set<string>((getItems?.products?.nodes ?? []).map((n: { id: string }) => n.id));
    const getCollectionIds = new Set<string>((getItems?.collections?.nodes ?? []).map((n: { id: string }) => n.id));

    let minQuantity = 1;
    let minAmount = 0;
    if (buyVal?.quantity) {
      minQuantity = parseInt(String(buyVal.quantity), 10) || 1;
    } else if (buyVal?.amount) {
      minAmount = parseFloat(String(buyVal.amount)) || 0;
    }

    const getQty = parseInt(String(getVal?.quantity?.quantity || 1), 10) || 1;
    const effect = getVal?.effect;

    let getKind: "percentage" | "fixed" = "percentage";
    let getPercentage: number | undefined;
    let getAmount: string | undefined;
    let getCurrencyCode: string | undefined;

    if (effect?.percentage != null) {
      getKind = "percentage";
      getPercentage = effect.percentage * 100;
    } else if (effect?.amount?.amount) {
      getKind = "fixed";
      getAmount = effect.amount.amount;
      getCurrencyCode = effect.amount.currencyCode;
    } else {
      getKind = "percentage";
      getPercentage = 100;
    }

    const combinesWith: DiscountCombinesWith = {
      orderDiscounts: !!codeDiscount.combinesWith?.orderDiscounts,
      productDiscounts: !!codeDiscount.combinesWith?.productDiscounts,
      shippingDiscounts: !!codeDiscount.combinesWith?.shippingDiscounts,
    };

    return {
      ok: true,
      type: "bxgy",
      label: codeDiscount.title || cleanCode,
      code: cleanCode,
      combinesWith,
      buyRule: {
        variantIds: buyVariantIds,
        productIds: buyProductIds,
        collectionIds: buyCollectionIds,
        minQuantity,
        minAmount,
      },
      getRule: {
        variantIds: getVariantIds,
        productIds: getProductIds,
        collectionIds: getCollectionIds,
        quantity: getQty,
        kind: getKind,
        percentage: getPercentage,
        amount: getAmount,
        currencyCode: getCurrencyCode,
      },
    };
  }

  // 3. DiscountCodeFreeShipping (Free Shipping)
  if (codeDiscount.__typename === "DiscountCodeFreeShipping") {
    const maxPrice = codeDiscount.maximumShippingPrice?.amount
      ? parseFloat(codeDiscount.maximumShippingPrice.amount)
      : null;

    let minQty: number | null = null;
    let minSubtotal: { amount: number; currencyCode: string } | null = null;

    const minReq = codeDiscount.minimumRequirement;
    if (minReq?.__typename === "DiscountMinimumQuantity" && minReq.greaterThanOrEqualToQuantity) {
      minQty = parseInt(String(minReq.greaterThanOrEqualToQuantity), 10);
    } else if (minReq?.__typename === "DiscountMinimumSubtotal" && minReq.greaterThanOrEqualToSubtotal) {
      minSubtotal = {
        amount: parseFloat(minReq.greaterThanOrEqualToSubtotal.amount),
        currencyCode: minReq.greaterThanOrEqualToSubtotal.currencyCode,
      };
    }

    const combinesWith: DiscountCombinesWith = {
      orderDiscounts: !!codeDiscount.combinesWith?.orderDiscounts,
      productDiscounts: !!codeDiscount.combinesWith?.productDiscounts,
      shippingDiscounts: !!codeDiscount.combinesWith?.shippingDiscounts,
    };

    return {
      ok: true,
      type: "free_shipping",
      label: codeDiscount.title || cleanCode,
      code: cleanCode,
      combinesWith,
      maximumShippingPrice: maxPrice,
      minimumQuantity: minQty,
      minimumSubtotal: minSubtotal,
    };
  }

  return { ok: false, message: `Discount code "${code}" is not a supported type.` };
}

/** Computes the dollar amount a resolved discount is worth against `base`. */
function discountAmountAgainst(
  resolved: { kind: "percentage"; percentage: number } | { kind: "fixed"; amount: string },
  base: number,
): number {
  if (resolved.kind === "percentage") {
    return Math.max(base * (resolved.percentage / 100), 0);
  }
  return Math.min(Math.max(parseFloat(resolved.amount) || 0, 0), base);
}

/** Does this line item's variant/product/collection match what the code targets? */
function lineItemMatchesTargeting(item: LineItemNode, targeting: Targeting): boolean {
  if (targeting.type === "order") return true;

  const variantId = item.variant?.id;
  const productId = item.variant?.product?.id;
  const collectionIds = item.variant?.product?.collections?.nodes?.map((n) => n.id) ?? [];

  if (variantId && targeting.variantIds.has(variantId)) return true;
  if (productId && targeting.productIds.has(productId)) return true;
  if (collectionIds.some((id) => targeting.collectionIds.has(id))) return true;

  return false;
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { cors } = await authenticate.public.customerAccount(request);
  return cors(
    new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

export async function action({ request }: ActionFunctionArgs) {
  const { sessionToken, cors } = await authenticate.public.customerAccount(request);

  if (request.method === "OPTIONS") {
    return cors(
      new Response(null, { status: 200, headers: { "Content-Type": "application/json" } }),
    );
  }

  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  const { admin } = await unauthenticated.admin(storeDomain);

  const body = await request.json();
  const { orderId, discountCode, source } = body || {};

  if (!orderId || !discountCode) {
    return cors(
      Response.json({ userErrors: [{ message: "Missing orderId or discountCode." }] }, { status: 400 }),
    );
  }

  // Check edit limit guard
  const editLimitCheck = await checkOrderEditLimit({ shop: storeDomain, orderId });
  if (editLimitCheck.isLimitReached) {
    return cors(
      Response.json(
        {
          userErrors: [
            {
              message: `You have reached the maximum allowed edits (${editLimitCheck.maxEdits} edits) for this order.`,
            },
          ],
        },
        { status: 422 },
      ),
    );
  }

  try {
    const resolved = await resolveDiscountCode(admin, discountCode);
    if (!resolved.ok) {
      return cors(Response.json({ userErrors: [{ message: resolved.message }] }, { status: 422 }));
    }

    const beginRes = await admin.graphql(
      `#graphql
      mutation BeginEdit($id: ID!) {
        orderEditBegin(id: $id) {
          calculatedOrder {
            id
            totalPriceSet {
              presentmentMoney { amount currencyCode }
              shopMoney { amount currencyCode }
            }
            shippingLines {
              id
              title
              price {
                presentmentMoney {
                  amount
                  currencyCode
                }
                shopMoney {
                  amount
                  currencyCode
                }
              }
            }
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
                originalUnitPriceSet {
                  presentmentMoney { amount currencyCode }
                  shopMoney { amount currencyCode }
                }
                calculatedDiscountAllocations {
                  allocatedAmountSet {
                    presentmentMoney { amount currencyCode }
                    shopMoney { amount currencyCode }
                  }
                  discountApplication {
                    id
                    __typename
                    appliedTo
                    description
                    targetSelection
                    ... on CalculatedDiscountCodeApplication {
                      code
                    }
                  }
                }
              }
            }
          }
          userErrors { field message }
        }
      }`,
      { variables: { id: orderId } },
    );
    const beginJson = await beginRes.json();
    const beginErrors = beginJson.data?.orderEditBegin?.userErrors ?? [];
    if (beginErrors.length) {
      return cors(Response.json({ userErrors: beginErrors }, { status: 422 }));
    }

    const calculatedOrder = beginJson.data.orderEditBegin.calculatedOrder;
    const calculatedOrderId: string = calculatedOrder.id;
    const allLineItems: LineItemNode[] = (calculatedOrder.lineItems?.nodes ?? []).filter(
      (item: LineItemNode) => {
        const activeQty = item.editableQuantity ?? item.quantity;
        return activeQty > 0;
      },
    );

    if (allLineItems.length === 0) {
      return cors(
        Response.json({ userErrors: [{ message: "This order has no active line items." }] }, { status: 422 }),
      );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // BRANCH 1: FREE SHIPPING DISCOUNT
    // ─────────────────────────────────────────────────────────────────────────────
    if (resolved.type === "free_shipping") {
      let totalActiveQty = 0;
      let totalActiveSubtotal = 0;
      let currencyCode = "USD";

      for (const item of allLineItems) {
        const qty = item.editableQuantity ?? item.quantity;
        const unitPrice = parseFloat(item.originalUnitPriceSet?.shopMoney?.amount ?? "0");
        if (item.originalUnitPriceSet?.shopMoney?.currencyCode) {
          currencyCode = item.originalUnitPriceSet.shopMoney.currencyCode;
        }
        totalActiveQty += qty;
        totalActiveSubtotal += qty * unitPrice;
      }

      if (resolved.minimumQuantity != null && totalActiveQty < resolved.minimumQuantity) {
        return cors(
          Response.json(
            {
              userErrors: [
                {
                  message: `Discount code "${discountCode}" requires a minimum of ${resolved.minimumQuantity} item(s) in the order.`,
                },
              ],
            },
            { status: 422 },
          ),
        );
      }

      if (resolved.minimumSubtotal != null && totalActiveSubtotal < resolved.minimumSubtotal.amount) {
        return cors(
          Response.json(
            {
              userErrors: [
                {
                  message: `Discount code "${discountCode}" requires a minimum subtotal of ${resolved.minimumSubtotal.amount.toFixed(2)} ${resolved.minimumSubtotal.currencyCode}.`,
                },
              ],
            },
            { status: 422 },
          ),
        );
      }

      const shippingLines: ShippingLineNode[] = calculatedOrder.shippingLines ?? [];
      let existingShippingLineId: string | null = null;
      let existingShippingTitle = "Standard Shipping";
      let existingShippingAmount = 0;

      if (shippingLines.length > 0) {
        const firstLine = shippingLines[0];
        existingShippingLineId = firstLine.id;
        if (firstLine.title) existingShippingTitle = firstLine.title;
        existingShippingAmount = parseFloat(firstLine.price?.shopMoney?.amount ?? "0");
        if (firstLine.price?.shopMoney?.currencyCode) {
          currencyCode = firstLine.price.shopMoney.currencyCode;
        }
      }

      if (existingShippingLineId && existingShippingAmount === 0) {
        return cors(
          Response.json({
            success: false,
            applied: false,
            appliedCount: 0,
            appliedProducts: [],
            skippedProducts: ["Shipping"],
            discountLabel: resolved.label,
            warnings: ["This order already has free shipping."],
            userErrors: [],
          }),
        );
      }

      if (resolved.maximumShippingPrice != null && existingShippingAmount > resolved.maximumShippingPrice) {
        return cors(
          Response.json(
            {
              userErrors: [
                {
                  message: `Shipping rate of ${existingShippingAmount.toFixed(2)} ${currencyCode} exceeds the maximum shipping rate allowed for discount code "${discountCode}" (${resolved.maximumShippingPrice.toFixed(2)} ${currencyCode}).`,
                },
              ],
            },
            { status: 422 },
          ),
        );
      }

      // Combinations check with existing discounts on the order:
      const existingDiscounts = collectExistingDiscounts(allLineItems);
      const incompatibleDiscounts: ExistingDiscountSummary[] = [];

      for (const existingApp of existingDiscounts.values()) {
        const existingCombinesWith = await getCombinesWithForExistingDiscount(admin, existingApp.codeOrLabel);
        const canCombine = canDiscountsCombine(
          { type: "shipping", combinesWith: resolved.combinesWith },
          { appliedTo: existingApp.appliedTo, combinesWith: existingCombinesWith },
        );

        if (!canCombine) {
          incompatibleDiscounts.push(existingApp);
        }
      }

      if (incompatibleDiscounts.length > 0) {
        const totalIncompatibleAmount = round2(
          incompatibleDiscounts.reduce((sum, d) => sum + d.totalAmount, 0),
        );

        if (totalIncompatibleAmount >= existingShippingAmount) {
          const incompNames = incompatibleDiscounts.map((d) => d.codeOrLabel || "existing discount").join(", ");
          return cors(
            Response.json({
              success: false,
              applied: false,
              appliedCount: 0,
              appliedProducts: [],
              skippedProducts: ["Shipping"],
              discountLabel: resolved.label,
              warnings: [
                `Discount code "${discountCode}" cannot be combined with existing discount "${incompNames}". The existing discount (${totalIncompatibleAmount.toFixed(2)} ${currencyCode}) was kept because it offers a higher discount than "${discountCode}" (${existingShippingAmount.toFixed(2)} ${currencyCode}).`,
              ],
              userErrors: [],
            }),
          );
        }

        // Free shipping offers a higher discount: remove incompatible discounts
        for (const incomp of incompatibleDiscounts) {
          const removeRes = await admin.graphql(
            `#graphql
            mutation RemoveIncompatibleDiscount($id: ID!, $discountApplicationId: ID!) {
              orderEditRemoveDiscount(id: $id, discountApplicationId: $discountApplicationId) {
                userErrors { field message }
              }
            }`,
            { variables: { id: calculatedOrderId, discountApplicationId: incomp.id } },
          );
          const removeJson = await removeRes.json();
          const removeErrors = removeJson.data?.orderEditRemoveDiscount?.userErrors ?? [];
          if (removeJson.errors?.length || removeErrors.length) {
            const rawMsg = removeErrors[0]?.message ?? removeJson.errors?.[0]?.message ?? "unknown error";
            return cors(
              Response.json(
                {
                  userErrors: [
                    {
                      message: `Existing discount "${incomp.codeOrLabel}" cannot be combined with "${discountCode}" and could not be removed: ${rawMsg}`,
                    },
                  ],
                },
                { status: 422 },
              ),
            );
          }
        }
      }

      if (existingShippingLineId) {
        const removeShipRes = await admin.graphql(
          `#graphql
          mutation RemoveShippingLine($id: ID!, $shippingLineId: ID!) {
            orderEditRemoveShippingLine(id: $id, shippingLineId: $shippingLineId) {
              calculatedOrder { id }
              userErrors { field message }
            }
          }`,
          {
            variables: {
              id: calculatedOrderId,
              shippingLineId: existingShippingLineId,
            },
          },
        );
        const removeShipJson = await removeShipRes.json();
        const removeShipErrors = removeShipJson.data?.orderEditRemoveShippingLine?.userErrors ?? [];
        if (removeShipErrors.length) {
          return cors(Response.json({ userErrors: removeShipErrors }, { status: 422 }));
        }
      }

      const cleanExistingTitle = (existingShippingTitle || "Standard")
        .replace(/\s*\(Free(?:\s*-\s*[^)]+)?\)/gi, "")
        .replace(/\s*\(Already Applied\)/gi, "")
        .replace(/\s*\(Free\)/gi, "")
        .trim();
      const freeShippingTitle = `${cleanExistingTitle} (Free - ${discountCode})`;

      const targetShippingCurrency =
        calculatedOrder.totalPriceSet?.presentmentMoney?.currencyCode ||
        calculatedOrder.shippingLines?.[0]?.price?.presentmentMoney?.currencyCode ||
        currencyCode ||
        "USD";

      let addShipRes = await admin.graphql(
        `#graphql
        mutation AddFreeShippingLine($id: ID!, $shippingLine: OrderEditAddShippingLineInput!) {
          orderEditAddShippingLine(id: $id, shippingLine: $shippingLine) {
            calculatedOrder { id }
            calculatedShippingLine { id }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            id: calculatedOrderId,
            shippingLine: {
              title: freeShippingTitle,
              price: {
                amount: "0.00",
                currencyCode: targetShippingCurrency,
              },
            },
          },
        },
      );
      let addShipJson = await addShipRes.json();
      let addShipErrors = addShipJson.data?.orderEditAddShippingLine?.userErrors ?? [];

      if (addShipErrors.length) {
        const currencyMatch = addShipErrors[0]?.message?.match(/must be in ([A-Z]{3})/i);
        if (currencyMatch) {
          const retryCurrency = currencyMatch[1].toUpperCase();
          addShipRes = await admin.graphql(
            `#graphql
            mutation AddFreeShippingLineRetry($id: ID!, $shippingLine: OrderEditAddShippingLineInput!) {
              orderEditAddShippingLine(id: $id, shippingLine: $shippingLine) {
                calculatedOrder { id }
                calculatedShippingLine { id }
                userErrors { field message }
              }
            }`,
            {
              variables: {
                id: calculatedOrderId,
                shippingLine: {
                  title: freeShippingTitle,
                  price: {
                    amount: "0.00",
                    currencyCode: retryCurrency,
                  },
                },
              },
            },
          );
          addShipJson = await addShipRes.json();
          addShipErrors = addShipJson.data?.orderEditAddShippingLine?.userErrors ?? [];
        }
      }

      if (addShipErrors.length) {
        return cors(Response.json({ userErrors: addShipErrors }, { status: 422 }));
      }

      const commitRes = await admin.graphql(
        `#graphql
        mutation CommitEdit($id: ID!, $staffNote: String) {
          orderEditCommit(id: $id, notifyCustomer: true, staffNote: $staffNote) {
            order {
              id
              name
              statusPageUrl
              totalOutstandingSet { shopMoney { amount currencyCode } }
            }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            id: calculatedOrderId,
            staffNote: `Free shipping discount "${discountCode}" applied via customer account`,
          },
        },
      );
      const commitJson = await commitRes.json();
      const commitErrors = commitJson.data?.orderEditCommit?.userErrors ?? [];
      if (commitErrors.length) {
        return cors(Response.json({ userErrors: commitErrors }, { status: 422 }));
      }

      await persistFreeShippingCode(admin, orderId, discountCode);

      await trackOrderEdit({
        shop: storeDomain,
        orderId,
        featureId: "apply-discount",
        source,
      });

      return cors(
        Response.json({
          success: true,
          applied: true,
          order: commitJson.data.orderEditCommit.order,
          appliedCount: 1,
          appliedProducts: ["Shipping (Free)"],
          replacedCount: existingShippingLineId ? 1 : 0,
          skippedProducts: [],
          discountLabel: resolved.label,
          warnings: [],
          userErrors: [],
        }),
      );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // BRANCH 2: BUY X GET Y (BXGY) DISCOUNT
    // ─────────────────────────────────────────────────────────────────────────────
    if (resolved.type === "bxgy") {
      let totalBuyQty = 0;
      let totalBuyAmt = 0;

      for (const item of allLineItems) {
        if (lineItemMatchesRule(item, resolved.buyRule)) {
          const qty = item.editableQuantity ?? item.quantity;
          const unitPrice = parseFloat(item.originalUnitPriceSet?.shopMoney?.amount ?? "0");
          totalBuyQty += qty;
          totalBuyAmt += qty * unitPrice;
        }
      }

      const hasRequiredBuyQty = totalBuyQty >= resolved.buyRule.minQuantity;
      const hasRequiredBuyAmt = resolved.buyRule.minAmount <= 0 || totalBuyAmt >= resolved.buyRule.minAmount;

      if (!hasRequiredBuyQty || !hasRequiredBuyAmt) {
        const reqMsg =
          resolved.buyRule.minAmount > 0
            ? `purchase at least ${resolved.buyRule.minAmount.toFixed(2)} worth of qualifying products`
            : `purchase at least ${resolved.buyRule.minQuantity} qualifying product${resolved.buyRule.minQuantity > 1 ? "s" : ""}`;
        return cors(
          Response.json(
            {
              userErrors: [
                {
                  message: `Discount code "${discountCode}" requires you to ${reqMsg} first.`,
                },
              ],
            },
            { status: 422 },
          ),
        );
      }

      const eligibleYItems = allLineItems.filter((item) => lineItemMatchesRule(item, resolved.getRule));
      if (eligibleYItems.length === 0) {
        return cors(
          Response.json(
            {
              userErrors: [
                {
                  message: `The promotional item for discount code "${discountCode}" is not in this order. Please add it to your order first.`,
                },
              ],
            },
            { status: 422 },
          ),
        );
      }

      // If Buy X and Get Y target the exact same line item (e.g. Buy 1 Get 1 on Product A),
      // total units on that item must be at least minQuantity + getQuantity.
      const isSameLineItem = eligibleYItems.length === 1 && lineItemMatchesRule(eligibleYItems[0], resolved.buyRule);
      if (isSameLineItem) {
        const itemQty = eligibleYItems[0].editableQuantity ?? eligibleYItems[0].quantity;
        const neededQty = resolved.buyRule.minQuantity + resolved.getRule.quantity;
        if (itemQty < neededQty) {
          return cors(
            Response.json(
              {
                userErrors: [
                  {
                    message: `Discount code "${discountCode}" requires at least ${neededQty} units of "${lineItemDisplayName(eligibleYItems[0])}" in your order (Buy ${resolved.buyRule.minQuantity}, Get ${resolved.getRule.quantity}). Current quantity is ${itemQty}.`,
                  },
                ],
              },
              { status: 422 },
            ),
          );
        }
      }

      const targetItem = eligibleYItems[0];
      const targetDisplayName = lineItemDisplayName(targetItem);
      const targetActiveQty = targetItem.editableQuantity ?? targetItem.quantity;
      const targetUnit = parseFloat(targetItem.originalUnitPriceSet?.shopMoney?.amount ?? "0");
      const targetCurrency =
        calculatedOrder.totalPriceSet?.presentmentMoney?.currencyCode ||
        targetItem.originalUnitPriceSet?.presentmentMoney?.currencyCode ||
        targetItem.originalUnitPriceSet?.shopMoney?.currencyCode ||
        "USD";

      const discountQty = Math.min(resolved.getRule.quantity, targetActiveQty);
      let calculatedDiscount = 0;
      if (resolved.getRule.kind === "percentage") {
        const pct = resolved.getRule.percentage ?? 100;
        calculatedDiscount = round2(targetUnit * (pct / 100) * discountQty);
      } else {
        const fixedVal = parseFloat(resolved.getRule.amount ?? "0");
        calculatedDiscount = round2(Math.min(fixedVal * discountQty, targetUnit * discountQty));
      }

      const state = readLineItemDiscountState(targetItem);

      // Combinations check with other existing discounts on the order:
      const existingDiscounts = collectExistingDiscounts(allLineItems);
      const incompatibleDiscounts: ExistingDiscountSummary[] = [];

      for (const existingApp of existingDiscounts.values()) {
        // If this existing discount is on targetItem, it is handled via line-level replacement below
        if (existingApp.id === state.existingApplicationId) {
          continue;
        }

        const existingCombinesWith = await getCombinesWithForExistingDiscount(admin, existingApp.codeOrLabel);
        const canCombine = canDiscountsCombine(
          { type: "product", combinesWith: resolved.combinesWith },
          { appliedTo: existingApp.appliedTo, combinesWith: existingCombinesWith },
        );

        if (!canCombine) {
          incompatibleDiscounts.push(existingApp);
        }
      }

      if (incompatibleDiscounts.length > 0) {
        const totalIncompatibleAmount = round2(
          incompatibleDiscounts.reduce((sum, d) => sum + d.totalAmount, 0),
        );

        if (totalIncompatibleAmount >= calculatedDiscount) {
          const incompNames = incompatibleDiscounts.map((d) => d.codeOrLabel || "existing discount").join(", ");
          return cors(
            Response.json({
              success: false,
              applied: false,
              appliedCount: 0,
              appliedProducts: [],
              skippedProducts: [targetDisplayName],
              discountLabel: resolved.label,
              warnings: [
                `Discount code "${discountCode}" cannot be combined with existing discount "${incompNames}". The existing discount (${totalIncompatibleAmount.toFixed(2)} ${targetCurrency}) was kept because it offers a higher discount than "${discountCode}" (${calculatedDiscount.toFixed(2)} ${targetCurrency}).`,
              ],
              userErrors: [],
            }),
          );
        }

        // New discount offers a higher discount: remove incompatible discounts
        for (const incomp of incompatibleDiscounts) {
          const removeRes = await admin.graphql(
            `#graphql
            mutation RemoveIncompatibleDiscount($id: ID!, $discountApplicationId: ID!) {
              orderEditRemoveDiscount(id: $id, discountApplicationId: $discountApplicationId) {
                userErrors { field message }
              }
            }`,
            { variables: { id: calculatedOrderId, discountApplicationId: incomp.id } },
          );
          const removeJson = await removeRes.json();
          const removeErrors = removeJson.data?.orderEditRemoveDiscount?.userErrors ?? [];
          if (removeJson.errors?.length || removeErrors.length) {
            const rawMsg = removeErrors[0]?.message ?? removeJson.errors?.[0]?.message ?? "unknown error";
            return cors(
              Response.json(
                {
                  userErrors: [
                    {
                      message: `Existing discount "${incomp.codeOrLabel}" cannot be combined with "${discountCode}" and could not be removed: ${rawMsg}`,
                    },
                  ],
                },
                { status: 422 },
              ),
            );
          }
        }
      }

      if (state.blocked) {
        if (calculatedDiscount <= state.tag.checkoutAmount) {
          return cors(
            Response.json({
              success: false,
              applied: false,
              appliedCount: 0,
              appliedProducts: [],
              skippedProducts: [targetDisplayName],
              discountLabel: resolved.label,
              warnings: [
                `"${targetDisplayName}" already has a checkout discount worth ${state.tag.checkoutAmount.toFixed(2)} ${targetCurrency}. ` +
                  `"${discountCode}" would only be worth ${calculatedDiscount.toFixed(2)} ${targetCurrency}, so the existing discount was kept.`,
              ],
              userErrors: [],
            }),
          );
        }

        if (state.existingApplicationId) {
          const removeRes = await admin.graphql(
            `#graphql
            mutation RemoveDiscount($id: ID!, $discountApplicationId: ID!) {
              orderEditRemoveDiscount(id: $id, discountApplicationId: $discountApplicationId) {
                userErrors { field message }
              }
            }`,
            { variables: { id: calculatedOrderId, discountApplicationId: state.existingApplicationId } },
          );
          const removeJson = await removeRes.json();
          if (removeJson.data?.orderEditRemoveDiscount?.userErrors?.length) {
            return cors(
              Response.json(
                {
                  userErrors: [{ message: `"${targetDisplayName}" already has a discount that cannot be removed.` }],
                },
                { status: 422 },
              ),
            );
          }
        }
      } else {
        if (state.tag.productAmount > 0 && calculatedDiscount <= state.tag.productAmount) {
          return cors(
            Response.json({
              success: false,
              applied: false,
              appliedCount: 0,
              appliedProducts: [],
              skippedProducts: [targetDisplayName],
              discountLabel: resolved.label,
              warnings: [
                `"${targetDisplayName}" already has a discount applied worth ${state.tag.productAmount.toFixed(2)} ${targetCurrency}. ` +
                  `"${discountCode}" would only be worth ${calculatedDiscount.toFixed(2)} ${targetCurrency}, so the existing discount was kept.`,
              ],
              userErrors: [],
            }),
          );
        }

        if (state.existingApplicationId && state.existingIsOurs) {
          await admin.graphql(
            `#graphql
            mutation RemoveDiscount($id: ID!, $discountApplicationId: ID!) {
              orderEditRemoveDiscount(id: $id, discountApplicationId: $discountApplicationId) {
                userErrors { field message }
              }
            }`,
            { variables: { id: calculatedOrderId, discountApplicationId: state.existingApplicationId } },
          );
        }
      }

      const bxgyMeta: BxgyMetadata = {
        code: resolved.code,
      };

      const newTag: DecodedTag = {
        checkoutAmount: 0,
        productAmount: calculatedDiscount,
        orderAmount: state.tag.orderAmount,
        label: resolved.label,
        bxgy: bxgyMeta,
      };

      const combinedAmount = calculatedDiscount + state.tag.orderAmount;
      const perUnitAmount = Math.min(combinedAmount / targetActiveQty, targetUnit);

      let applyRes = await admin.graphql(
        `#graphql
        mutation ApplyBxgyDiscount($id: ID!, $lineItemId: ID!, $discount: OrderEditAppliedDiscountInput!) {
          orderEditAddLineItemDiscount(id: $id, lineItemId: $lineItemId, discount: $discount) {
            calculatedLineItem { id }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            id: calculatedOrderId,
            lineItemId: targetItem.id,
            discount: {
              fixedValue: { amount: perUnitAmount.toFixed(2), currencyCode: targetCurrency },
              description: (resolved.code || resolved.label || discountCode).trim().slice(0, 40),
            },
          },
        },
      );
      let applyJson = await applyRes.json();
      let applyErrors = applyJson.data?.orderEditAddLineItemDiscount?.userErrors ?? [];

      if (applyErrors.length) {
        const currencyMatch = applyErrors[0]?.message?.match(/must be in ([A-Z]{3})/i);
        if (currencyMatch) {
          const retryCurrency = currencyMatch[1].toUpperCase();
          applyRes = await admin.graphql(
            `#graphql
            mutation ApplyBxgyDiscountRetry($id: ID!, $lineItemId: ID!, $discount: OrderEditAppliedDiscountInput!) {
              orderEditAddLineItemDiscount(id: $id, lineItemId: $lineItemId, discount: $discount) {
                calculatedLineItem { id }
                userErrors { field message }
              }
            }`,
            {
              variables: {
                id: calculatedOrderId,
                lineItemId: targetItem.id,
                discount: {
                  fixedValue: { amount: perUnitAmount.toFixed(2), currencyCode: retryCurrency },
                  description: (resolved.code || resolved.label || discountCode).trim().slice(0, 40),
                },
              },
            },
          );
          applyJson = await applyRes.json();
          applyErrors = applyJson.data?.orderEditAddLineItemDiscount?.userErrors ?? [];
        }
      }

      if (applyErrors.length) {
        return cors(Response.json({ userErrors: applyErrors }, { status: 422 }));
      }

      const commitRes = await admin.graphql(
        `#graphql
        mutation CommitEdit($id: ID!, $staffNote: String) {
          orderEditCommit(id: $id, notifyCustomer: true, staffNote: $staffNote) {
            order {
              id
              name
              statusPageUrl
              totalOutstandingSet { shopMoney { amount currencyCode } }
            }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            id: calculatedOrderId,
            staffNote: `Buy X Get Y discount "${discountCode}" applied via customer account`,
          },
        },
      );
      const commitJson = await commitRes.json();
      const commitErrors = commitJson.data?.orderEditCommit?.userErrors ?? [];
      if (commitErrors.length) {
        return cors(Response.json({ userErrors: commitErrors }, { status: 422 }));
      }

      await trackOrderEdit({
        shop: storeDomain,
        orderId,
        featureId: "apply-discount",
        source,
      });

      return cors(
        Response.json({
          success: true,
          applied: true,
          order: commitJson.data.orderEditCommit.order,
          appliedCount: 1,
          appliedProducts: [targetDisplayName],
          replacedCount: state.blocked || state.tag.productAmount > 0 ? 1 : 0,
          skippedProducts: [],
          discountLabel: resolved.label,
          warnings: [],
          userErrors: [],
        }),
      );
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // BRANCH 3: AMOUNT OFF PRODUCTS (BASIC) DISCOUNT
    // ─────────────────────────────────────────────────────────────────────────────
    const targetLineItems = allLineItems.filter((item) => lineItemMatchesTargeting(item, resolved.targeting));

    if (targetLineItems.length === 0) {
      return cors(
        Response.json(
          { userErrors: [{ message: `No product eligible for discount code "${discountCode}" was found on this order.` }] },
          { status: 422 },
        ),
      );
    }

    const warnings: string[] = [];
    const appliedProducts: string[] = [];
    const skippedProducts: string[] = [];
    let appliedCount = 0;
    let replacedCount = 0;

    // Precalculate total new discount across eligible target items
    let totalNewDiscount = 0;
    for (const item of targetLineItems) {
      const activeQty = item.editableQuantity ?? item.quantity;
      const originalUnit = parseFloat(item.originalUnitPriceSet?.shopMoney?.amount ?? "0");
      const originalLineTotal = originalUnit * activeQty;
      const amount = discountAmountAgainst(
        resolved.kind === "percentage"
          ? { kind: "percentage", percentage: resolved.percentage! }
          : { kind: "fixed", amount: resolved.amount! },
        originalLineTotal,
      );
      totalNewDiscount = round2(totalNewDiscount + amount);
    }

    // Combinations check with other existing discounts on the order:
    const targetItemIds = new Set(targetLineItems.map((i) => i.id));
    const existingDiscounts = collectExistingDiscounts(allLineItems);
    const incompatibleDiscounts: ExistingDiscountSummary[] = [];

    for (const existingApp of existingDiscounts.values()) {
      // If all line items for this existing discount are within targetItemIds and it's a line-level discount,
      // it is handled via item-level replacement/comparison
      const allOnTargetItems = existingApp.lineItemIds.every((id) => targetItemIds.has(id));
      if (allOnTargetItems && existingApp.appliedTo === "LINE") {
        continue;
      }

      const existingCombinesWith = await getCombinesWithForExistingDiscount(admin, existingApp.codeOrLabel);
      const canCombine = canDiscountsCombine(
        { type: "product", combinesWith: resolved.combinesWith },
        { appliedTo: existingApp.appliedTo, combinesWith: existingCombinesWith },
      );

      if (!canCombine) {
        incompatibleDiscounts.push(existingApp);
      }
    }

    if (incompatibleDiscounts.length > 0) {
      const totalIncompatibleAmount = round2(
        incompatibleDiscounts.reduce((sum, d) => sum + d.totalAmount, 0),
      );
      const orderCurrency = targetLineItems[0]?.originalUnitPriceSet?.shopMoney?.currencyCode || "USD";

      if (totalIncompatibleAmount >= totalNewDiscount) {
        const incompNames = incompatibleDiscounts.map((d) => d.codeOrLabel || "existing discount").join(", ");
        return cors(
          Response.json({
            success: false,
            applied: false,
            appliedCount: 0,
            appliedProducts: [],
            skippedProducts: targetLineItems.map((i) => lineItemDisplayName(i)),
            discountLabel: resolved.label,
            warnings: [
              `Discount code "${discountCode}" cannot be combined with existing discount "${incompNames}". The existing discount (${totalIncompatibleAmount.toFixed(2)} ${orderCurrency}) was kept because it offers a higher discount than "${discountCode}" (${totalNewDiscount.toFixed(2)} ${orderCurrency}).`,
            ],
            userErrors: [],
          }),
        );
      }

      // New discount offers a higher discount: remove incompatible discounts
      for (const incomp of incompatibleDiscounts) {
        const removeRes = await admin.graphql(
          `#graphql
          mutation RemoveIncompatibleDiscount($id: ID!, $discountApplicationId: ID!) {
            orderEditRemoveDiscount(id: $id, discountApplicationId: $discountApplicationId) {
              userErrors { field message }
            }
          }`,
          { variables: { id: calculatedOrderId, discountApplicationId: incomp.id } },
        );
        const removeJson = await removeRes.json();
        const removeErrors = removeJson.data?.orderEditRemoveDiscount?.userErrors ?? [];
        if (removeJson.errors?.length || removeErrors.length) {
          const rawMsg = removeErrors[0]?.message ?? removeJson.errors?.[0]?.message ?? "unknown error";
          return cors(
            Response.json(
              {
                userErrors: [
                  {
                    message: `Existing discount "${incomp.codeOrLabel}" cannot be combined with "${discountCode}" and could not be removed: ${rawMsg}`,
                  },
                ],
              },
              { status: 422 },
            ),
          );
        }
      }
    }

    for (const item of targetLineItems) {
      const displayName = lineItemDisplayName(item);
      const state = readLineItemDiscountState(item);
      const activeQty = item.editableQuantity ?? item.quantity;
      const originalUnit = parseFloat(item.originalUnitPriceSet?.shopMoney?.amount ?? "0");
      const originalLineTotal = originalUnit * activeQty;
      const currencyCode =
        calculatedOrder.totalPriceSet?.presentmentMoney?.currencyCode ||
        item.originalUnitPriceSet?.presentmentMoney?.currencyCode ||
        state.currencyCode ||
        item.originalUnitPriceSet?.shopMoney?.currencyCode ||
        "USD";

      const newProductAmount = discountAmountAgainst(
        resolved.kind === "percentage"
          ? { kind: "percentage", percentage: resolved.percentage! }
          : { kind: "fixed", amount: resolved.amount! },
        originalLineTotal,
      );

      if (state.blocked) {
        const existingAmount = state.tag.checkoutAmount;

        if (newProductAmount <= existingAmount) {
          warnings.push(
            `"${displayName}" already has a checkout discount worth ${existingAmount.toFixed(2)} ${currencyCode}. ` +
              `"${discountCode}" would only be worth ${newProductAmount.toFixed(2)} ${currencyCode}, so the existing discount was kept.`,
          );
          skippedProducts.push(displayName);
          continue;
        }

        if (state.existingApplicationId) {
          const removeRes = await admin.graphql(
            `#graphql
            mutation RemoveDiscount($id: ID!, $discountApplicationId: ID!) {
              orderEditRemoveDiscount(id: $id, discountApplicationId: $discountApplicationId) {
                userErrors { field message }
              }
            }`,
            { variables: { id: calculatedOrderId, discountApplicationId: state.existingApplicationId } },
          );
          const removeJson = await removeRes.json();
          const removeErrors = removeJson.data?.orderEditRemoveDiscount?.userErrors ?? [];
          if (removeJson.errors?.length || removeErrors.length) {
            warnings.push(
              `"${displayName}" already has a discount that was applied during checkout and cannot be replaced or removed.`,
            );
            skippedProducts.push(displayName);
            continue;
          }
        }
      } else {
        if (state.tag.productAmount > 0 && newProductAmount <= state.tag.productAmount) {
          const existingLabel = state.tag.label ? `"${state.tag.label}"` : "The existing discount";
          warnings.push(
            `"${displayName}" already has ${existingLabel} applied, worth ${state.tag.productAmount.toFixed(2)} ${currencyCode}. ` +
              `"${discountCode}" would only be worth ${newProductAmount.toFixed(2)} ${currencyCode} on this product, so the existing discount was kept.`,
          );
          skippedProducts.push(displayName);
          continue;
        }

        if (state.existingApplicationId && state.existingIsOurs) {
          const removeRes = await admin.graphql(
            `#graphql
            mutation RemoveDiscount($id: ID!, $discountApplicationId: ID!) {
              orderEditRemoveDiscount(id: $id, discountApplicationId: $discountApplicationId) {
                userErrors { field message }
              }
            }`,
            { variables: { id: calculatedOrderId, discountApplicationId: state.existingApplicationId } },
          );
          const removeJson = await removeRes.json();
          const removeErrors = removeJson.data?.orderEditRemoveDiscount?.userErrors ?? [];
          if (removeJson.errors?.length || removeErrors.length) {
            const rawMessage = removeErrors[0]?.message ?? removeJson.errors?.[0]?.message ?? "unknown error";
            warnings.push(`Could not update the discount on "${displayName}": ${rawMessage}.`);
            skippedProducts.push(displayName);
            continue;
          }
        }
      }

      const wasReplacement = state.blocked || state.tag.productAmount > 0;

      const newTag: DecodedTag = {
        checkoutAmount: state.blocked ? 0 : state.tag.checkoutAmount,
        productAmount: newProductAmount,
        orderAmount: state.tag.orderAmount,
        label: resolved.label,
      };
      const combinedAmount = newProductAmount + state.tag.orderAmount;
      const perUnitAmount = Math.min(combinedAmount / activeQty, originalUnit);

      if (perUnitAmount <= 0) {
        warnings.push(`Could not apply the discount to "${displayName}": discount amount must be greater than 0.`);
        skippedProducts.push(displayName);
        continue;
      }

      let applyRes = await admin.graphql(
        `#graphql
        mutation ApplyDiscount($id: ID!, $lineItemId: ID!, $discount: OrderEditAppliedDiscountInput!) {
          orderEditAddLineItemDiscount(id: $id, lineItemId: $lineItemId, discount: $discount) {
            calculatedLineItem { id }
            userErrors { field message }
          }
        }`,
        {
          variables: {
            id: calculatedOrderId,
            lineItemId: item.id,
            discount: {
              fixedValue: { amount: perUnitAmount.toFixed(2), currencyCode },
              description: (resolved.label || discountCode).trim().slice(0, 40),
            },
          },
        },
      );
      let applyJson = await applyRes.json();
      let applyErrors = applyJson.data?.orderEditAddLineItemDiscount?.userErrors ?? [];

      if (applyErrors.length) {
        const currencyMatch = applyErrors[0]?.message?.match(/must be in ([A-Z]{3})/i);
        if (currencyMatch) {
          const retryCurrency = currencyMatch[1].toUpperCase();
          applyRes = await admin.graphql(
            `#graphql
            mutation ApplyDiscountRetry($id: ID!, $lineItemId: ID!, $discount: OrderEditAppliedDiscountInput!) {
              orderEditAddLineItemDiscount(id: $id, lineItemId: $lineItemId, discount: $discount) {
                calculatedLineItem { id }
                userErrors { field message }
              }
            }`,
            {
              variables: {
                id: calculatedOrderId,
                lineItemId: item.id,
                discount: {
                  fixedValue: { amount: perUnitAmount.toFixed(2), currencyCode: retryCurrency },
                  description: (resolved.label || discountCode).trim().slice(0, 40),
                },
              },
            },
          );
          applyJson = await applyRes.json();
          applyErrors = applyJson.data?.orderEditAddLineItemDiscount?.userErrors ?? [];
        }
      }

      if (applyJson.errors?.length || applyErrors.length) {
        const rawMessage = applyJson.errors?.[0]?.message ?? applyErrors[0]?.message ?? "unknown error";
        warnings.push(`Could not apply the discount to "${displayName}": ${rawMessage}.`);
        skippedProducts.push(displayName);
        continue;
      }

      appliedCount += 1;
      appliedProducts.push(displayName);
      if (wasReplacement) replacedCount += 1;
    }

    const uniqueWarnings = Array.from(new Set(warnings));
    const uniqueSkippedProducts = Array.from(new Set(skippedProducts));
    const uniqueAppliedProducts = Array.from(new Set(appliedProducts));

    if (appliedCount === 0) {
      return cors(
        Response.json({
          success: false,
          applied: false,
          appliedCount: 0,
          appliedProducts: [],
          skippedProducts: uniqueSkippedProducts,
          discountLabel: resolved.label,
          warnings: uniqueWarnings.length ? uniqueWarnings : ["No eligible products found for this discount code."],
          userErrors: [],
        }),
      );
    }

    const commitRes = await admin.graphql(
      `#graphql
      mutation CommitEdit($id: ID!, $staffNote: String) {
        orderEditCommit(id: $id, notifyCustomer: true, staffNote: $staffNote) {
          order {
            id
            name
            statusPageUrl
            totalOutstandingSet { shopMoney { amount currencyCode } }
          }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          id: calculatedOrderId,
          staffNote: `Product discount "${discountCode}" applied via customer account`,
        },
      },
    );
    const commitJson = await commitRes.json();
    const commitErrors = commitJson.data?.orderEditCommit?.userErrors ?? [];
    if (commitErrors.length) {
      return cors(Response.json({ userErrors: commitErrors }, { status: 422 }));
    }

    await trackOrderEdit({
      shop: storeDomain,
      orderId,
      featureId: "apply-discount",
      source,
    });

    return cors(
      Response.json({
        success: true,
        applied: true,
        order: commitJson.data.orderEditCommit.order,
        appliedCount,
        appliedProducts: uniqueAppliedProducts,
        replacedCount,
        skippedProducts: uniqueSkippedProducts,
        discountLabel: resolved.label,
        warnings: uniqueWarnings,
        userErrors: [],
      }),
    );
  } catch (err: unknown) {
    console.error("[order-discount8] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return cors(Response.json({ userErrors: [{ message }] }, { status: 500 }));
  }
}