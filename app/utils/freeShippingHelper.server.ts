/**
 * freeShippingHelper.server.ts
 *
 * Helpers to detect, preserve, and persist active free shipping discount codes for an order.
 */

import { addOrderTags } from "./orderTagsHelper.server";

interface AdminGraphQL {
  graphql: (query: string, options?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

export interface FreeShippingInfo {
  hasFreeShipping: boolean;
  code: string | null;
  maxPrice: number | null;
}

/**
 * Persists a free shipping discount code to an order's metafield and tags.
 */
export async function persistFreeShippingCode(
  admin: AdminGraphQL,
  orderId: string,
  code: string,
): Promise<void> {
  if (!orderId || !code) return;
  try {
    await admin.graphql(
      `#graphql
      mutation SetFreeShippingMetafield($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          userErrors { field message }
        }
      }`,
      {
        variables: {
          metafields: [
            {
              ownerId: orderId,
              namespace: "orderease",
              key: "free_shipping_code",
              type: "single_line_text_field",
              value: code.trim(),
            },
          ],
        },
      },
    );
  } catch (err) {
    console.warn("[persistFreeShippingCode] Metafield save error:", err);
  }

  try {
    await addOrderTags(admin, orderId, false, [`free-shipping:${code.trim().toLowerCase()}`]);
  } catch (err) {
    console.warn("[persistFreeShippingCode] Tag save error:", err);
  }
}

/**
 * Detects whether an order currently has an active free shipping discount code,
 * and retrieves any maximum shipping price condition.
 */
export async function detectActiveFreeShipping(
  admin: AdminGraphQL,
  order: any,
): Promise<FreeShippingInfo> {
  const result: FreeShippingInfo = {
    hasFreeShipping: false,
    code: null,
    maxPrice: null,
  };

  if (!order) return result;

  // 1. Check OrderEase metafield
  const mfCode = order.metafield?.value?.trim();
  if (mfCode) {
    result.code = mfCode;
    result.hasFreeShipping = true;
  }

  // 2. Check Order tags (free-shipping:code)
  const tags: string[] = Array.isArray(order.tags) ? order.tags : [];
  for (const t of tags) {
    const match = t.match(/^free-shipping:(.+)$/i);
    if (match) {
      result.code = result.code || match[1].trim();
      result.hasFreeShipping = true;
    }
  }

  // 3. Check shipping line title for free shipping patterns
  const sTitle = order.shippingLine?.title || order.shippingLines?.nodes?.[0]?.title || "";
  const codeInTitleMatch =
    sTitle.match(/\(Free\s*-\s*([^)]+)\)/i) ||
    sTitle.match(/Free Shipping\s*\(([^)]+)\)/i);
  if (codeInTitleMatch) {
    result.code = result.code || codeInTitleMatch[1].trim();
    result.hasFreeShipping = true;
  } else if (/\(Free\)/i.test(sTitle) || /^Free Shipping/i.test(sTitle)) {
    result.hasFreeShipping = true;
  }

  // 4. Check if current shipping amount is 0 and title has free
  const sLine = order.shippingLine || order.shippingLines?.nodes?.[0];
  const currentAmt = parseFloat(
    sLine?.discountedPriceSet?.presentmentMoney?.amount ??
    sLine?.discountedPriceSet?.shopMoney?.amount ??
    sLine?.originalPriceSet?.presentmentMoney?.amount ??
    sLine?.originalPriceSet?.shopMoney?.amount ??
    order.currentShippingPriceSet?.shopMoney?.amount ??
    "1"
  );
  if (currentAmt === 0 && /\bfree\b/i.test(sTitle)) {
    result.hasFreeShipping = true;
  }

  // 5. Check shippingLine discountAllocations
  const allocs = sLine?.discountAllocations || [];
  for (const alloc of allocs) {
    const app = alloc.discountApplication;
    if (app?.code) {
      result.code = result.code || app.code;
      result.hasFreeShipping = true;
    }
  }

  // 6. Check order discountApplications
  const discountApps = order.discountApplications?.nodes || [];
  for (const app of discountApps) {
    if (app.targetType === "SHIPPING" && app.code) {
      result.code = result.code || app.code;
      result.hasFreeShipping = true;
    }
  }

function isShippingDestinationAllowed(dest: any, countryCode?: string | null): boolean {
  if (!dest) return true;
  if (dest.__typename === "DiscountCountryAll" || dest.allCountries) return true;
  if (dest.includeRestOfWorld) return true;
  if (!countryCode) return false;
  const allowed = (dest.countries || []).map((c: string) => String(c).toUpperCase());
  return allowed.includes(countryCode.trim().toUpperCase());
}

  // 7. Check discountCodes list on order
  const orderCountry = order.shippingAddress?.countryCode || null;
  const discountCodes = Array.isArray(order.discountCodes) ? order.discountCodes : [];
  if (!result.code && discountCodes.length > 0) {
    for (const dCode of discountCodes) {
      try {
        const checkRes = await admin.graphql(
          `#graphql
          query CheckFreeShippingDiscount($code: String!) {
            codeDiscountNodeByCode(code: $code) {
              codeDiscount {
                __typename
                ... on DiscountCodeFreeShipping {
                  status
                  maximumShippingPrice { amount }
                  destinationSelection {
                    __typename
                    ... on DiscountCountryAll {
                      allCountries
                    }
                    ... on DiscountCountries {
                      countries
                      includeRestOfWorld
                    }
                  }
                }
              }
            }
          }`,
          { variables: { code: dCode } },
        );
        const checkJson = (await checkRes.json()) as any;
        const disc = checkJson.data?.codeDiscountNodeByCode?.codeDiscount;
        if (disc?.__typename === "DiscountCodeFreeShipping" && disc.status === "ACTIVE") {
          if (!isShippingDestinationAllowed(disc.destinationSelection, orderCountry)) {
            continue;
          }
          result.code = dCode;
          result.hasFreeShipping = true;
          if (disc.maximumShippingPrice?.amount) {
            result.maxPrice = parseFloat(disc.maximumShippingPrice.amount);
          }
          break;
        }
      } catch (e) {
        console.warn("[detectActiveFreeShipping] discount check error:", e);
      }
    }
  }

  // 8. If we know the code, lookup maximumShippingPrice & destination condition if not loaded yet
  if (result.code) {
    try {
      const lookupRes = await admin.graphql(
        `#graphql
        query LookupFreeShippingDetails($code: String!) {
          codeDiscountNodeByCode(code: $code) {
            codeDiscount {
              __typename
              ... on DiscountCodeFreeShipping {
                status
                maximumShippingPrice { amount }
                destinationSelection {
                  __typename
                  ... on DiscountCountryAll {
                    allCountries
                  }
                  ... on DiscountCountries {
                    countries
                    includeRestOfWorld
                  }
                }
              }
            }
          }
        }`,
        { variables: { code: result.code } },
      );
      const lookupJson = (await lookupRes.json()) as any;
      const disc = lookupJson.data?.codeDiscountNodeByCode?.codeDiscount;
      if (disc?.__typename === "DiscountCodeFreeShipping") {
        if (!isShippingDestinationAllowed(disc.destinationSelection, orderCountry)) {
          // Discount code is not allowed for the order's shipping country!
          result.hasFreeShipping = false;
          result.code = null;
          return result;
        }
        if (result.maxPrice == null && disc.maximumShippingPrice?.amount) {
          result.maxPrice = parseFloat(disc.maximumShippingPrice.amount);
        }
      }
    } catch (e) {
      console.warn("[detectActiveFreeShipping] lookup error:", e);
    }
  }

  // 9. If hasFreeShipping is true but code is still null, look up any active store Free Shipping discount codes
  if (result.hasFreeShipping && !result.code) {
    try {
      const nodesRes = await admin.graphql(
        `#graphql
        query FindActiveFreeShippingCodes {
          codeDiscountNodes(first: 10, query: "type:free_shipping status:active") {
            nodes {
              codeDiscount {
                __typename
                ... on DiscountCodeFreeShipping {
                  codes(first: 5) {
                    nodes { code }
                  }
                  maximumShippingPrice { amount }
                  destinationSelection {
                    __typename
                    ... on DiscountCountryAll {
                      allCountries
                    }
                    ... on DiscountCountries {
                      countries
                      includeRestOfWorld
                    }
                  }
                }
              }
            }
          }
        }`
      );
      const nodesJson = (await nodesRes.json()) as any;
      const discNodes = nodesJson.data?.codeDiscountNodes?.nodes || [];
      for (const node of discNodes) {
        const disc = node.codeDiscount;
        if (!isShippingDestinationAllowed(disc?.destinationSelection, orderCountry)) {
          continue;
        }
        const foundCode = disc?.codes?.nodes?.[0]?.code;
        if (foundCode) {
          result.code = foundCode;
          if (disc.maximumShippingPrice?.amount) {
            result.maxPrice = parseFloat(disc.maximumShippingPrice.amount);
          }
          break;
        }
      }
    } catch (e) {
      console.warn("[detectActiveFreeShipping] fallback code query error:", e);
    }
  }

  // Auto-persist if we found a code and it wasn't in metafield
  if (order.id && result.code && !mfCode) {
    persistFreeShippingCode(admin, order.id, result.code).catch(() => {});
  }

  return result;
}
