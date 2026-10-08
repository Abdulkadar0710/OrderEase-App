import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { addOrderTags } from "../utils/orderTagsHelper.server";
import { trackOrderEdit } from "../utils/analyticsHelper.server";
import { checkOrderEditLimit } from "../utils/editLimitHelper.server";
import { detectActiveFreeShipping, persistFreeShippingCode } from "../utils/freeShippingHelper.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { sessionToken, cors } = await authenticate.public.customerAccount(request);

  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");

  if (!orderId) {
    return cors(Response.json({ error: "Missing orderId" }, { status: 400 }));
  }

  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  const { admin, session } = await unauthenticated.admin(storeDomain);

  try {
    const res = await admin.graphql(
      `#graphql
      query getOrderShippingMethod($id: ID!) {
        order(id: $id) {
          id
          currencyCode
          presentmentCurrencyCode
          tags
          discountCodes
          metafield(namespace: "orderease", key: "free_shipping_code") {
            value
          }
          discountApplications(first: 10) {
            nodes {
              targetType
              targetSelection
              ... on DiscountCodeApplication { code }
            }
          }
          shippingAddress {
            countryCode
            provinceCode
          }
          shippingLine {
            id
            title
            code
            originalPriceSet {
              presentmentMoney {
                amount
                currencyCode
              }
              shopMoney {
                amount
                currencyCode
              }
            }
            discountedPriceSet {
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
        }
      }`,
      { variables: { id: orderId } },
    );
    const json = await res.json();
    const order = json.data?.order;
    const shippingLine = order?.shippingLine ?? null;
    const freeShippingInfo = await detectActiveFreeShipping(admin, order);

    const activeCurrency =
      shippingLine?.originalPriceSet?.presentmentMoney?.currencyCode ||
      order?.presentmentCurrencyCode ||
      order?.currencyCode ||
      "USD";

    const currentShipping = shippingLine
      ? {
          title: shippingLine.title,
          code: shippingLine.code,
          amount: freeShippingInfo.hasFreeShipping
            ? "0.00"
            : shippingLine.discountedPriceSet?.presentmentMoney?.amount ||
              shippingLine.originalPriceSet?.presentmentMoney?.amount ||
              "0.00",
          currencyCode: activeCurrency,
        }
      : null;

    let availableMethods: Array<{ id: string; title: string; price: number }> = [];
    const orderCountry = order?.shippingAddress?.countryCode || null;

    interface ScoredMethod {
      id: string;
      title: string;
      price: number;
      score: number;
    }

    const scoredMap = new Map<string, ScoredMethod>();

    // Strategy 1: GraphQL deliveryProfiles with destination-zone matching
    try {
      const profilesRes = await admin.graphql(
        `#graphql
        query getStoreDeliveryProfiles {
          deliveryProfiles(first: 20) {
            nodes {
              id
              name
              default
              profileLocationGroups {
                locationGroupZones(first: 20) {
                  nodes {
                    zone {
                      id
                      name
                      countries {
                        code {
                          countryCode
                          restOfWorld
                        }
                      }
                    }
                    methodDefinitions(first: 20) {
                      nodes {
                        id
                        name
                        active
                        rateProvider {
                          __typename
                          ... on DeliveryRateDefinition {
                            price {
                              amount
                              currencyCode
                            }
                          }
                          ... on DeliveryParticipant {
                            id
                            fixedFee {
                              amount
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }`
      );
      const profilesJson = await profilesRes.json();
      const profiles = profilesJson.data?.deliveryProfiles?.nodes || [];

      for (const profile of profiles) {
        const isCustomProfile = !profile.default;
        const groups = profile.profileLocationGroups || [];
        for (const group of groups) {
          const zones = group.locationGroupZones?.nodes || [];
          for (const zoneNode of zones) {
            const zone = zoneNode.zone;
            const countries = zone?.countries || [];

            let isExactCountryMatch = false;
            let isRestOfWorldMatch = false;

            if (orderCountry) {
              for (const c of countries) {
                if (c.code?.countryCode === orderCountry) {
                  isExactCountryMatch = true;
                  break;
                }
                if (c.code?.restOfWorld) {
                  isRestOfWorldMatch = true;
                }
              }
            }

            // If order has a known destination country, skip zones that don't cover it
            if (orderCountry && !isExactCountryMatch && !isRestOfWorldMatch) {
              continue;
            }

            // Priority scoring:
            // 40: Custom profile with exact country match (e.g. dedicated North America profile for US)
            // 30: Default profile with exact country match
            // 20: Custom profile with rest of world match
            // 10: Default profile with rest of world match
            // 5: Generic fallback when no destination country is known
            let score = 5;
            if (isExactCountryMatch) {
              score = isCustomProfile ? 40 : 30;
            } else if (isRestOfWorldMatch) {
              score = isCustomProfile ? 20 : 10;
            }

            const defs = zoneNode.methodDefinitions?.nodes || [];
            for (const def of defs) {
              const name = def.name;
              if (!name) continue;

              let price = 0;
              if (def.rateProvider?.__typename === "DeliveryRateDefinition" && def.rateProvider.price?.amount) {
                price = parseFloat(def.rateProvider.price.amount);
              } else if (def.rateProvider?.__typename === "DeliveryParticipant" && def.rateProvider.fixedFee?.amount) {
                price = parseFloat(def.rateProvider.fixedFee.amount);
              }

              const key = name.toLowerCase().trim();
              const existing = scoredMap.get(key);
              if (!existing || score > existing.score) {
                scoredMap.set(key, {
                  id: def.id || key,
                  title: name,
                  price,
                  score,
                });
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("[order-shipping-loader] GraphQL deliveryProfiles fetch error:", e);
    }

    // Strategy 2: REST shipping_zones.json fallback if GraphQL returned nothing
    if (scoredMap.size === 0 && session?.accessToken) {
      try {
        const restRes = await fetch(`https://${storeDomain}/admin/api/2026-04/shipping_zones.json`, {
          headers: {
            "X-Shopify-Access-Token": session.accessToken,
            "Content-Type": "application/json",
          },
        });
        if (restRes.ok) {
          const restJson = await restRes.json();
          const zones = restJson.shipping_zones || [];
          for (const zone of zones) {
            const priceRates = zone.price_based_shipping_rates || [];
            const weightRates = zone.weight_based_shipping_rates || [];
            const carrierProviders = zone.carrier_shipping_rate_providers || [];

            for (const rate of [...priceRates, ...weightRates]) {
              const name = rate.name;
              const price = parseFloat(rate.price || "0.00");
              if (name && !scoredMap.has(name.toLowerCase())) {
                scoredMap.set(name.toLowerCase(), {
                  id: String(rate.id || name.toLowerCase()),
                  title: name,
                  price,
                  score: 1,
                });
              }
            }
            for (const provider of carrierProviders) {
              const name = provider.service_discovery_name || provider.carrier_service_id || "Carrier Shipping";
              const price = parseFloat(provider.flat_modifier || "0.00");
              if (name && !scoredMap.has(name.toLowerCase())) {
                scoredMap.set(name.toLowerCase(), {
                  id: String(provider.id || name.toLowerCase()),
                  title: name,
                  price,
                  score: 1,
                });
              }
            }
          }
        }
      } catch (restErr) {
        console.warn("[order-shipping-loader] REST shipping_zones fetch error:", restErr);
      }
    }

    availableMethods = Array.from(scoredMap.values()).map(({ id, title, price }) => ({
      id,
      title,
      price,
    }));

    if (freeShippingInfo.hasFreeShipping) {
      availableMethods = availableMethods.map((m) => {
        const qualifies = freeShippingInfo.maxPrice == null || m.price <= freeShippingInfo.maxPrice;
        if (qualifies) {
          return {
            ...m,
            originalPrice: m.price,
            price: 0,
            freeShippingApplied: true,
          };
        }
        return m;
      });
    }

    return cors(
      Response.json({
        currentShipping,
        currencyCode: activeCurrency,
        availableMethods,
        hasFreeShipping: freeShippingInfo.hasFreeShipping,
        activeFreeShippingCode: freeShippingInfo.code,
      }),
    );
  } catch (err) {
    console.error("[order-shipping-loader] Error:", err);
    return cors(Response.json({ currentShipping: null, currencyCode: "INR", availableMethods: [] }));
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { sessionToken, cors } = await authenticate.public.customerAccount(request);

  if (request.method === "OPTIONS") {
    return cors(new Response(null, { status: 200, headers: { "Content-Type": "application/json" } }));
  }

  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  const customerAccountId = sessionToken.sub;
  const { admin } = await unauthenticated.admin(storeDomain);

  const body = await request.json();
  const { orderId, title, price, currencyCode = "USD" } = body;

  if (!orderId || !title || price === undefined || price === null) {
    return cors(
      Response.json({ userErrors: [{ message: "Missing orderId, title, or price." }] }, { status: 400 }),
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

  // ── Ownership check ────────────────────────────────────────────────────────
  const ownerRes = await admin.graphql(
    `#graphql
    query getOrderOwnerForShipping($id: ID!) {
      order(id: $id) {
        id
        currencyCode
        presentmentCurrencyCode
        shippingAddress { countryCode provinceCode }
        customer { id }
        tags
        discountCodes
        metafield(namespace: "orderease", key: "free_shipping_code") {
          value
        }
        discountApplications(first: 10) {
          nodes {
            targetType
            targetSelection
            ... on DiscountCodeApplication { code }
          }
        }
        shippingLine {
          id
          title
          code
          originalPriceSet {
            presentmentMoney { amount currencyCode }
            shopMoney { amount currencyCode }
          }
          discountedPriceSet {
            presentmentMoney { amount currencyCode }
            shopMoney { amount currencyCode }
          }
        }
      }
    }`,
    { variables: { id: orderId } },
  );
  const ownerJson = await ownerRes.json();
  const order = ownerJson.data?.order;

  if (!order) {
    return cors(Response.json({ userErrors: [{ message: "Order not found." }] }, { status: 404 }));
  }

  const numericId = (gidOrId?: string | null) => gidOrId?.match(/\d+$/)?.[0];
  if (!order.customer?.id || numericId(order.customer.id) !== numericId(customerAccountId)) {
    return cors(Response.json({ userErrors: [{ message: "Not authorized to update this order." }] }, { status: 403 }));
  }

  try {
    // Check if active free shipping discount exists on this order
    const freeShippingInfo = await detectActiveFreeShipping(admin, order);
    const numericPrice = typeof price === "number" ? price : parseFloat(String(price));
    const cleanTitle = (title || "")
      .replace(/\s*\(Free(?:\s*-\s*[^)]+)?\)/gi, "")
      .replace(/\s*\(Already Applied\)/gi, "")
      .trim();

    let finalPrice = numericPrice;
    let finalTitle = cleanTitle;

    const qualifiesForFreeShipping =
      freeShippingInfo.hasFreeShipping &&
      (freeShippingInfo.maxPrice == null || numericPrice <= freeShippingInfo.maxPrice);

    if (qualifiesForFreeShipping) {
      finalPrice = 0;
      finalTitle = freeShippingInfo.code
        ? `${cleanTitle} (Free - ${freeShippingInfo.code})`
        : `${cleanTitle} (Free)`;
    }

    // Step 1: Begin order edit session
    const beginRes = await admin.graphql(
      `#graphql
      mutation OrderEditBeginForShipping($id: ID!) {
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
    const calculatedOrderId = calculatedOrder.id;
    const existingLines = calculatedOrder.shippingLines ?? [];

    // Step 2: Remove existing shipping lines if present
    for (const line of existingLines) {
      const removeRes = await admin.graphql(
        `#graphql
        mutation OrderEditRemoveShippingLine($id: ID!, $shippingLineId: ID!) {
          orderEditRemoveShippingLine(id: $id, shippingLineId: $shippingLineId) {
            calculatedOrder { id }
            userErrors { field message }
          }
        }`,
        { variables: { id: calculatedOrderId, shippingLineId: line.id } },
      );
      const removeJson = await removeRes.json();
      const removeErrors = removeJson.data?.orderEditRemoveShippingLine?.userErrors ?? [];
      if (removeErrors.length) {
        console.warn("[order-shipping] Warning removing line:", removeErrors);
      }
    }

    // Resolve target currency accurately to prevent currency mismatch in Order Editing
    const targetCurrency =
      calculatedOrder.totalPriceSet?.presentmentMoney?.currencyCode ||
      order.presentmentCurrencyCode ||
      order.shippingLine?.originalPriceSet?.presentmentMoney?.currencyCode ||
      order.currencyCode ||
      currencyCode ||
      "USD";

    // Step 3: Add new shipping line
    let addRes = await admin.graphql(
      `#graphql
      mutation OrderEditAddShippingLine($id: ID!, $shippingLine: OrderEditAddShippingLineInput!) {
        orderEditAddShippingLine(id: $id, shippingLine: $shippingLine) {
          calculatedOrder { id }
          calculatedShippingLine {
            id
            title
            price {
              presentmentMoney {
                amount
                currencyCode
              }
            }
          }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          id: calculatedOrderId,
          shippingLine: {
            title: finalTitle,
            price: {
              amount: finalPrice,
              currencyCode: targetCurrency,
            },
          },
        },
      },
    );
    let addJson = await addRes.json();
    let addErrors = addJson.data?.orderEditAddShippingLine?.userErrors ?? [];

    // Fallback: If currency code was rejected by Shopify (e.g. "The price must be in USD."), retry with expected currency
    if (addErrors.length) {
      const currencyMatch = addErrors[0]?.message?.match(/must be in ([A-Z]{3})/i);
      if (currencyMatch) {
        const retryCurrency = currencyMatch[1].toUpperCase();
        addRes = await admin.graphql(
          `#graphql
          mutation OrderEditAddShippingLineRetry($id: ID!, $shippingLine: OrderEditAddShippingLineInput!) {
            orderEditAddShippingLine(id: $id, shippingLine: $shippingLine) {
              calculatedOrder { id }
              userErrors { field message }
            }
          }`,
          {
            variables: {
              id: calculatedOrderId,
              shippingLine: {
                title: finalTitle,
                price: {
                  amount: finalPrice,
                  currencyCode: retryCurrency,
                },
              },
            },
          },
        );
        addJson = await addRes.json();
        addErrors = addJson.data?.orderEditAddShippingLine?.userErrors ?? [];
      }
    }

    if (addErrors.length) {
      return cors(Response.json({ userErrors: addErrors }, { status: 422 }));
    }

    // Step 4: Commit order edit
    const staffNote = qualifiesForFreeShipping && freeShippingInfo.code
      ? `Shipping method updated to ${cleanTitle} with free shipping discount (${freeShippingInfo.code})`
      : "Shipping method updated by customer via Customer Account UI";

    const commitRes = await admin.graphql(
      `#graphql
      mutation OrderEditCommitShipping($id: ID!, $staffNote: String) {
        orderEditCommit(id: $id, notifyCustomer: true, staffNote: $staffNote) {
          order {
            id
            name
            statusPageUrl
            totalOutstandingSet {
              presentmentMoney { amount currencyCode }
              shopMoney { amount currencyCode }
            }
          }
          userErrors { field message }
        }
      }`,
      {
        variables: {
          id: calculatedOrderId,
          staffNote,
        },
      },
    );
    const commitJson = await commitRes.json();
    const commitErrors = commitJson.data?.orderEditCommit?.userErrors ?? [];
    if (commitErrors.length) {
      return cors(Response.json({ userErrors: commitErrors }, { status: 422 }));
    }

    const updatedOrder = commitJson.data.orderEditCommit.order;
    const balanceDue =
      updatedOrder?.totalOutstandingSet?.presentmentMoney ??
      updatedOrder?.totalOutstandingSet?.shopMoney ??
      null;
    const owesRefund = balanceDue ? parseFloat(balanceDue.amount) < 0 : false;

    // Preserve free shipping code in metafield and tags
    if (qualifiesForFreeShipping && freeShippingInfo.code) {
      await persistFreeShippingCode(admin, orderId, freeShippingInfo.code);
    }
    const extraTags =
      qualifiesForFreeShipping && freeShippingInfo.code
        ? [`free-shipping:${freeShippingInfo.code.toLowerCase()}`]
        : [];
    await addOrderTags(admin, orderId, owesRefund, extraTags);

    // Track order edit and feature usage
    const { source } = body || {};
    await trackOrderEdit({
      shop: storeDomain,
      orderId,
      featureId: "change-shipping-method",
      source,
    });

    return cors(Response.json({ order: updatedOrder, balanceDue, userErrors: [] }));
  } catch (err: unknown) {
    console.error("[order-shipping] Unexpected error:", err);
    return cors(
      Response.json(
        { userErrors: [{ message: err instanceof Error ? err.message : "Internal error updating shipping method" }] },
        { status: 500 },
      ),
    );
  }
}
