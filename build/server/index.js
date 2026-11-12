var _a;
import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter, UNSAFE_withComponentProps, Meta, Links, Outlet, ScrollRestoration, Scripts, useLoaderData, useActionData, Form, redirect, UNSAFE_withErrorBoundaryProps, useRouteError, useFetcher, useSearchParams, useNavigate, useLocation } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { isbot } from "isbot";
import "@shopify/shopify-app-react-router/adapters/node";
import { shopifyApp, AppDistribution, ApiVersion, LoginErrorType, boundary } from "@shopify/shopify-app-react-router/server";
import { PrismaSessionStorage } from "@shopify/shopify-app-session-storage-prisma";
import { PrismaClient } from "@prisma/client";
import { useEffect, useState, useRef } from "react";
import crypto from "node:crypto";
import PDFDocument from "pdfkit";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
if (process.env.NODE_ENV !== "production") {
  if (!global.prismaGlobal) {
    global.prismaGlobal = new PrismaClient();
  }
}
const prisma = global.prismaGlobal ?? new PrismaClient();
const shopify = shopifyApp({
  apiKey: process.env.SHOPIFY_API_KEY,
  apiSecretKey: process.env.SHOPIFY_API_SECRET || "",
  apiVersion: ApiVersion.July26,
  scopes: (_a = process.env.SCOPES) == null ? void 0 : _a.split(","),
  appUrl: process.env.SHOPIFY_APP_URL || "",
  authPathPrefix: "/auth",
  sessionStorage: new PrismaSessionStorage(prisma),
  distribution: AppDistribution.AppStore,
  future: {
    expiringOfflineAccessTokens: true
  },
  ...process.env.SHOP_CUSTOM_DOMAIN ? { customShopDomains: [process.env.SHOP_CUSTOM_DOMAIN] } : {}
});
ApiVersion.July26;
const addDocumentResponseHeaders = shopify.addDocumentResponseHeaders;
const authenticate = shopify.authenticate;
const unauthenticated = shopify.unauthenticated;
const login = shopify.login;
shopify.registerWebhooks;
shopify.sessionStorage;
const streamTimeout = 5e3;
async function handleRequest(request, responseStatusCode, responseHeaders, reactRouterContext) {
  addDocumentResponseHeaders(request, responseHeaders);
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? "") ? "onAllReady" : "onShellReady";
  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      /* @__PURE__ */ jsx(
        ServerRouter,
        {
          context: reactRouterContext,
          url: request.url
        }
      ),
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        }
      }
    );
    setTimeout(abort, streamTimeout + 1e3);
  });
}
const entryServer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: handleRequest,
  streamTimeout
}, Symbol.toStringTag, { value: "Module" }));
const root = UNSAFE_withComponentProps(function App() {
  useEffect(() => {
    if (document.querySelector('script[src*="embed.tawk.to"]')) return;
    window.Tawk_API = window.Tawk_API || {};
    window.Tawk_LoadStart = /* @__PURE__ */ new Date();
    const s1 = document.createElement("script");
    const s0 = document.getElementsByTagName("script")[0];
    s1.async = true;
    s1.src = "https://embed.tawk.to/6ad09aba55f62534c89dc987/1k4vdor2h";
    s1.charset = "UTF-8";
    s1.setAttribute("crossorigin", "*");
    if (s0 && s0.parentNode) {
      s0.parentNode.insertBefore(s1, s0);
    } else {
      document.head.appendChild(s1);
    }
  }, []);
  return /* @__PURE__ */ jsxs("html", {
    lang: "en",
    children: [/* @__PURE__ */ jsxs("head", {
      children: [/* @__PURE__ */ jsx("meta", {
        charSet: "utf-8"
      }), /* @__PURE__ */ jsx("meta", {
        name: "viewport",
        content: "width=device-width,initial-scale=1"
      }), /* @__PURE__ */ jsx("link", {
        rel: "preconnect",
        href: "https://cdn.shopify.com/"
      }), /* @__PURE__ */ jsx("link", {
        rel: "stylesheet",
        href: "https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
      }), /* @__PURE__ */ jsx(Meta, {}), /* @__PURE__ */ jsx(Links, {})]
    }), /* @__PURE__ */ jsxs("body", {
      children: [/* @__PURE__ */ jsx(Outlet, {}), /* @__PURE__ */ jsx(ScrollRestoration, {}), /* @__PURE__ */ jsx(Scripts, {})]
    })]
  });
});
const route0 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: root
}, Symbol.toStringTag, { value: "Module" }));
const TAG_UPDATED = "Order-Updated";
const TAG_REFUND = "Refund";
async function getOrderTags(admin, orderId) {
  var _a2, _b;
  const res = await admin.graphql(
    `#graphql
    query GetOrderTags($id: ID!) {
      order(id: $id) {
        tags
      }
    }`,
    { variables: { id: orderId } }
  );
  const json = await res.json();
  return ((_b = (_a2 = json.data) == null ? void 0 : _a2.order) == null ? void 0 : _b.tags) ?? [];
}
async function addOrderTags(admin, orderId, owesRefund = false, extraTags = []) {
  var _a2, _b;
  try {
    const existingTags = await getOrderTags(admin, orderId);
    const existingSet = new Set(existingTags.map((t) => t.toLowerCase()));
    const tagsToAdd = [];
    if (!existingSet.has(TAG_UPDATED.toLowerCase())) {
      tagsToAdd.push(TAG_UPDATED);
    }
    if (owesRefund && !existingSet.has(TAG_REFUND.toLowerCase())) {
      tagsToAdd.push(TAG_REFUND);
    }
    for (const tag of extraTags) {
      if (tag && !existingSet.has(tag.toLowerCase())) {
        tagsToAdd.push(tag);
      }
    }
    if (tagsToAdd.length === 0) {
      return;
    }
    const mergedTags = [...existingTags, ...tagsToAdd];
    const updateRes = await admin.graphql(
      `#graphql
      mutation AddOrderTags($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
            tags
          }
          userErrors { field message }
        }
      }`,
      { variables: { input: { id: orderId, tags: mergedTags } } }
    );
    const updateJson = await updateRes.json();
    const errors = ((_b = (_a2 = updateJson.data) == null ? void 0 : _a2.orderUpdate) == null ? void 0 : _b.userErrors) ?? [];
    if (errors.length) {
      console.warn("[orderTagsHelper] Failed to update tags:", errors);
    }
  } catch (err) {
    console.error("[orderTagsHelper] Unexpected error while updating tags:", err);
  }
}
const TAG_PAYMENT_PENDING = "Payment-Pending";
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
async function applyPaymentPendingHold(admin, orderId) {
  var _a2, _b, _c, _d, _e, _f, _g, _h;
  const normalizedOrderId = orderId.includes("gid://shopify/Order/") ? orderId : `gid://shopify/Order/${orderId}`;
  const errors = [];
  let holdsApplied = 0;
  try {
    await addOrderTags(admin, normalizedOrderId, false, [TAG_PAYMENT_PENDING]);
  } catch (tagErr) {
    console.error("[applyPaymentPendingHold] Error tagging order:", tagErr);
    errors.push(
      tagErr instanceof Error ? tagErr.message : "Failed to add Payment-Pending tag"
    );
  }
  try {
    const foRes = await admin.graphql(GET_FULFILLMENT_ORDERS_QUERY, {
      variables: { id: normalizedOrderId }
    });
    const foJson = await foRes.json();
    if ((_a2 = foJson.errors) == null ? void 0 : _a2.length) {
      console.warn(
        "[applyPaymentPendingHold] GraphQL errors fetching fulfillment orders:",
        foJson.errors
      );
      errors.push(((_b = foJson.errors[0]) == null ? void 0 : _b.message) || "GraphQL error on fulfillmentOrders query");
    }
    const fulfillmentOrders = ((_e = (_d = (_c = foJson.data) == null ? void 0 : _c.order) == null ? void 0 : _d.fulfillmentOrders) == null ? void 0 : _e.nodes) ?? [];
    for (const fo of fulfillmentOrders) {
      if (fo.status === "ON_HOLD") continue;
      const canHold = ((_f = fo.supportedActions) == null ? void 0 : _f.some(
        (a) => a.action === "HOLD"
      )) || fo.status === "OPEN" || fo.status === "SCHEDULED";
      if (!canHold) continue;
      try {
        const holdRes = await admin.graphql(FULFILLMENT_ORDER_HOLD_MUTATION, {
          variables: {
            id: fo.id,
            fulfillmentHold: {
              reason: "AWAITING_PAYMENT",
              reasonNotes: "Order edit created an unpaid balance due. Awaiting customer invoice payment.",
              notifyMerchant: false
            }
          }
        });
        const holdJson = await holdRes.json();
        const userErrors = ((_h = (_g = holdJson.data) == null ? void 0 : _g.fulfillmentOrderHold) == null ? void 0 : _h.userErrors) ?? [];
        if (userErrors.length > 0) {
          console.warn(
            `[applyPaymentPendingHold] Fulfillment hold errors on ${fo.id}:`,
            userErrors
          );
          errors.push(userErrors.map((e) => e.message).join(", "));
        } else {
          holdsApplied++;
        }
      } catch (holdErr) {
        console.error(
          `[applyPaymentPendingHold] Failed to hold fulfillment order ${fo.id}:`,
          holdErr
        );
        errors.push(
          holdErr instanceof Error ? holdErr.message : `Failed to hold FO ${fo.id}`
        );
      }
    }
  } catch (err) {
    console.error(
      "[applyPaymentPendingHold] Error fetching fulfillment orders:",
      err
    );
    errors.push(
      err instanceof Error ? err.message : "Error fetching fulfillment orders"
    );
  }
  return {
    success: errors.length === 0,
    holdsApplied,
    errors
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
const REMOVE_TAGS_MUTATION$1 = `#graphql
  mutation RemoveOrderTags($id: ID!, $tags: [String!]!) {
    tagsRemove(id: $id, tags: $tags) {
      userErrors {
        field
        message
      }
    }
  }
`;
async function releasePaymentPendingHold(admin, orderId) {
  var _a2, _b, _c, _d, _e;
  const normalizedOrderId = orderId.includes("gid://shopify/Order/") ? orderId : `gid://shopify/Order/${orderId}`;
  const errors = [];
  let holdsReleased = 0;
  try {
    await admin.graphql(REMOVE_TAGS_MUTATION$1, {
      variables: {
        id: normalizedOrderId,
        tags: [TAG_PAYMENT_PENDING]
      }
    });
  } catch (tagErr) {
    console.error("[releasePaymentPendingHold] Error removing tag:", tagErr);
    errors.push(
      tagErr instanceof Error ? tagErr.message : "Error removing tag"
    );
  }
  try {
    const foRes = await admin.graphql(GET_FULFILLMENT_ORDERS_QUERY, {
      variables: { id: normalizedOrderId }
    });
    const foJson = await foRes.json();
    const fulfillmentOrders = ((_c = (_b = (_a2 = foJson.data) == null ? void 0 : _a2.order) == null ? void 0 : _b.fulfillmentOrders) == null ? void 0 : _c.nodes) ?? [];
    for (const fo of fulfillmentOrders) {
      if (fo.status !== "ON_HOLD") continue;
      try {
        const relRes = await admin.graphql(
          RELEASE_FULFILLMENT_ORDER_HOLD_MUTATION,
          { variables: { id: fo.id } }
        );
        const relJson = await relRes.json();
        const userErrors = ((_e = (_d = relJson.data) == null ? void 0 : _d.fulfillmentOrderReleaseHold) == null ? void 0 : _e.userErrors) ?? [];
        if (userErrors.length > 0) {
          console.warn(
            `[releasePaymentPendingHold] Errors releasing FO ${fo.id}:`,
            userErrors
          );
          errors.push(userErrors.map((e) => e.message).join(", "));
        } else {
          holdsReleased++;
        }
      } catch (relErr) {
        console.error(
          `[releasePaymentPendingHold] Failed releasing FO ${fo.id}:`,
          relErr
        );
        errors.push(
          relErr instanceof Error ? relErr.message : `Failed releasing FO ${fo.id}`
        );
      }
    }
  } catch (err) {
    console.error(
      "[releasePaymentPendingHold] Error fetching fulfillment orders:",
      err
    );
    errors.push(
      err instanceof Error ? err.message : "Error fetching fulfillment orders"
    );
  }
  return {
    success: errors.length === 0,
    holdsReleased,
    errors
  };
}
async function trackOrderEdit({
  shop,
  orderId,
  featureId,
  source = "customer_account_ui"
}) {
  try {
    if (!shop || !orderId) return;
    const validSource = source === "checkout_ui" ? "checkout_ui" : "customer_account_ui";
    await prisma.editedOrder.create({
      data: {
        shop,
        orderId,
        source: validSource
      }
    });
    if (featureId) {
      await trackFeatureUsage({ shop, featureId });
    }
  } catch (error) {
    console.error("[analyticsHelper] Error tracking order edit:", error);
  }
}
async function trackFeatureUsage({
  shop,
  featureId
}) {
  try {
    if (!shop || !featureId) return;
    await prisma.featureUsage.upsert({
      where: {
        shop_featureId: { shop, featureId }
      },
      create: {
        shop,
        featureId,
        usedCount: 1
      },
      update: {
        usedCount: { increment: 1 }
      }
    });
  } catch (error) {
    console.error("[analyticsHelper] Error tracking feature usage:", error);
  }
}
async function checkOrderEditLimit({
  shop,
  orderId
}) {
  if (!shop || !orderId) {
    return { isLimitReached: false, currentEditCount: 0, maxEdits: null };
  }
  const normalizedOrderId = orderId.includes("gid://shopify/Order/") ? orderId : `gid://shopify/Order/${orderId}`;
  const rawId = orderId.replace(/^gid:\/\/shopify\/Order\//, "");
  const timeLimitRecord = await prisma.orderEditTimeLimit.findUnique({
    where: { shop }
  });
  const maxEdits = timeLimitRecord ? timeLimitRecord.maxEdits : 3;
  if (maxEdits === null || maxEdits <= 0) {
    const currentEditCount2 = await prisma.editedOrder.count({
      where: {
        shop,
        orderId: { in: [normalizedOrderId, rawId] }
      }
    });
    return { isLimitReached: false, currentEditCount: currentEditCount2, maxEdits: null };
  }
  const currentEditCount = await prisma.editedOrder.count({
    where: {
      shop,
      orderId: { in: [normalizedOrderId, rawId] }
    }
  });
  const isLimitReached = currentEditCount >= maxEdits;
  return {
    isLimitReached,
    currentEditCount,
    maxEdits
  };
}
async function isServiceEnabled(shop, serviceId) {
  const ids = Array.isArray(serviceId) ? serviceId : [serviceId];
  if (ids.length === 0) return false;
  const normalizedShop = shop.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase().trim();
  if (!normalizedShop) return false;
  const row = await prisma.serviceSettings.findFirst({
    where: {
      shop: normalizedShop,
      id: { in: ids },
      enabled: true
    },
    select: { id: true }
  });
  return Boolean(row);
}
function extractNumericId(id) {
  if (!id) return null;
  const match = id.match(/\d+$/);
  return match ? match[0] : id;
}
function isCustomerAuthorized(orderCustomerId, sessionCustomerId) {
  if (!orderCustomerId || !sessionCustomerId) return false;
  if (orderCustomerId === sessionCustomerId) return true;
  const num1 = extractNumericId(orderCustomerId);
  const num2 = extractNumericId(sessionCustomerId);
  return Boolean(num1 && num2 && num1 === num2);
}
function getTimeLimitInMs(record) {
  if (!record || !record.timeLimit) return 60 * 60 * 1e3;
  const preset = record.timeLimit;
  if (preset === "15m") return 15 * 60 * 1e3;
  if (preset === "30m") return 30 * 60 * 1e3;
  if (preset === "1h") return 60 * 60 * 1e3;
  if (preset === "2h") return 2 * 60 * 60 * 1e3;
  if (preset === "1d") return 24 * 60 * 60 * 1e3;
  if (preset === "2d") return 48 * 60 * 60 * 1e3;
  if (preset === "custom") {
    const val = Number(record.customValue) || 1;
    if (record.customUnit === "minutes") return val * 60 * 1e3;
    if (record.customUnit === "hours") return val * 60 * 60 * 1e3;
    if (record.customUnit === "days") return val * 24 * 60 * 60 * 1e3;
    return val * 60 * 60 * 1e3;
  }
  return 60 * 60 * 1e3;
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
async function validateOrderEditable({
  admin,
  shop,
  orderId,
  customerAccountId,
  checkFulfillment = true,
  checkCancellation = true,
  checkTimeLimit = true,
  checkEditLimit = true,
  requiredServiceId
}) {
  var _a2, _b;
  if (!orderId) {
    return { allowed: false, status: 400, message: "Missing order ID." };
  }
  if (requiredServiceId) {
    const enabled = await isServiceEnabled(shop, requiredServiceId);
    if (!enabled) {
      return {
        allowed: false,
        status: 403,
        message: "This feature is not enabled by the merchant."
      };
    }
  }
  const normalizedOrderId = orderId.includes("gid://shopify/Order/") ? orderId : `gid://shopify/Order/${orderId}`;
  try {
    const res = await admin.graphql(ORDER_GUARD_QUERY, {
      variables: { id: normalizedOrderId }
    });
    const json = await res.json();
    const order = (_a2 = json.data) == null ? void 0 : _a2.order;
    if (!order) {
      return { allowed: false, status: 404, message: "Order not found." };
    }
    if (!isCustomerAuthorized((_b = order.customer) == null ? void 0 : _b.id, customerAccountId)) {
      return {
        allowed: false,
        status: 403,
        message: "You are not authorized to modify this order."
      };
    }
    if (checkCancellation && order.cancelledAt) {
      return {
        allowed: false,
        status: 422,
        message: "This order has already been cancelled and cannot be modified."
      };
    }
    if (checkFulfillment && order.displayFulfillmentStatus && order.displayFulfillmentStatus !== "UNFULFILLED" && order.displayFulfillmentStatus !== "ON_HOLD") {
      return {
        allowed: false,
        status: 422,
        message: "This order has already been processed or shipped and can no longer be modified."
      };
    }
    if (checkTimeLimit && order.createdAt) {
      const timeLimitRecord = await prisma.orderEditTimeLimit.findUnique({
        where: { shop }
      });
      const limitMs = getTimeLimitInMs(timeLimitRecord);
      if (limitMs > 0) {
        const orderCreatedTime = new Date(order.createdAt).getTime();
        if (Date.now() > orderCreatedTime + limitMs) {
          return {
            allowed: false,
            status: 422,
            message: "The time limit to edit this order has expired."
          };
        }
      }
    }
    if (checkEditLimit) {
      const editLimitCheck = await checkOrderEditLimit({
        shop,
        orderId: normalizedOrderId
      });
      if (editLimitCheck.isLimitReached) {
        return {
          allowed: false,
          status: 422,
          message: `You have reached the maximum allowed edits (${editLimitCheck.maxEdits} edits) for this order.`
        };
      }
    }
    return { allowed: true, order };
  } catch (err) {
    console.error("[validateOrderEditable] Error:", err);
    return {
      allowed: false,
      status: 500,
      message: err instanceof Error ? err.message : "Error validating order access."
    };
  }
}
const TAG_PREFIX = "@d2:";
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function decodeTag(description) {
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
    const parsed = JSON.parse(rawJson);
    return {
      checkoutAmount: parsed.c ?? 0,
      productAmount: parsed.p ?? 0,
      orderAmount: parsed.o ?? 0,
      label,
      bxgy: parsed.bxgy
    };
  } catch {
    return null;
  }
}
function lineItemMatchesBuyX(item, buyRule) {
  var _a2, _b, _c, _d, _e, _f, _g;
  const variantIds = buyRule.buyVariantIds || buyRule.variantIds;
  const productIds = buyRule.buyProductIds || buyRule.productIds;
  const collectionIds = buyRule.buyCollectionIds || buyRule.collectionIds;
  const hasSpecific = variantIds && variantIds.size > 0 || productIds && productIds.size > 0 || collectionIds && collectionIds.size > 0;
  if (!hasSpecific) return true;
  const variantId = (_a2 = item.variant) == null ? void 0 : _a2.id;
  const productId = (_c = (_b = item.variant) == null ? void 0 : _b.product) == null ? void 0 : _c.id;
  const itemCollectionIds = ((_g = (_f = (_e = (_d = item.variant) == null ? void 0 : _d.product) == null ? void 0 : _e.collections) == null ? void 0 : _f.nodes) == null ? void 0 : _g.map((c) => c.id)) ?? [];
  if (variantId && (variantIds == null ? void 0 : variantIds.has(variantId))) return true;
  if (productId && (productIds == null ? void 0 : productIds.has(productId))) return true;
  if (collectionIds && itemCollectionIds.some((id) => collectionIds.has(id))) return true;
  return false;
}
async function getBxgyRuleForCode(admin, code) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
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
      { variables: { code: code.trim().toUpperCase() } }
    );
    const json = await res.json();
    const node = (_a2 = json.data) == null ? void 0 : _a2.codeDiscountNodeByCode;
    const discount = node == null ? void 0 : node.codeDiscount;
    if (!discount || discount.__typename !== "DiscountCodeBxgy") {
      return null;
    }
    const buyItems = (_b = discount.customerBuys) == null ? void 0 : _b.items;
    const buyVal = (_c = discount.customerBuys) == null ? void 0 : _c.value;
    const getItems = (_d = discount.customerGets) == null ? void 0 : _d.items;
    const buyVariantIds = (((_e = buyItems == null ? void 0 : buyItems.productVariants) == null ? void 0 : _e.nodes) ?? []).map((n) => n.id);
    const buyProductIds = (((_f = buyItems == null ? void 0 : buyItems.products) == null ? void 0 : _f.nodes) ?? []).map((n) => n.id);
    const buyCollectionIds = (((_g = buyItems == null ? void 0 : buyItems.collections) == null ? void 0 : _g.nodes) ?? []).map((n) => n.id);
    const getVariantIds = (((_h = getItems == null ? void 0 : getItems.productVariants) == null ? void 0 : _h.nodes) ?? []).map((n) => n.id);
    const getProductIds = (((_i = getItems == null ? void 0 : getItems.products) == null ? void 0 : _i.nodes) ?? []).map((n) => n.id);
    const getCollectionIds = (((_j = getItems == null ? void 0 : getItems.collections) == null ? void 0 : _j.nodes) ?? []).map((n) => n.id);
    let minQuantity = 1;
    let minAmount = 0;
    if (buyVal == null ? void 0 : buyVal.quantity) {
      minQuantity = parseInt(String(buyVal.quantity), 10) || 1;
    } else if (buyVal == null ? void 0 : buyVal.amount) {
      minAmount = parseFloat(String(buyVal.amount)) || 0;
    }
    const getQuantity = parseInt(String(((_m = (_l = (_k = discount.customerGets) == null ? void 0 : _k.value) == null ? void 0 : _l.quantity) == null ? void 0 : _m.quantity) || 1), 10) || 1;
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
      getQuantity
    };
  } catch (err) {
    console.warn("[bxgy] Error resolving discount code:", err);
    return null;
  }
}
async function checkAndRemoveInvalidBxgyDiscounts(admin, calculatedOrderId) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i;
  try {
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
      { variables: { id: calculatedOrderId } }
    );
    const json = await res.json();
    const calculatedOrder = (_a2 = json.data) == null ? void 0 : _a2.node;
    const lineItems = ((_b = calculatedOrder == null ? void 0 : calculatedOrder.lineItems) == null ? void 0 : _b.nodes) ?? [];
    if (lineItems.length === 0) {
      return { removedCount: 0, removedProducts: [] };
    }
    const activeItems = lineItems.filter((item) => {
      const qty = item.editableQuantity ?? item.quantity;
      return qty > 0;
    });
    const candidates = [];
    for (const item of activeItems) {
      const allocations = item.calculatedDiscountAllocations ?? [];
      for (const alloc of allocations) {
        const app2 = alloc.discountApplication;
        if (!app2) continue;
        let code = "";
        const decoded = decodeTag(app2.description);
        if ((_c = decoded == null ? void 0 : decoded.bxgy) == null ? void 0 : _c.code) {
          code = decoded.bxgy.code;
        } else {
          const potentialCode = (app2.description || "").trim();
          if (potentialCode && !potentialCode.startsWith(TAG_PREFIX)) {
            code = potentialCode;
          }
        }
        if (code) {
          const bxgyRule = await getBxgyRuleForCode(admin, code);
          if (bxgyRule) {
            candidates.push({
              lineItemId: item.id,
              lineItemTitle: ((_e = (_d = item.variant) == null ? void 0 : _d.product) == null ? void 0 : _e.title) || item.title || "Product",
              discountApplicationId: app2.id,
              rule: {
                code: bxgyRule.code,
                buyVariantIds: new Set(bxgyRule.buyVariantIds),
                buyProductIds: new Set(bxgyRule.buyProductIds),
                buyCollectionIds: new Set(bxgyRule.buyCollectionIds),
                minQuantity: bxgyRule.minQuantity,
                minAmount: bxgyRule.minAmount,
                getQuantity: bxgyRule.getQuantity ?? 1
              }
            });
          }
        }
      }
    }
    if (candidates.length === 0) {
      return { removedCount: 0, removedProducts: [] };
    }
    let removedCount = 0;
    const removedProducts = [];
    for (const candidate of candidates) {
      let totalMatchingQty = 0;
      let totalMatchingAmt = 0;
      const getQty = candidate.rule.getQuantity || 1;
      for (const activeItem of activeItems) {
        if (lineItemMatchesBuyX(activeItem, candidate.rule)) {
          const itemQty2 = activeItem.editableQuantity ?? activeItem.quantity;
          const itemPrice = parseFloat(((_g = (_f = activeItem.originalUnitPriceSet) == null ? void 0 : _f.shopMoney) == null ? void 0 : _g.amount) ?? "0");
          if (activeItem.id === candidate.lineItemId) {
            if (itemQty2 > getQty) {
              totalMatchingQty += itemQty2 - getQty;
              totalMatchingAmt += itemPrice * (itemQty2 - getQty);
            }
          } else {
            totalMatchingQty += itemQty2;
            totalMatchingAmt += itemPrice * itemQty2;
          }
        }
      }
      const hasRequiredQty = totalMatchingQty >= candidate.rule.minQuantity;
      const hasRequiredAmt = candidate.rule.minAmount <= 0 || totalMatchingAmt >= candidate.rule.minAmount;
      if (!hasRequiredQty || !hasRequiredAmt) {
        console.log(
          `[bxgy] Removing BXGY discount "${candidate.rule.code}" from "${candidate.lineItemTitle}" (ID: ${candidate.lineItemId}) because qualifying Product X was removed or replaced (found matching qty: ${totalMatchingQty}, required: ${candidate.rule.minQuantity}).`
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
              discountApplicationId: candidate.discountApplicationId
            }
          }
        );
        const removeJson = await removeRes.json();
        const errors = ((_i = (_h = removeJson.data) == null ? void 0 : _h.orderEditRemoveDiscount) == null ? void 0 : _i.userErrors) ?? [];
        if (errors.length) {
          console.warn(`[bxgy] Failed to remove discount application ${candidate.discountApplicationId}:`, errors);
        } else {
          removedCount++;
          removedProducts.push(candidate.lineItemTitle);
        }
      }
    }
    return { removedCount, removedProducts };
  } catch (err) {
    console.warn("[bxgy] Error in checkAndRemoveInvalidBxgyDiscounts:", err);
    return { removedCount: 0, removedProducts: [] };
  }
}
async function loader$p({
  request
}) {
  const {
    cors
  } = await authenticate.public.customerAccount(request);
  return cors(new Response(JSON.stringify({
    success: true
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  }));
}
async function action$l({
  request
}) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m;
  const {
    sessionToken,
    cors
  } = await authenticate.public.customerAccount(request);
  if (request.method === "OPTIONS") {
    return cors(new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }));
  }
  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  const {
    admin
  } = await unauthenticated.admin(storeDomain);
  const body = await request.json();
  const {
    orderId,
    lineItemId,
    quantity,
    source
  } = body || {};
  if (!orderId || !lineItemId || quantity === void 0) {
    return cors(Response.json({
      userErrors: [{
        message: "Missing orderId, lineItemId, or quantity."
      }]
    }, {
      status: 400
    }));
  }
  const guard = await validateOrderEditable({
    admin,
    shop: storeDomain,
    orderId,
    customerAccountId: sessionToken.sub,
    requiredServiceId: "edit-quantity"
  });
  if (!guard.allowed) {
    return cors(Response.json({
      userErrors: [{
        message: guard.message
      }]
    }, {
      status: guard.status
    }));
  }
  const calculatedLineItemId = lineItemId.replace("LineItem", "CalculatedLineItem");
  try {
    let actualQuantity = Number(quantity);
    let quantityMessage = null;
    if (actualQuantity > 0) {
      try {
        const lineItemRes = await admin.graphql(`#graphql
          query GetLineItemVariant($id: ID!) {
            order(id: $id) {
              lineItems(first: 100) {
                nodes {
                  id
                  currentQuantity
                  quantity
                  variant {
                    id
                    inventoryQuantity
                  }
                }
              }
            }
          }`, {
          variables: {
            id: orderId
          }
        });
        const lineItemJson = await lineItemRes.json();
        const rawLineItemId = lineItemId.replace("CalculatedLineItem", "LineItem");
        const node = (_d = (_c = (_b = (_a2 = lineItemJson.data) == null ? void 0 : _a2.order) == null ? void 0 : _b.lineItems) == null ? void 0 : _c.nodes) == null ? void 0 : _d.find((n) => n.id === rawLineItemId || n.id === lineItemId);
        const currentQty = (node == null ? void 0 : node.currentQuantity) ?? (node == null ? void 0 : node.quantity) ?? 0;
        const invQty = (_e = node == null ? void 0 : node.variant) == null ? void 0 : _e.inventoryQuantity;
        if (typeof invQty === "number") {
          const maxAllowed = currentQty + invQty;
          if (actualQuantity > maxAllowed) {
            if (invQty <= 0) {
              return cors(Response.json({
                userErrors: [{
                  message: `This product is not available in the required quantity of ${actualQuantity}. No additional stock is available in store (you already have all ${currentQty} units in your order).`
                }]
              }, {
                status: 422
              }));
            }
            return cors(Response.json({
              userErrors: [{
                message: `This product is not available in the required quantity of ${actualQuantity}. Only ${invQty} additional units are available in stock. The quantity has been adjusted to ${maxAllowed}. Click 'Save quantity' again to confirm.`
              }]
            }, {
              status: 422
            }));
          }
        }
      } catch (e) {
        console.warn("Server inventory check skipped:", e);
      }
    }
    const beginResponse = await admin.graphql(`#graphql
      mutation OrderEditBegin($id: ID!) {
        orderEditBegin(id: $id) {
          calculatedOrder { id }
          userErrors { field message }
        }
      }`, {
      variables: {
        id: orderId
      }
    });
    const beginJson = await beginResponse.json();
    const beginErrors = ((_g = (_f = beginJson.data) == null ? void 0 : _f.orderEditBegin) == null ? void 0 : _g.userErrors) ?? [];
    if (beginErrors.length) {
      return cors(Response.json({
        userErrors: beginErrors
      }, {
        status: 422
      }));
    }
    const calculatedOrderId = beginJson.data.orderEditBegin.calculatedOrder.id;
    const updateResponse = await admin.graphql(`#graphql
      mutation OrderEditSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!, $restock: Boolean) {
        orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity, restock: $restock) {
          calculatedOrder { id }
          userErrors { field message }
        }
      }`, {
      variables: {
        id: calculatedOrderId,
        lineItemId: calculatedLineItemId,
        quantity: actualQuantity,
        restock: true
      }
    });
    const updateJson = await updateResponse.json();
    const updateErrors = ((_i = (_h = updateJson.data) == null ? void 0 : _h.orderEditSetQuantity) == null ? void 0 : _i.userErrors) ?? [];
    if (updateErrors.length) {
      return cors(Response.json({
        userErrors: updateErrors
      }, {
        status: 422
      }));
    }
    try {
      await checkAndRemoveInvalidBxgyDiscounts(admin, calculatedOrderId);
    } catch (bxgyErr) {
      console.warn("[update-quantity] BXGY discount check warning:", bxgyErr);
    }
    const commitResponse = await admin.graphql(`#graphql
      mutation OrderEditCommit($id: ID!) {
        orderEditCommit(id: $id, notifyCustomer: true, staffNote: "Quantity updated via customer account") {
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
      }`, {
      variables: {
        id: calculatedOrderId
      }
    });
    const commitJson = await commitResponse.json();
    const commitErrors = ((_k = (_j = commitJson.data) == null ? void 0 : _j.orderEditCommit) == null ? void 0 : _k.userErrors) ?? [];
    if (commitErrors.length) {
      return cors(Response.json({
        userErrors: commitErrors
      }, {
        status: 422
      }));
    }
    const order = commitJson.data.orderEditCommit.order;
    const balanceDue = ((_l = order == null ? void 0 : order.totalOutstandingSet) == null ? void 0 : _l.presentmentMoney) ?? ((_m = order == null ? void 0 : order.totalOutstandingSet) == null ? void 0 : _m.shopMoney) ?? null;
    const owesRefund = balanceDue ? parseFloat(balanceDue.amount) < 0 : false;
    const hasBalanceDue = balanceDue ? parseFloat(balanceDue.amount) > 0 : false;
    if (hasBalanceDue) {
      await applyPaymentPendingHold(admin, orderId);
    } else {
      await addOrderTags(admin, orderId, owesRefund);
    }
    await trackOrderEdit({
      shop: storeDomain,
      orderId,
      featureId: "edit-quantity",
      source
    });
    return cors(Response.json({
      order,
      balanceDue,
      quantityMessage,
      userErrors: []
    }));
  } catch (err) {
    console.error("[order-edit] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return cors(Response.json({
      userErrors: [{
        message
      }]
    }, {
      status: 500
    }));
  }
}
const route1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$l,
  loader: loader$p
}, Symbol.toStringTag, { value: "Module" }));
async function loader$o({
  request
}) {
  const {
    cors
  } = await authenticate.public.customerAccount(request);
  return cors(new Response(JSON.stringify({
    success: true
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  }));
}
async function action$k({
  request
}) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p;
  const {
    sessionToken,
    cors
  } = await authenticate.public.customerAccount(request);
  if (request.method === "OPTIONS") {
    return cors(new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }));
  }
  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  const {
    admin
  } = await unauthenticated.admin(storeDomain);
  const body = await request.json();
  const {
    orderId,
    oldLineItemId,
    newVariantId,
    quantity,
    source
  } = body || {};
  if (!orderId || !oldLineItemId || !newVariantId || quantity === void 0) {
    return cors(Response.json({
      userErrors: [{
        message: "Missing orderId, oldLineItemId, newVariantId, or quantity."
      }]
    }, {
      status: 400
    }));
  }
  const guard = await validateOrderEditable({
    admin,
    shop: storeDomain,
    orderId,
    customerAccountId: sessionToken.sub,
    requiredServiceId: "swap-variant"
  });
  if (!guard.allowed) {
    return cors(Response.json({
      userErrors: [{
        message: guard.message
      }]
    }, {
      status: guard.status
    }));
  }
  const calculatedLineItemId = oldLineItemId.replace("LineItem", "CalculatedLineItem");
  try {
    let actualQuantity = Number(quantity);
    let quantityMessage = null;
    try {
      const variantRes = await admin.graphql(`#graphql
        query GetVariantStock($id: ID!) {
          productVariant(id: $id) {
            id
            inventoryQuantity
          }
        }`, {
        variables: {
          id: newVariantId
        }
      });
      const variantJson = await variantRes.json();
      const invQty = (_b = (_a2 = variantJson.data) == null ? void 0 : _a2.productVariant) == null ? void 0 : _b.inventoryQuantity;
      if (typeof invQty === "number") {
        if (invQty <= 0) {
          return cors(Response.json({
            userErrors: [{
              message: "Selected replacement variant is out of stock."
            }]
          }, {
            status: 422
          }));
        }
        if (actualQuantity > invQty) {
          quantityMessage = `Only ${invQty} quantity available in stock. Swapped with ${invQty} quantity instead of ${actualQuantity}.`;
          actualQuantity = invQty;
        }
      }
    } catch (e) {
      console.warn("Server inventory check skipped:", e);
    }
    const beginResponse = await admin.graphql(`#graphql
      mutation OrderEditBegin($id: ID!) {
        orderEditBegin(id: $id) {
          calculatedOrder { id }
          userErrors { field message }
        }
      }`, {
      variables: {
        id: orderId
      }
    });
    const beginJson = await beginResponse.json();
    if ((_e = (_d = (_c = beginJson.data) == null ? void 0 : _c.orderEditBegin) == null ? void 0 : _d.userErrors) == null ? void 0 : _e.length) {
      return cors(Response.json({
        userErrors: beginJson.data.orderEditBegin.userErrors
      }, {
        status: 422
      }));
    }
    const calculatedOrderId = beginJson.data.orderEditBegin.calculatedOrder.id;
    const removeResponse = await admin.graphql(`#graphql
      mutation OrderEditSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!, $restock: Boolean) {
        orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity, restock: $restock) {
          calculatedOrder { id }
          userErrors { field message }
        }
      }`, {
      variables: {
        id: calculatedOrderId,
        lineItemId: calculatedLineItemId,
        quantity: 0,
        restock: true
      }
    });
    const removeJson = await removeResponse.json();
    if ((_h = (_g = (_f = removeJson.data) == null ? void 0 : _f.orderEditSetQuantity) == null ? void 0 : _g.userErrors) == null ? void 0 : _h.length) {
      return cors(Response.json({
        userErrors: removeJson.data.orderEditSetQuantity.userErrors
      }, {
        status: 422
      }));
    }
    const addResponse = await admin.graphql(`#graphql
      mutation OrderEditAddVariant($id: ID!, $variantId: ID!, $quantity: Int!) {
        orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity) {
          calculatedOrder { id }
          userErrors { field message }
        }
      }`, {
      variables: {
        id: calculatedOrderId,
        variantId: newVariantId,
        quantity: actualQuantity
      }
    });
    const addJson = await addResponse.json();
    if ((_k = (_j = (_i = addJson.data) == null ? void 0 : _i.orderEditAddVariant) == null ? void 0 : _j.userErrors) == null ? void 0 : _k.length) {
      return cors(Response.json({
        userErrors: addJson.data.orderEditAddVariant.userErrors
      }, {
        status: 422
      }));
    }
    try {
      await checkAndRemoveInvalidBxgyDiscounts(admin, calculatedOrderId);
    } catch (bxgyErr) {
      console.warn("[change-variant] BXGY discount check warning:", bxgyErr);
    }
    const commitResponse = await admin.graphql(`#graphql
      mutation OrderEditCommit($id: ID!) {
        orderEditCommit(id: $id, notifyCustomer: true, staffNote: "Variant changed via customer account") {
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
      }`, {
      variables: {
        id: calculatedOrderId
      }
    });
    const commitJson = await commitResponse.json();
    if ((_n = (_m = (_l = commitJson.data) == null ? void 0 : _l.orderEditCommit) == null ? void 0 : _m.userErrors) == null ? void 0 : _n.length) {
      return cors(Response.json({
        userErrors: commitJson.data.orderEditCommit.userErrors
      }, {
        status: 422
      }));
    }
    const order = commitJson.data.orderEditCommit.order;
    const balanceDue = ((_o = order == null ? void 0 : order.totalOutstandingSet) == null ? void 0 : _o.presentmentMoney) ?? ((_p = order == null ? void 0 : order.totalOutstandingSet) == null ? void 0 : _p.shopMoney) ?? null;
    const owesRefund = balanceDue ? parseFloat(balanceDue.amount) < 0 : false;
    const hasBalanceDue = balanceDue ? parseFloat(balanceDue.amount) > 0 : false;
    if (hasBalanceDue) {
      await applyPaymentPendingHold(admin, orderId);
    } else {
      await addOrderTags(admin, orderId, owesRefund);
    }
    await trackOrderEdit({
      shop: storeDomain,
      orderId,
      featureId: "swap-variant",
      source
    });
    return cors(Response.json({
      order,
      balanceDue,
      quantityMessage,
      userErrors: []
    }));
  } catch (err) {
    console.error("[order-edit] Unexpected error:", err);
    return cors(Response.json({
      userErrors: [{
        message: err instanceof Error ? err.message : "Internal error"
      }]
    }, {
      status: 500
    }));
  }
}
const route2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$k,
  loader: loader$o
}, Symbol.toStringTag, { value: "Module" }));
async function loader$n({
  request
}) {
  var _a2, _b;
  const {
    sessionToken,
    cors
  } = await authenticate.public.customerAccount(request);
  if (request.method === "OPTIONS") {
    return cors(new Response(null, {
      status: 200
    }));
  }
  const url = new URL(request.url);
  const variantId = url.searchParams.get("variantId");
  if (!variantId) {
    return cors(Response.json({
      error: "Missing variantId"
    }, {
      status: 400
    }));
  }
  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  if (!await isServiceEnabled(storeDomain, ["add-product", "product-upsell", "edit-quantity", "swap-variant", "bulk-update"])) {
    return cors(Response.json({
      error: "This feature is not enabled by the merchant."
    }, {
      status: 403
    }));
  }
  const {
    admin
  } = await unauthenticated.admin(storeDomain);
  try {
    const response = await admin.graphql(`#graphql
      query GetVariantStock($id: ID!) {
        productVariant(id: $id) {
          id
          title
          availableForSale
          inventoryQuantity
        }
      }`, {
      variables: {
        id: variantId
      }
    });
    const json = await response.json();
    if ((_a2 = json.errors) == null ? void 0 : _a2.length) {
      return cors(Response.json({
        error: json.errors[0].message
      }, {
        status: 400
      }));
    }
    const variant = (_b = json.data) == null ? void 0 : _b.productVariant;
    if (!variant) {
      return cors(Response.json({
        error: "Variant not found"
      }, {
        status: 404
      }));
    }
    return cors(Response.json({
      id: variant.id,
      availableForSale: Boolean(variant.availableForSale),
      inventoryQuantity: typeof variant.inventoryQuantity === "number" ? variant.inventoryQuantity : null
    }));
  } catch (err) {
    console.error("[variant-stock] Error fetching inventory:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return cors(Response.json({
      error: message
    }, {
      status: 500
    }));
  }
}
async function action$j({
  request
}) {
  return loader$n({
    request
  });
}
const route3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$j,
  loader: loader$n
}, Symbol.toStringTag, { value: "Module" }));
async function loader$m({
  request
}) {
  var _a2, _b;
  const {
    sessionToken,
    cors
  } = await authenticate.public.customerAccount(request);
  const url = new URL(request.url);
  const variantId = url.searchParams.get("variantId");
  if (!variantId) {
    return cors(Response.json({
      success: true,
      message: "Customer Account GET working!"
    }));
  }
  const storeDomain = (_a2 = sessionToken == null ? void 0 : sessionToken.dest) == null ? void 0 : _a2.replace(/^https?:\/\//, "");
  if (!storeDomain) {
    return cors(Response.json({
      error: "Missing store domain"
    }, {
      status: 400
    }));
  }
  const {
    admin
  } = await unauthenticated.admin(storeDomain);
  try {
    const variantRes = await admin.graphql(`#graphql
      query GetVariantStock($id: ID!) {
        productVariant(id: $id) {
          id
          title
          availableForSale
          inventoryQuantity
        }
      }`, {
      variables: {
        id: variantId
      }
    });
    const variantJson = await variantRes.json();
    const variant = (_b = variantJson.data) == null ? void 0 : _b.productVariant;
    const invQty = variant == null ? void 0 : variant.inventoryQuantity;
    return cors(Response.json({
      id: (variant == null ? void 0 : variant.id) || variantId,
      availableForSale: Boolean(variant == null ? void 0 : variant.availableForSale),
      inventoryQuantity: typeof invQty === "number" ? invQty : null
    }));
  } catch (err) {
    console.error("[add-product loader] Error fetching inventory:", err);
    return cors(Response.json({
      error: "Failed to fetch stock"
    }, {
      status: 500
    }));
  }
}
async function action$i({
  request
}) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j;
  const {
    sessionToken,
    cors
  } = await authenticate.public.customerAccount(request);
  if (request.method === "OPTIONS") {
    return cors(new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }));
  }
  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  const {
    admin
  } = await unauthenticated.admin(storeDomain);
  const body = await request.json();
  const {
    orderId,
    variantId,
    quantity,
    confirmAvailableQuantity,
    source
  } = body || {};
  if (!orderId || !variantId || !quantity) {
    return cors(Response.json({
      userErrors: [{
        message: "Missing orderId, variantId, or quantity."
      }]
    }, {
      status: 400
    }));
  }
  const guard = await validateOrderEditable({
    admin,
    shop: storeDomain,
    orderId,
    customerAccountId: sessionToken.sub,
    requiredServiceId: ["add-product", "product-upsell"]
  });
  if (!guard.allowed) {
    return cors(Response.json({
      userErrors: [{
        message: guard.message
      }]
    }, {
      status: guard.status
    }));
  }
  try {
    let actualQuantity = Number(quantity);
    let quantityMessage = null;
    try {
      const variantRes = await admin.graphql(`#graphql
        query GetVariantStock($id: ID!) {
          productVariant(id: $id) {
            id
            inventoryQuantity
          }
        }`, {
        variables: {
          id: variantId
        }
      });
      const variantJson = await variantRes.json();
      const invQty = (_b = (_a2 = variantJson.data) == null ? void 0 : _a2.productVariant) == null ? void 0 : _b.inventoryQuantity;
      if (typeof invQty === "number") {
        if (invQty <= 0) {
          return cors(Response.json({
            userErrors: [{
              message: "Product is currently out of stock."
            }]
          }, {
            status: 422
          }));
        }
        if (actualQuantity > invQty) {
          if (!confirmAvailableQuantity) {
            return cors(Response.json({
              userErrors: [{
                message: `This product is not available in the required quantity of ${actualQuantity}. Only ${invQty} units are available in stock. Please confirm to add ${invQty} units to your order.`
              }],
              availableQuantity: invQty
            }, {
              status: 422
            }));
          }
          quantityMessage = `Only ${invQty} quantity available in stock. Added ${invQty} quantity to your order instead of ${actualQuantity}.`;
          actualQuantity = invQty;
        }
      }
    } catch (e) {
      console.warn("Server inventory check skipped:", e);
    }
    const beginResponse = await admin.graphql(`#graphql
      mutation OrderEditBegin($id: ID!) {
        orderEditBegin(id: $id) {
          calculatedOrder { id }
          userErrors { field message }
        }
      }`, {
      variables: {
        id: orderId
      }
    });
    const beginJson = await beginResponse.json();
    const beginErrors = ((_d = (_c = beginJson.data) == null ? void 0 : _c.orderEditBegin) == null ? void 0 : _d.userErrors) ?? [];
    if (beginErrors.length) {
      return cors(Response.json({
        userErrors: beginErrors
      }, {
        status: 422
      }));
    }
    const calculatedOrderId = beginJson.data.orderEditBegin.calculatedOrder.id;
    const addResponse = await admin.graphql(`#graphql
      mutation OrderEditAddVariant($id: ID!, $variantId: ID!, $quantity: Int!) {
        orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity) {
          calculatedOrder {
            addedLineItems(first: 1) { nodes { id quantity } }
          }
          userErrors { field message }
        }
      }`, {
      variables: {
        id: calculatedOrderId,
        variantId,
        quantity: actualQuantity
      }
    });
    const addJson = await addResponse.json();
    const addErrors = ((_f = (_e = addJson.data) == null ? void 0 : _e.orderEditAddVariant) == null ? void 0 : _f.userErrors) ?? [];
    if (addErrors.length) {
      return cors(Response.json({
        userErrors: addErrors
      }, {
        status: 422
      }));
    }
    const commitResponse = await admin.graphql(`#graphql
      mutation OrderEditCommit($id: ID!) {
        orderEditCommit(id: $id, notifyCustomer: true, staffNote: "Product added via customer account") {
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
      }`, {
      variables: {
        id: calculatedOrderId
      }
    });
    const commitJson = await commitResponse.json();
    const commitErrors = ((_h = (_g = commitJson.data) == null ? void 0 : _g.orderEditCommit) == null ? void 0 : _h.userErrors) ?? [];
    if (commitErrors.length) {
      return cors(Response.json({
        userErrors: commitErrors
      }, {
        status: 422
      }));
    }
    const order = commitJson.data.orderEditCommit.order;
    const balanceDue = ((_i = order == null ? void 0 : order.totalOutstandingSet) == null ? void 0 : _i.presentmentMoney) ?? ((_j = order == null ? void 0 : order.totalOutstandingSet) == null ? void 0 : _j.shopMoney) ?? null;
    const owesRefund = balanceDue ? parseFloat(balanceDue.amount) < 0 : false;
    const hasBalanceDue = balanceDue ? parseFloat(balanceDue.amount) > 0 : false;
    if (hasBalanceDue) {
      await applyPaymentPendingHold(admin, orderId);
    } else {
      await addOrderTags(admin, orderId, owesRefund);
    }
    await trackOrderEdit({
      shop: storeDomain,
      orderId,
      featureId: "add-product",
      source
    });
    return cors(Response.json({
      order,
      balanceDue,
      quantityMessage,
      userErrors: []
    }));
  } catch (err) {
    console.error("[order-edit] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return cors(Response.json({
      userErrors: [{
        message
      }]
    }, {
      status: 500
    }));
  }
}
const route4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$i,
  loader: loader$m
}, Symbol.toStringTag, { value: "Module" }));
async function loader$l({
  request
}) {
  const {
    cors
  } = await authenticate.public.customerAccount(request);
  return cors(Response.json({
    success: true,
    message: "Bulk update endpoint ready."
  }));
}
function escapeCsv(val) {
  if (val === null || val === void 0) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}
function generateErrorCsv(errors) {
  const lines = ["Product name,sku,issue"];
  for (const err of errors) {
    lines.push(`${escapeCsv(err.productName)},${escapeCsv(err.sku)},${escapeCsv(err.issue)}`);
  }
  return lines.join("\n");
}
function parseCsvContent(rawCsv) {
  if (!rawCsv || typeof rawCsv !== "string") return [];
  const cleanCsv = rawCsv.replace(/^\uFEFF/, "").trim();
  const lines = cleanCsv.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
  if (lines.length < 2) return [];
  const parseLine = (line) => {
    const result = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(cur.trim());
        cur = "";
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };
  const headers2 = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/[^a-z0-9]/g, ""));
  let replaceSkuIdx = headers2.findIndex((h) => h.includes("replace"));
  let skuIdx = headers2.findIndex((h) => h === "sku" || h.includes("sku") && !h.includes("replace"));
  let productNameIdx = headers2.findIndex((h) => (h.includes("product") || h.includes("title") || h.includes("name")) && !h.includes("sku"));
  let quantityIdx = headers2.findIndex((h) => h.includes("quantity") || h.includes("qty") || h === "count");
  if (skuIdx === -1 && headers2.length >= 2) skuIdx = 1;
  if (productNameIdx === -1) productNameIdx = 0;
  if (replaceSkuIdx === -1 && headers2.length >= 3) replaceSkuIdx = 2;
  if (quantityIdx === -1 && headers2.length >= 4) quantityIdx = 3;
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = parseLine(lines[i]);
    if (parts.length === 0 || parts.every((p) => p === "")) continue;
    const productName = productNameIdx !== -1 && parts[productNameIdx] ? parts[productNameIdx] : "";
    const sku = skuIdx !== -1 && parts[skuIdx] ? parts[skuIdx] : "";
    const replaceWithSku = replaceSkuIdx !== -1 && parts[replaceSkuIdx] ? parts[replaceSkuIdx] : "";
    const rawQty = quantityIdx !== -1 && parts[quantityIdx] ? parts[quantityIdx] : "1";
    const quantity = parseInt(rawQty, 10);
    rows.push({
      productName,
      sku,
      replaceWithSku,
      quantity: isNaN(quantity) ? 1 : quantity
    });
  }
  return rows;
}
async function action$h({
  request
}) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w;
  const {
    sessionToken,
    cors
  } = await authenticate.public.customerAccount(request);
  if (request.method === "OPTIONS") {
    return cors(new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }));
  }
  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  const customerAccountId = sessionToken.sub;
  const {
    admin
  } = await unauthenticated.admin(storeDomain);
  let body = {};
  try {
    body = await request.json();
  } catch (e) {
    return cors(Response.json({
      success: false,
      hasErrors: true,
      errors: [{
        productName: "-",
        sku: "-",
        issue: "Invalid JSON payload."
      }],
      errorCsv: generateErrorCsv([{
        productName: "-",
        sku: "-",
        issue: "Invalid JSON payload."
      }])
    }, {
      status: 400
    }));
  }
  const {
    orderId,
    rows: rawRows,
    rawCsv,
    source
  } = body || {};
  if (!orderId) {
    return cors(Response.json({
      success: false,
      hasErrors: true,
      errors: [{
        productName: "-",
        sku: "-",
        issue: "Missing orderId."
      }],
      errorCsv: generateErrorCsv([{
        productName: "-",
        sku: "-",
        issue: "Missing orderId."
      }])
    }, {
      status: 400
    }));
  }
  const guard = await validateOrderEditable({
    admin,
    shop: storeDomain,
    orderId,
    customerAccountId,
    requiredServiceId: "bulk-update"
  });
  if (!guard.allowed) {
    const issue = guard.message;
    return cors(Response.json({
      success: false,
      hasErrors: true,
      errors: [{
        productName: "-",
        sku: "-",
        issue
      }],
      errorCsv: generateErrorCsv([{
        productName: "-",
        sku: "-",
        issue
      }])
    }, {
      status: guard.status
    }));
  }
  let order = null;
  try {
    const orderRes = await admin.graphql(`#graphql
      query GetOrderForBulkUpdate($id: ID!) {
        order(id: $id) {
          id
          name
          statusPageUrl
          cancelledAt
          customer { id }
          lineItems(first: 250) {
            nodes {
              id
              name
              title
              currentQuantity
              quantity
              sku
              variant {
                id
                sku
                title
                inventoryQuantity
                availableForSale
                product { id title }
              }
            }
          }
        }
      }`, {
      variables: {
        id: orderId
      }
    });
    const orderJson = await orderRes.json();
    order = (_a2 = orderJson.data) == null ? void 0 : _a2.order;
  } catch (e) {
    console.error("[bulk-update] Failed to load order:", e);
  }
  if (!order) {
    const issue = "Order not found or inaccessible.";
    return cors(Response.json({
      success: false,
      hasErrors: true,
      errors: [{
        productName: "-",
        sku: "-",
        issue
      }],
      errorCsv: generateErrorCsv([{
        productName: "-",
        sku: "-",
        issue
      }])
    }, {
      status: 404
    }));
  }
  if (order.cancelledAt) {
    const issue = "Order has been cancelled. No further modifications can be made.";
    return cors(Response.json({
      success: false,
      hasErrors: true,
      errors: [{
        productName: "-",
        sku: "-",
        issue
      }],
      errorCsv: generateErrorCsv([{
        productName: "-",
        sku: "-",
        issue
      }])
    }, {
      status: 422
    }));
  }
  const numericId = (gidOrId) => {
    var _a3;
    return (_a3 = gidOrId == null ? void 0 : gidOrId.match(/\d+$/)) == null ? void 0 : _a3[0];
  };
  if (!((_b = order.customer) == null ? void 0 : _b.id) || numericId(order.customer.id) !== numericId(customerAccountId)) {
    const issue = "Not authorized to update this order.";
    return cors(Response.json({
      success: false,
      hasErrors: true,
      errors: [{
        productName: "-",
        sku: "-",
        issue
      }],
      errorCsv: generateErrorCsv([{
        productName: "-",
        sku: "-",
        issue
      }])
    }, {
      status: 403
    }));
  }
  let parsedRows = [];
  if (Array.isArray(rawRows) && rawRows.length > 0) {
    parsedRows = rawRows.map((r) => ({
      productName: String(r.productName || r["Product name"] || "").trim(),
      sku: String(r.sku || r.SKU || "").trim(),
      replaceWithSku: String(r.replaceWithSku || r["replace with sku"] || r.replace_with_sku || "").trim(),
      quantity: isNaN(Number(r.quantity)) ? 1 : Number(r.quantity),
      actionType: r.actionType,
      lineItemId: r.lineItemId,
      variantId: r.variantId,
      newVariantId: r.newVariantId
    }));
  } else if (typeof rawCsv === "string" && rawCsv.trim().length > 0) {
    parsedRows = parseCsvContent(rawCsv);
  }
  if (parsedRows.length === 0) {
    const issue = "No update rows found in the CSV. Please ensure the CSV has data.";
    return cors(Response.json({
      success: false,
      hasErrors: true,
      errors: [{
        productName: "-",
        sku: "-",
        issue
      }],
      errorCsv: generateErrorCsv([{
        productName: "-",
        sku: "-",
        issue
      }])
    }, {
      status: 400
    }));
  }
  const activeItemsBySku = /* @__PURE__ */ new Map();
  const activeItemsByLineId = /* @__PURE__ */ new Map();
  const activeItemsByVariantId = /* @__PURE__ */ new Map();
  for (const item of ((_c = order.lineItems) == null ? void 0 : _c.nodes) || []) {
    if (item.currentQuantity > 0) {
      if (item.id) activeItemsByLineId.set(item.id, item);
      if ((_d = item.variant) == null ? void 0 : _d.id) activeItemsByVariantId.set(item.variant.id, item);
      const itemSku = (item.sku || ((_e = item.variant) == null ? void 0 : _e.sku) || "").trim().toLowerCase();
      if (itemSku) {
        activeItemsBySku.set(itemSku, item);
      }
    }
  }
  const variantCache = /* @__PURE__ */ new Map();
  async function findVariantBySku(skuToFind) {
    var _a3, _b2;
    const key = skuToFind.trim().toLowerCase();
    if (variantCache.has(key)) return variantCache.get(key);
    try {
      const res = await admin.graphql(`#graphql
        query FindVariantBySku($query: String!) {
          productVariants(first: 10, query: $query) {
            nodes {
              id
              title
              sku
              inventoryQuantity
              availableForSale
              product { id title }
            }
          }
        }`, {
        variables: {
          query: `sku:"${skuToFind.trim()}"`
        }
      });
      const json = await res.json();
      const nodes = ((_b2 = (_a3 = json.data) == null ? void 0 : _a3.productVariants) == null ? void 0 : _b2.nodes) || [];
      const match = nodes.find((v) => (v.sku || "").trim().toLowerCase() === key) || null;
      variantCache.set(key, match);
      return match;
    } catch (e) {
      console.warn("[bulk-update] Error querying variant by SKU:", skuToFind, e);
      variantCache.set(key, null);
      return null;
    }
  }
  const variantByIdCache = /* @__PURE__ */ new Map();
  async function findVariantById(variantId) {
    var _a3;
    if (!variantId) return null;
    if (variantByIdCache.has(variantId)) return variantByIdCache.get(variantId);
    try {
      const res = await admin.graphql(`#graphql
        query FindVariantById($id: ID!) {
          productVariant(id: $id) {
            id
            title
            sku
            inventoryQuantity
            availableForSale
            product { id title }
          }
        }`, {
        variables: {
          id: variantId
        }
      });
      const json = await res.json();
      const variant = ((_a3 = json.data) == null ? void 0 : _a3.productVariant) || null;
      variantByIdCache.set(variantId, variant);
      return variant;
    } catch (e) {
      console.warn("[bulk-update] Error querying variant by ID:", variantId, e);
      variantByIdCache.set(variantId, null);
      return null;
    }
  }
  const rowErrors = [];
  const plannedActions = [];
  for (let idx = 0; idx < parsedRows.length; idx++) {
    const row = parsedRows[idx];
    const productName = row.productName || `Row #${idx + 1}`;
    let sku = row.sku ? String(row.sku).trim() : "";
    let replaceWithSku = row.replaceWithSku ? String(row.replaceWithSku).trim() : "";
    const quantity = Number(row.quantity);
    const lineItemId = row.lineItemId;
    const variantId = row.variantId;
    const newVariantId = row.newVariantId;
    const actionType = row.actionType;
    if (!sku && !variantId && !lineItemId) {
      rowErrors.push({
        productName,
        sku: "(blank)",
        issue: "SKU is required for each row."
      });
      continue;
    }
    if (isNaN(quantity) || quantity < 0) {
      rowErrors.push({
        productName,
        sku: sku || "-",
        issue: "Quantity must be a valid non-negative number."
      });
      continue;
    }
    let existingItem = null;
    if (lineItemId) {
      existingItem = activeItemsByLineId.get(lineItemId);
    }
    if (!existingItem && variantId && actionType !== "ADD") {
      existingItem = activeItemsByVariantId.get(variantId);
    }
    if (!existingItem && sku) {
      existingItem = activeItemsBySku.get(sku.toLowerCase());
    }
    const isExplicitAdd = actionType === "ADD";
    const isExplicitReplace = actionType === "REPLACE";
    const isExplicitUpdate = actionType === "UPDATE_QTY";
    if (isExplicitAdd || !existingItem && !isExplicitReplace && !isExplicitUpdate) {
      if (replaceWithSku && !isExplicitAdd) {
        rowErrors.push({
          productName,
          sku: sku || "-",
          issue: `Cannot replace product: SKU '${sku}' does not exist in this order.`
        });
        continue;
      }
      if (quantity <= 0) {
        rowErrors.push({
          productName,
          sku: sku || "-",
          issue: `Cannot add product with quantity 0.`
        });
        continue;
      }
      let variant = null;
      if (variantId) {
        variant = await findVariantById(variantId);
      }
      if (!variant && sku) {
        variant = await findVariantBySku(sku);
      }
      if (!variant) {
        rowErrors.push({
          productName,
          sku: sku || "-",
          issue: sku ? `SKU '${sku}' not found in store catalog.` : "Product variant not found."
        });
        continue;
      }
      if (!sku && variant.sku) {
        sku = variant.sku;
      }
      if (typeof variant.inventoryQuantity === "number" && variant.inventoryQuantity < quantity) {
        rowErrors.push({
          productName,
          sku: sku || variant.sku || "-",
          issue: `Insufficient stock for '${productName || variant.title}'. Requested: ${quantity}, Available: ${variant.inventoryQuantity}.`
        });
        continue;
      }
      plannedActions.push({
        type: "ADD",
        productName: productName || ((_f = variant.product) == null ? void 0 : _f.title) || variant.title,
        sku: sku || variant.sku || "-",
        quantity,
        variantId: variant.id
      });
    } else if (isExplicitReplace || replaceWithSku) {
      if (!existingItem) {
        rowErrors.push({
          productName,
          sku: sku || "-",
          issue: `Cannot replace item: Product does not exist in this order.`
        });
        continue;
      }
      if (quantity <= 0) {
        rowErrors.push({
          productName,
          sku: sku || existingItem.sku || "-",
          issue: `Replacement quantity must be greater than 0.`
        });
        continue;
      }
      let repVariant = null;
      if (newVariantId) {
        repVariant = await findVariantById(newVariantId);
      }
      if (!repVariant && replaceWithSku) {
        repVariant = await findVariantBySku(replaceWithSku);
      }
      if (!repVariant) {
        rowErrors.push({
          productName,
          sku: sku || existingItem.sku || "-",
          issue: replaceWithSku ? `Replacement SKU '${replaceWithSku}' not found in store catalog.` : "Replacement variant not found in store catalog."
        });
        continue;
      }
      if (!replaceWithSku && repVariant.sku) {
        replaceWithSku = repVariant.sku;
      }
      if (typeof repVariant.inventoryQuantity === "number" && repVariant.inventoryQuantity < quantity) {
        rowErrors.push({
          productName,
          sku: sku || existingItem.sku || "-",
          issue: `Insufficient stock for replacement '${repVariant.title}'. Requested: ${quantity}, Available: ${repVariant.inventoryQuantity}.`
        });
        continue;
      }
      plannedActions.push({
        type: "REPLACE",
        productName: productName || existingItem.title,
        sku: sku || existingItem.sku || ((_g = existingItem.variant) == null ? void 0 : _g.sku) || "-",
        replaceWithSku: replaceWithSku || repVariant.sku || "-",
        quantity,
        lineItemId: existingItem.id,
        newVariantId: repVariant.id
      });
    } else {
      if (!existingItem) {
        rowErrors.push({
          productName,
          sku: sku || "-",
          issue: `Item not found in current order to update quantity.`
        });
        continue;
      }
      if (quantity === existingItem.currentQuantity) {
        continue;
      }
      if (quantity > existingItem.currentQuantity) {
        const needed = quantity - existingItem.currentQuantity;
        const invQty = (_h = existingItem.variant) == null ? void 0 : _h.inventoryQuantity;
        if (typeof invQty === "number" && invQty < needed) {
          rowErrors.push({
            productName,
            sku: sku || existingItem.sku || "-",
            issue: `Cannot increase quantity of SKU '${sku || existingItem.title}' to ${quantity}. Only ${invQty} additional unit(s) available in stock.`
          });
          continue;
        }
      }
      plannedActions.push({
        type: "UPDATE_QTY",
        productName: productName || existingItem.title,
        sku: sku || existingItem.sku || ((_i = existingItem.variant) == null ? void 0 : _i.sku) || "-",
        quantity,
        lineItemId: existingItem.id
      });
    }
  }
  if (rowErrors.length > 0) {
    const errorCsv = generateErrorCsv(rowErrors);
    return cors(Response.json({
      success: false,
      hasErrors: true,
      errors: rowErrors,
      errorCsv
    }, {
      status: 422
    }));
  }
  if (plannedActions.length === 0) {
    return cors(Response.json({
      success: true,
      hasErrors: false,
      message: "No line item changes were required. The order is already up to date.",
      summary: {
        totalRows: parsedRows.length,
        actionsApplied: 0
      }
    }));
  }
  try {
    const beginRes = await admin.graphql(`#graphql
      mutation OrderEditBeginBulk($id: ID!) {
        orderEditBegin(id: $id) {
          calculatedOrder { id }
          userErrors { field message }
        }
      }`, {
      variables: {
        id: orderId
      }
    });
    const beginJson = await beginRes.json();
    const beginErrors = ((_k = (_j = beginJson.data) == null ? void 0 : _j.orderEditBegin) == null ? void 0 : _k.userErrors) || [];
    if (beginErrors.length > 0) {
      const errs = beginErrors.map((e) => ({
        productName: "Order Edit",
        sku: "-",
        issue: e.message || "Failed to initiate order edit session."
      }));
      return cors(Response.json({
        success: false,
        hasErrors: true,
        errors: errs,
        errorCsv: generateErrorCsv(errs)
      }, {
        status: 422
      }));
    }
    const calculatedOrderId = beginJson.data.orderEditBegin.calculatedOrder.id;
    for (const act of plannedActions) {
      if (act.type === "ADD") {
        const addRes = await admin.graphql(`#graphql
          mutation BulkAddVariant($id: ID!, $variantId: ID!, $quantity: Int!) {
            orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity) {
              calculatedOrder { id }
              userErrors { field message }
            }
          }`, {
          variables: {
            id: calculatedOrderId,
            variantId: act.variantId,
            quantity: act.quantity
          }
        });
        const addJson = await addRes.json();
        const errs = ((_m = (_l = addJson.data) == null ? void 0 : _l.orderEditAddVariant) == null ? void 0 : _m.userErrors) || [];
        if (errs.length > 0) {
          rowErrors.push({
            productName: act.productName,
            sku: act.sku,
            issue: errs[0].message || "Failed to add product variant."
          });
        }
      } else if (act.type === "UPDATE_QTY") {
        const calcLineItemId = act.lineItemId.replace("LineItem", "CalculatedLineItem");
        const setQtyRes = await admin.graphql(`#graphql
          mutation BulkSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!, $restock: Boolean) {
            orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity, restock: $restock) {
              calculatedOrder { id }
              userErrors { field message }
            }
          }`, {
          variables: {
            id: calculatedOrderId,
            lineItemId: calcLineItemId,
            quantity: act.quantity,
            restock: true
          }
        });
        const setQtyJson = await setQtyRes.json();
        const errs = ((_o = (_n = setQtyJson.data) == null ? void 0 : _n.orderEditSetQuantity) == null ? void 0 : _o.userErrors) || [];
        if (errs.length > 0) {
          rowErrors.push({
            productName: act.productName,
            sku: act.sku,
            issue: errs[0].message || "Failed to update item quantity."
          });
        }
      } else if (act.type === "REPLACE") {
        const calcLineItemId = act.lineItemId.replace("LineItem", "CalculatedLineItem");
        const removeRes = await admin.graphql(`#graphql
          mutation BulkRemoveForReplace($id: ID!, $lineItemId: ID!, $quantity: Int!, $restock: Boolean) {
            orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity, restock: $restock) {
              calculatedOrder { id }
              userErrors { field message }
            }
          }`, {
          variables: {
            id: calculatedOrderId,
            lineItemId: calcLineItemId,
            quantity: 0,
            restock: true
          }
        });
        const removeJson = await removeRes.json();
        const remErrs = ((_q = (_p = removeJson.data) == null ? void 0 : _p.orderEditSetQuantity) == null ? void 0 : _q.userErrors) || [];
        if (remErrs.length > 0) {
          rowErrors.push({
            productName: act.productName,
            sku: act.sku,
            issue: remErrs[0].message || "Failed to remove original item for replacement."
          });
          continue;
        }
        const repAddRes = await admin.graphql(`#graphql
          mutation BulkAddReplacement($id: ID!, $variantId: ID!, $quantity: Int!) {
            orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity) {
              calculatedOrder { id }
              userErrors { field message }
            }
          }`, {
          variables: {
            id: calculatedOrderId,
            variantId: act.newVariantId,
            quantity: act.quantity
          }
        });
        const repAddJson = await repAddRes.json();
        const repErrs = ((_s = (_r = repAddJson.data) == null ? void 0 : _r.orderEditAddVariant) == null ? void 0 : _s.userErrors) || [];
        if (repErrs.length > 0) {
          rowErrors.push({
            productName: act.productName,
            sku: act.replaceWithSku || act.sku,
            issue: repErrs[0].message || "Failed to add replacement product variant."
          });
        }
      }
    }
    if (rowErrors.length > 0) {
      return cors(Response.json({
        success: false,
        hasErrors: true,
        errors: rowErrors,
        errorCsv: generateErrorCsv(rowErrors)
      }, {
        status: 422
      }));
    }
    try {
      await checkAndRemoveInvalidBxgyDiscounts(admin, calculatedOrderId);
    } catch (bxgyErr) {
      console.warn("[bulk-update] BXGY discount check warning:", bxgyErr);
    }
    const commitRes = await admin.graphql(`#graphql
      mutation BulkOrderEditCommit($id: ID!) {
        orderEditCommit(id: $id, notifyCustomer: true, staffNote: "Bulk update via CSV upload") {
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
      }`, {
      variables: {
        id: calculatedOrderId
      }
    });
    const commitJson = await commitRes.json();
    const commitErrors = ((_u = (_t = commitJson.data) == null ? void 0 : _t.orderEditCommit) == null ? void 0 : _u.userErrors) || [];
    if (commitErrors.length > 0) {
      const errs = commitErrors.map((e) => ({
        productName: "Order Commit",
        sku: "-",
        issue: e.message || "Failed to commit order edit changes."
      }));
      return cors(Response.json({
        success: false,
        hasErrors: true,
        errors: errs,
        errorCsv: generateErrorCsv(errs)
      }, {
        status: 422
      }));
    }
    const updatedOrder = commitJson.data.orderEditCommit.order;
    const balanceDue = ((_v = updatedOrder == null ? void 0 : updatedOrder.totalOutstandingSet) == null ? void 0 : _v.presentmentMoney) ?? ((_w = updatedOrder == null ? void 0 : updatedOrder.totalOutstandingSet) == null ? void 0 : _w.shopMoney) ?? null;
    const owesRefund = balanceDue ? parseFloat(balanceDue.amount) < 0 : false;
    const hasBalanceDue = balanceDue ? parseFloat(balanceDue.amount) > 0 : false;
    if (hasBalanceDue) {
      await applyPaymentPendingHold(admin, orderId);
    } else {
      await addOrderTags(admin, orderId, owesRefund, ["Bulk-Updated"]);
    }
    await trackOrderEdit({
      shop: storeDomain,
      orderId,
      featureId: "bulk-update",
      source: source || "customer_account_ui"
    });
    return cors(Response.json({
      success: true,
      hasErrors: false,
      order: updatedOrder,
      balanceDue,
      summary: {
        totalRows: parsedRows.length,
        actionsApplied: plannedActions.length,
        added: plannedActions.filter((a) => a.type === "ADD").length,
        updated: plannedActions.filter((a) => a.type === "UPDATE_QTY").length,
        replaced: plannedActions.filter((a) => a.type === "REPLACE").length
      }
    }));
  } catch (err) {
    console.error("[bulk-update] Server exception:", err);
    const issue = err instanceof Error ? err.message : "Internal server error occurred.";
    const errs = [{
      productName: "-",
      sku: "-",
      issue
    }];
    return cors(Response.json({
      success: false,
      hasErrors: true,
      errors: errs,
      errorCsv: generateErrorCsv(errs)
    }, {
      status: 500
    }));
  }
}
const route5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$h,
  loader: loader$l
}, Symbol.toStringTag, { value: "Module" }));
const action$g = async ({
  request
}) => {
  const {
    payload,
    session,
    topic,
    shop
  } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  const current = payload.current;
  if (session) {
    await prisma.session.update({
      where: {
        id: session.id
      },
      data: {
        scope: current.toString()
      }
    });
  }
  return new Response();
};
const route6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$g
}, Symbol.toStringTag, { value: "Module" }));
const SAMPLE_CSV = `Product name,sku,replace with sku,quantity
Classic Cotton T-Shirt,TSHIRT-BLK-M,,2
Denim Jacket,JKT-BLU-L,JKT-BLU-XL,1
Running Shoes,SHOE-WHT-10,,3
Baseball Cap,CAP-RED-OS,CAP-BLK-OS,1
`;
async function loader$k({
  request
}) {
  return new Response(SAMPLE_CSV, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="sample_order_bulk_update.csv"',
      "Access-Control-Allow-Origin": "*"
    }
  });
}
const route7 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$k
}, Symbol.toStringTag, { value: "Module" }));
function normalizeShopDomain(dest) {
  return (dest ?? "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase().trim();
}
async function handleLocationSuggestions(storeDomain, cors, q, countryCode) {
  if (!storeDomain) {
    return cors(Response.json({
      error: "Unauthorized"
    }, {
      status: 401
    }));
  }
  if (!await isServiceEnabled(storeDomain, "change-address")) {
    return cors(Response.json({
      error: "This feature is not enabled by the merchant."
    }, {
      status: 403
    }));
  }
  if (!q || q.length < 2) {
    return cors(Response.json({
      suggestions: []
    }));
  }
  const suggestions = await fetchLocationSuggestions(q, storeDomain, countryCode);
  return cors(Response.json({
    suggestions
  }));
}
async function loader$j({
  request
}) {
  var _a2, _b;
  const {
    sessionToken,
    cors
  } = await authenticate.public.customerAccount(request);
  const storeDomain = normalizeShopDomain(sessionToken.dest);
  const url = new URL(request.url);
  const q = ((_a2 = url.searchParams.get("q")) == null ? void 0 : _a2.trim()) || "";
  const countryCode = ((_b = url.searchParams.get("countryCode")) == null ? void 0 : _b.trim()) || "";
  return handleLocationSuggestions(storeDomain, cors, q, countryCode);
}
async function action$f({
  request
}) {
  const {
    sessionToken,
    cors
  } = await authenticate.public.customerAccount(request);
  const storeDomain = normalizeShopDomain(sessionToken.dest);
  try {
    const body = await request.json().catch(() => ({}));
    const q = (body.q || "").trim();
    const countryCode = (body.countryCode || "").trim();
    return handleLocationSuggestions(storeDomain, cors, q, countryCode);
  } catch (err) {
    return cors(Response.json({
      suggestions: []
    }));
  }
}
async function fetchLocationSuggestions(query, storeDomain, countryCode) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i;
  let googleApiKey = "";
  const cleanDomain = storeDomain ? storeDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase().trim() : "";
  if (cleanDomain) {
    try {
      const googleConfig = await prisma.googlePlacesConfig.findUnique({
        where: {
          shop: cleanDomain
        }
      });
      if ((googleConfig == null ? void 0 : googleConfig.apiKey) && googleConfig.apiKey.trim().length > 0) {
        googleApiKey = googleConfig.apiKey.trim();
      }
    } catch (e) {
      console.warn("[api.location-suggestions] DB lookup error for shop:", cleanDomain, e);
    }
  }
  if (!googleApiKey) {
    return [];
  }
  try {
    const newPlacesUrl = "https://places.googleapis.com/v1/places:autocomplete";
    const newPlacesBody = {
      input: query
    };
    if (countryCode) {
      newPlacesBody.includedRegionCodes = [countryCode.toLowerCase()];
    }
    const resNew = await fetch(newPlacesUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleApiKey
      },
      body: JSON.stringify(newPlacesBody)
    });
    if (resNew.ok) {
      const dataNew = await resNew.json();
      if (Array.isArray(dataNew.suggestions) && dataNew.suggestions.length > 0) {
        const items = [];
        for (const s of dataNew.suggestions.slice(0, 5)) {
          const pred = s.placePrediction;
          if (!pred) continue;
          const rawPlaceId = pred.placeId || (pred.place ? pred.place.replace(/^places\//, "") : "");
          const mainText = ((_b = (_a2 = pred.structuredFormat) == null ? void 0 : _a2.mainText) == null ? void 0 : _b.text) || query;
          const secondaryText = ((_d = (_c = pred.structuredFormat) == null ? void 0 : _c.secondaryText) == null ? void 0 : _d.text) || "";
          const description = ((_e = pred.text) == null ? void 0 : _e.text) || `${mainText}, ${secondaryText}`;
          let address1 = mainText;
          let city = mainText;
          let province = "";
          let zip = "";
          let countryCode2 = "";
          let country = "";
          if (rawPlaceId) {
            try {
              const detailRes = await fetch(`https://places.googleapis.com/v1/places/${rawPlaceId}`, {
                headers: {
                  "X-Goog-Api-Key": googleApiKey,
                  "X-Goog-FieldMask": "addressComponents,formattedAddress"
                }
              });
              if (detailRes.ok) {
                const detailData = await detailRes.json();
                const comps = detailData.addressComponents || [];
                let streetNum = "";
                let route32 = "";
                let neighborhood = "";
                for (const c of comps) {
                  const types = c.types || [];
                  if (types.includes("street_number")) streetNum = c.longText || c.shortText;
                  if (types.includes("route")) route32 = c.longText || c.shortText;
                  if (types.includes("sublocality") || types.includes("neighborhood") || types.includes("sublocality_level_1")) {
                    neighborhood = c.longText || c.shortText;
                  }
                  if (types.includes("locality") || types.includes("postal_town")) {
                    city = c.longText || c.shortText;
                  }
                  if (!city && (types.includes("administrative_area_level_2") || types.includes("sublocality_level_1"))) {
                    city = c.longText || c.shortText;
                  }
                  if (types.includes("administrative_area_level_1")) province = c.longText || c.shortText;
                  if (types.includes("postal_code")) zip = c.longText || c.shortText;
                  if (types.includes("country")) {
                    country = c.longText || c.shortText;
                    countryCode2 = (c.shortText || "").toUpperCase();
                  }
                }
                if (!city) city = neighborhood || mainText;
                address1 = [streetNum, route32].filter(Boolean).join(" ") || neighborhood || mainText;
              }
            } catch (e) {
            }
          }
          items.push({
            id: rawPlaceId || String(Math.random()),
            description,
            mainText,
            secondaryText,
            address1: address1 || mainText,
            city: city || mainText,
            province,
            zip,
            countryCode: countryCode2,
            country
          });
        }
        if (items.length > 0) {
          return items;
        }
      }
    }
  } catch (e) {
  }
  try {
    let gUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&types=geocode&key=${googleApiKey}`;
    if (countryCode) {
      gUrl += `&components=country:${encodeURIComponent(countryCode.toLowerCase())}`;
    }
    const res = await fetch(gUrl);
    const data = await res.json();
    if (data.status === "OK" && Array.isArray(data.predictions) && data.predictions.length > 0) {
      const googleItems = [];
      for (const pred of data.predictions.slice(0, 5)) {
        const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${pred.place_id}&fields=address_components,formatted_address&key=${googleApiKey}`;
        const detailRes = await fetch(detailUrl);
        const detailData = await detailRes.json();
        if (detailData.status === "OK" && detailData.result) {
          const comps = detailData.result.address_components || [];
          let streetNum = "";
          let route32 = "";
          let neighborhood = "";
          let city = "";
          let province = "";
          let zip = "";
          let countryCode2 = "";
          let country = "";
          for (const c of comps) {
            const types = c.types || [];
            if (types.includes("street_number")) streetNum = c.long_name;
            if (types.includes("route")) route32 = c.long_name;
            if (types.includes("sublocality") || types.includes("neighborhood") || types.includes("sublocality_level_1")) {
              neighborhood = c.long_name;
            }
            if (types.includes("locality") || types.includes("postal_town")) {
              city = c.long_name;
            }
            if (!city && (types.includes("administrative_area_level_2") || types.includes("sublocality_level_1"))) {
              city = c.long_name;
            }
            if (types.includes("administrative_area_level_1")) province = c.long_name;
            if (types.includes("postal_code")) zip = c.long_name;
            if (types.includes("country")) {
              country = c.long_name;
              countryCode2 = (c.short_name || "").toUpperCase();
            }
          }
          if (!city) {
            city = neighborhood || (((_f = pred.structured_formatting) == null ? void 0 : _f.main_text) || "").replace(/\d+/g, "").trim();
          }
          const address1 = [streetNum, route32].filter(Boolean).join(" ") || neighborhood || ((_g = pred.structured_formatting) == null ? void 0 : _g.main_text) || "";
          googleItems.push({
            id: pred.place_id,
            description: detailData.result.formatted_address || pred.description,
            mainText: ((_h = pred.structured_formatting) == null ? void 0 : _h.main_text) || query,
            secondaryText: ((_i = pred.structured_formatting) == null ? void 0 : _i.secondary_text) || "",
            address1,
            city,
            province,
            zip,
            countryCode: countryCode2,
            country
          });
        }
      }
      if (googleItems.length > 0) {
        return googleItems;
      }
    } else if (data.status === "REQUEST_DENIED") {
      console.warn(`[api.location-suggestions] Google Places API rejected key: ${data.error_message || "REQUEST_DENIED"}`);
    }
  } catch (e) {
    console.warn("[api.location-suggestions] Legacy Google Places API fetch error:", e);
  }
  return [];
}
const route8 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$f,
  loader: loader$j
}, Symbol.toStringTag, { value: "Module" }));
const GET_ORDER_DETAILS_QUERY = `#graphql
  query GetOrderLineItems($id: ID!) {
    order(id: $id) {
      id
      name
      createdAt
      cancelledAt
      cancelReason
      currencyCode
      customer { id }
      tags
      displayFinancialStatus
      displayFulfillmentStatus
      totalOutstandingSet {
        shopMoney { amount currencyCode }
        presentmentMoney { amount currencyCode }
      }
      currentSubtotalPriceSet {
        shopMoney { amount currencyCode }
      }
      currentTotalPriceSet {
        shopMoney { amount currencyCode }
      }
      lineItems(first: 100) {
        edges {
          node {
            id
            name
            title
            variantTitle
            sku
            currentQuantity
            quantity
            originalUnitPriceSet {
              shopMoney { amount currencyCode }
            }
            image {
              url
              altText
            }
            variant {
              id
              sku
              title
              product {
                id
                title
                vendor
              }
              selectedOptions {
                name
                value
              }
              media(first: 1) {
                edges {
                  node {
                    ... on MediaImage {
                      image { url altText }
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
`;
async function loader$i({
  request
}) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p;
  const {
    sessionToken,
    cors
  } = await authenticate.public.customerAccount(request);
  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  const {
    admin
  } = await unauthenticated.admin(storeDomain);
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");
  if (!orderId) {
    return cors(Response.json({
      error: "Missing orderId"
    }, {
      status: 400
    }));
  }
  try {
    const response = await admin.graphql(GET_ORDER_DETAILS_QUERY, {
      variables: {
        id: orderId
      }
    });
    const json = await response.json();
    if ((_a2 = json.errors) == null ? void 0 : _a2.length) {
      return cors(Response.json({
        error: json.errors[0].message
      }, {
        status: 400
      }));
    }
    const orderData = (_b = json.data) == null ? void 0 : _b.order;
    if (!orderData) {
      return cors(Response.json({
        error: "Order not found"
      }, {
        status: 404
      }));
    }
    const numericId = (gidOrId) => {
      var _a3;
      return (_a3 = gidOrId == null ? void 0 : gidOrId.match(/\d+$/)) == null ? void 0 : _a3[0];
    };
    if (!((_c = orderData.customer) == null ? void 0 : _c.id) || numericId(orderData.customer.id) !== numericId(sessionToken.sub)) {
      return cors(Response.json({
        error: "Unauthorized access to order."
      }, {
        status: 403
      }));
    }
    const rawEdges = ((_f = (_e = (_d = json.data) == null ? void 0 : _d.order) == null ? void 0 : _e.lineItems) == null ? void 0 : _f.edges) ?? [];
    const lineItems = rawEdges.filter((edge) => edge.node && edge.node.currentQuantity > 0).map((edge) => {
      var _a3, _b2, _c2, _d2, _e2, _f2, _g2, _h2, _i2, _j2, _k2, _l2, _m2, _n2, _o2, _p2, _q, _r;
      const node = edge.node;
      const unitPrice = Number(((_b2 = (_a3 = node.originalUnitPriceSet) == null ? void 0 : _a3.shopMoney) == null ? void 0 : _b2.amount) || 0);
      const currencyCode = ((_d2 = (_c2 = node.originalUnitPriceSet) == null ? void 0 : _c2.shopMoney) == null ? void 0 : _d2.currencyCode) || "USD";
      const totalAmount = {
        amount: (unitPrice * node.currentQuantity).toFixed(2),
        currencyCode
      };
      const image = node.image || ((_i2 = (_h2 = (_g2 = (_f2 = (_e2 = node.variant) == null ? void 0 : _e2.media) == null ? void 0 : _f2.edges) == null ? void 0 : _g2[0]) == null ? void 0 : _h2.node) == null ? void 0 : _i2.image) || null;
      const selectedOptions = ((_j2 = node.variant) == null ? void 0 : _j2.selectedOptions) || [];
      const itemSku = node.sku || ((_k2 = node.variant) == null ? void 0 : _k2.sku) || "";
      const merchandise = {
        id: ((_l2 = node.variant) == null ? void 0 : _l2.id) || "",
        title: node.title || node.name || "",
        sku: itemSku,
        image,
        selectedOptions,
        product: {
          id: ((_n2 = (_m2 = node.variant) == null ? void 0 : _m2.product) == null ? void 0 : _n2.id) || "",
          title: ((_p2 = (_o2 = node.variant) == null ? void 0 : _o2.product) == null ? void 0 : _p2.title) || node.title || node.name || "",
          vendor: ((_r = (_q = node.variant) == null ? void 0 : _q.product) == null ? void 0 : _r.vendor) || ""
        }
      };
      const cost = {
        totalAmount
      };
      return {
        id: node.id,
        name: node.name,
        title: node.title || node.name,
        variantTitle: node.variantTitle,
        sku: itemSku,
        currentQuantity: node.currentQuantity,
        quantity: node.currentQuantity,
        image,
        selectedOptions,
        price: totalAmount,
        cost,
        merchandise
      };
    });
    let orderTags = ((_h = (_g = json.data) == null ? void 0 : _g.order) == null ? void 0 : _h.tags) ?? [];
    const totalOutstanding = ((_k = (_j = (_i = json.data) == null ? void 0 : _i.order) == null ? void 0 : _j.totalOutstandingSet) == null ? void 0 : _k.presentmentMoney) ?? ((_n = (_m = (_l = json.data) == null ? void 0 : _l.order) == null ? void 0 : _m.totalOutstandingSet) == null ? void 0 : _n.shopMoney) ?? null;
    const isPaid = ((_p = (_o = json.data) == null ? void 0 : _o.order) == null ? void 0 : _p.displayFinancialStatus) === "PAID" && (!totalOutstanding || parseFloat(totalOutstanding.amount) <= 0);
    if (isPaid && orderTags.some((t) => t.toLowerCase() === "payment-pending")) {
      try {
        await releasePaymentPendingHold(admin, orderId);
        orderTags = orderTags.filter((t) => t.toLowerCase() !== "payment-pending");
      } catch (e) {
        console.warn("[get-order] Failed to auto-release hold on paid order:", e);
      }
    }
    const hasPaymentPending = !isPaid && (orderTags.some((t) => t.toLowerCase() === "payment-pending") || (totalOutstanding ? parseFloat(totalOutstanding.amount) > 0 : false));
    return cors(Response.json({
      order: {
        id: orderData.id,
        name: orderData.name,
        createdAt: orderData.createdAt,
        cancelledAt: orderData.cancelledAt ?? null,
        cancelReason: orderData.cancelReason ?? null,
        currencyCode: orderData.currencyCode,
        displayFinancialStatus: orderData.displayFinancialStatus,
        displayFulfillmentStatus: orderData.displayFulfillmentStatus,
        currentSubtotalPriceSet: orderData.currentSubtotalPriceSet ?? null,
        currentTotalPriceSet: orderData.currentTotalPriceSet ?? null,
        hasPaymentPending: Boolean(hasPaymentPending),
        totalOutstanding
      },
      lineItems
    }));
  } catch (err) {
    console.error("[get-order] Unexpected error:", err);
    return cors(Response.json({
      error: "Internal error"
    }, {
      status: 500
    }));
  }
}
async function action$e({
  request
}) {
  if (request.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Max-Age": "7200"
      }
    });
  }
  const {
    cors
  } = await authenticate.public.customerAccount(request);
  return cors(Response.json({
    error: "Method not allowed"
  }, {
    status: 405
  }));
}
const route9 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$e,
  loader: loader$i
}, Symbol.toStringTag, { value: "Module" }));
const action$d = async ({
  request
}) => {
  const {
    shop,
    session,
    topic
  } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);
  if (session) {
    await prisma.session.deleteMany({
      where: {
        shop
      }
    });
  }
  return new Response();
};
const route10 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$d
}, Symbol.toStringTag, { value: "Module" }));
const ORDER_TAGS_QUERY = `#graphql
  query GetOrderLineItemTags($id: ID!) {
    order(id: $id) {
      customer {
        id
      }
      lineItems(first: 50) {
        edges {
          node {
            currentQuantity
            product {
              tags
            }
          }
        }
      }
    }
  }
`;
async function loader$h({
  request
}) {
  var _a2, _b, _c, _d, _e;
  const {
    sessionToken,
    cors
  } = await authenticate.public.customerAccount(request);
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");
  if (!orderId) {
    return cors(Response.json({
      error: "orderId is required"
    }, {
      status: 400
    }));
  }
  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  if (!await isServiceEnabled(storeDomain, "product-upsell")) {
    return cors(Response.json({
      error: "This feature is not enabled by the merchant."
    }, {
      status: 403
    }));
  }
  const {
    admin
  } = await unauthenticated.admin(storeDomain);
  try {
    const response = await admin.graphql(ORDER_TAGS_QUERY, {
      variables: {
        id: orderId
      }
    });
    const json = await response.json();
    if ((_a2 = json.errors) == null ? void 0 : _a2.length) {
      return cors(Response.json({
        error: json.errors[0].message
      }, {
        status: 400
      }));
    }
    const order = (_b = json.data) == null ? void 0 : _b.order;
    if (!order) {
      return cors(Response.json({
        error: "Order not found"
      }, {
        status: 404
      }));
    }
    if (!isCustomerAuthorized((_c = order.customer) == null ? void 0 : _c.id, sessionToken.sub)) {
      return cors(Response.json({
        error: "Unauthorized access to order."
      }, {
        status: 403
      }));
    }
    const edges = ((_d = order.lineItems) == null ? void 0 : _d.edges) ?? [];
    const upsellTags = /* @__PURE__ */ new Set();
    for (const {
      node
    } of edges) {
      if (node.currentQuantity > 0 && ((_e = node.product) == null ? void 0 : _e.tags)) {
        for (const tag of node.product.tags) {
          upsellTags.add(`${tag}-upshell`);
        }
      }
    }
    return cors(Response.json({
      tags: Array.from(upsellTags)
    }));
  } catch (err) {
    console.error("[upsell-tags] Unexpected error:", err);
    return cors(Response.json({
      error: "Internal error"
    }, {
      status: 500
    }));
  }
}
async function action$c({
  request
}) {
  const {
    cors
  } = await authenticate.public.customerAccount(request);
  if (request.method === "OPTIONS") {
    return cors(new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }));
  }
  return cors(Response.json({
    error: "Method not allowed"
  }, {
    status: 405
  }));
}
const route11 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$c,
  loader: loader$h
}, Symbol.toStringTag, { value: "Module" }));
async function loader$g({
  request
}) {
  const {
    sessionToken,
    cors
  } = await authenticate.public.customerAccount(request);
  const storeDomain = (sessionToken.dest ?? "").replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase().trim();
  if (!storeDomain) {
    return cors(Response.json({
      error: "Unauthorized"
    }, {
      status: 401
    }));
  }
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");
  const rows = await prisma.serviceSettings.findMany({
    where: {
      shop: storeDomain
    },
    select: {
      id: true,
      enabled: true
    }
  });
  const timeLimitRecord = await prisma.orderEditTimeLimit.findUnique({
    where: {
      shop: storeDomain
    }
  });
  const googleConfig = await prisma.googlePlacesConfig.findUnique({
    where: {
      shop: storeDomain
    }
  });
  const hasGooglePlacesKey = Boolean((googleConfig == null ? void 0 : googleConfig.apiKey) && googleConfig.apiKey.trim().length > 0);
  const editLimitInfo = orderId ? await checkOrderEditLimit({
    shop: storeDomain,
    orderId
  }) : {
    isLimitReached: false,
    currentEditCount: 0,
    maxEdits: timeLimitRecord ? timeLimitRecord.maxEdits : 3
  };
  const settings = {};
  for (const row of rows) {
    settings[row.id] = row.enabled;
  }
  return cors(Response.json({
    settings,
    hasGooglePlacesKey,
    timeLimit: timeLimitRecord ? {
      preset: timeLimitRecord.timeLimit,
      customValue: timeLimitRecord.customValue,
      customUnit: timeLimitRecord.customUnit
    } : {
      preset: "1h",
      customValue: 1,
      customUnit: "hours"
    },
    editLimit: {
      maxEdits: editLimitInfo.maxEdits,
      currentEditCount: editLimitInfo.currentEditCount,
      isLimitReached: editLimitInfo.isLimitReached
    }
  }));
}
async function action$b({
  request
}) {
  const {
    cors
  } = await authenticate.public.customerAccount(request);
  return cors(Response.json({
    error: "Method not allowed"
  }, {
    status: 405
  }));
}
const route12 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$b,
  loader: loader$g
}, Symbol.toStringTag, { value: "Module" }));
const action$a = async ({
  request
}) => {
  const {
    shop,
    topic,
    payload
  } = await authenticate.webhook(request);
  console.log(`[webhooks.orders.paid] Received ${topic} for ${shop}`);
  const orderId = (payload == null ? void 0 : payload.admin_graphql_api_id) || ((payload == null ? void 0 : payload.id) ? `gid://shopify/Order/${payload.id}` : null);
  if (orderId && shop) {
    try {
      const {
        admin
      } = await unauthenticated.admin(shop);
      const res = await releasePaymentPendingHold(admin, orderId);
      console.log(`[webhooks.orders.paid] Released hold for ${orderId}:`, res);
    } catch (err) {
      console.error(`[webhooks.orders.paid] Error releasing hold for ${orderId}:`, err);
    }
  }
  return new Response(null, {
    status: 200
  });
};
const route13 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$a
}, Symbol.toStringTag, { value: "Module" }));
async function persistFreeShippingCode(admin, orderId, code) {
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
              value: code.trim()
            }
          ]
        }
      }
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
async function detectActiveFreeShipping(admin, order) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F;
  const result = {
    hasFreeShipping: false,
    code: null,
    maxPrice: null
  };
  if (!order) return result;
  const mfCode = (_b = (_a2 = order.metafield) == null ? void 0 : _a2.value) == null ? void 0 : _b.trim();
  if (mfCode) {
    result.code = mfCode;
    result.hasFreeShipping = true;
  }
  const tags = Array.isArray(order.tags) ? order.tags : [];
  for (const t of tags) {
    const match = t.match(/^free-shipping:(.+)$/i);
    if (match) {
      result.code = result.code || match[1].trim();
      result.hasFreeShipping = true;
    }
  }
  const sTitle = ((_c = order.shippingLine) == null ? void 0 : _c.title) || ((_f = (_e = (_d = order.shippingLines) == null ? void 0 : _d.nodes) == null ? void 0 : _e[0]) == null ? void 0 : _f.title) || "";
  const codeInTitleMatch = sTitle.match(/\(Free\s*-\s*([^)]+)\)/i) || sTitle.match(/Free Shipping\s*\(([^)]+)\)/i);
  if (codeInTitleMatch) {
    result.code = result.code || codeInTitleMatch[1].trim();
    result.hasFreeShipping = true;
  } else if (/\(Free\)/i.test(sTitle) || /^Free Shipping/i.test(sTitle)) {
    result.hasFreeShipping = true;
  }
  const sLine = order.shippingLine || ((_h = (_g = order.shippingLines) == null ? void 0 : _g.nodes) == null ? void 0 : _h[0]);
  const currentAmt = parseFloat(
    ((_j = (_i = sLine == null ? void 0 : sLine.discountedPriceSet) == null ? void 0 : _i.presentmentMoney) == null ? void 0 : _j.amount) ?? ((_l = (_k = sLine == null ? void 0 : sLine.discountedPriceSet) == null ? void 0 : _k.shopMoney) == null ? void 0 : _l.amount) ?? ((_n = (_m = sLine == null ? void 0 : sLine.originalPriceSet) == null ? void 0 : _m.presentmentMoney) == null ? void 0 : _n.amount) ?? ((_p = (_o = sLine == null ? void 0 : sLine.originalPriceSet) == null ? void 0 : _o.shopMoney) == null ? void 0 : _p.amount) ?? ((_r = (_q = order.currentShippingPriceSet) == null ? void 0 : _q.shopMoney) == null ? void 0 : _r.amount) ?? "1"
  );
  if (currentAmt === 0 && /\bfree\b/i.test(sTitle)) {
    result.hasFreeShipping = true;
  }
  const allocs = (sLine == null ? void 0 : sLine.discountAllocations) || [];
  for (const alloc of allocs) {
    const app2 = alloc.discountApplication;
    if (app2 == null ? void 0 : app2.code) {
      result.code = result.code || app2.code;
      result.hasFreeShipping = true;
    }
  }
  const discountApps = ((_s = order.discountApplications) == null ? void 0 : _s.nodes) || [];
  for (const app2 of discountApps) {
    if (app2.targetType === "SHIPPING" && app2.code) {
      result.code = result.code || app2.code;
      result.hasFreeShipping = true;
    }
  }
  function isShippingDestinationAllowed(dest, countryCode) {
    if (!dest) return true;
    if (dest.__typename === "DiscountCountryAll" || dest.allCountries) return true;
    if (dest.includeRestOfWorld) return true;
    if (!countryCode) return false;
    const allowed = (dest.countries || []).map((c) => String(c).toUpperCase());
    return allowed.includes(countryCode.trim().toUpperCase());
  }
  const orderCountry = ((_t = order.shippingAddress) == null ? void 0 : _t.countryCode) || null;
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
          { variables: { code: dCode } }
        );
        const checkJson = await checkRes.json();
        const disc = (_v = (_u = checkJson.data) == null ? void 0 : _u.codeDiscountNodeByCode) == null ? void 0 : _v.codeDiscount;
        if ((disc == null ? void 0 : disc.__typename) === "DiscountCodeFreeShipping" && disc.status === "ACTIVE") {
          if (!isShippingDestinationAllowed(disc.destinationSelection, orderCountry)) {
            continue;
          }
          result.code = dCode;
          result.hasFreeShipping = true;
          if ((_w = disc.maximumShippingPrice) == null ? void 0 : _w.amount) {
            result.maxPrice = parseFloat(disc.maximumShippingPrice.amount);
          }
          break;
        }
      } catch (e) {
        console.warn("[detectActiveFreeShipping] discount check error:", e);
      }
    }
  }
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
        { variables: { code: result.code } }
      );
      const lookupJson = await lookupRes.json();
      const disc = (_y = (_x = lookupJson.data) == null ? void 0 : _x.codeDiscountNodeByCode) == null ? void 0 : _y.codeDiscount;
      if ((disc == null ? void 0 : disc.__typename) === "DiscountCodeFreeShipping") {
        if (!isShippingDestinationAllowed(disc.destinationSelection, orderCountry)) {
          result.hasFreeShipping = false;
          result.code = null;
          return result;
        }
        if (result.maxPrice == null && ((_z = disc.maximumShippingPrice) == null ? void 0 : _z.amount)) {
          result.maxPrice = parseFloat(disc.maximumShippingPrice.amount);
        }
      }
    } catch (e) {
      console.warn("[detectActiveFreeShipping] lookup error:", e);
    }
  }
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
      const nodesJson = await nodesRes.json();
      const discNodes = ((_B = (_A = nodesJson.data) == null ? void 0 : _A.codeDiscountNodes) == null ? void 0 : _B.nodes) || [];
      for (const node of discNodes) {
        const disc = node.codeDiscount;
        if (!isShippingDestinationAllowed(disc == null ? void 0 : disc.destinationSelection, orderCountry)) {
          continue;
        }
        const foundCode = (_E = (_D = (_C = disc == null ? void 0 : disc.codes) == null ? void 0 : _C.nodes) == null ? void 0 : _D[0]) == null ? void 0 : _E.code;
        if (foundCode) {
          result.code = foundCode;
          if ((_F = disc.maximumShippingPrice) == null ? void 0 : _F.amount) {
            result.maxPrice = parseFloat(disc.maximumShippingPrice.amount);
          }
          break;
        }
      }
    } catch (e) {
      console.warn("[detectActiveFreeShipping] fallback code query error:", e);
    }
  }
  if (order.id && result.code && !mfCode) {
    persistFreeShippingCode(admin, order.id, result.code).catch(() => {
    });
  }
  return result;
}
function lineItemDisplayName(item) {
  var _a2, _b, _c;
  const productTitle = ((_b = (_a2 = item.variant) == null ? void 0 : _a2.product) == null ? void 0 : _b.title) || item.title || "this product";
  const variantTitle = (_c = item.variant) == null ? void 0 : _c.title;
  if (variantTitle && variantTitle !== "Default Title") {
    return `${productTitle} (${variantTitle})`;
  }
  return productTitle;
}
const APP_ORIGIN_TYPENAME = "ManualDiscountApplication";
function readLineItemDiscountState(item) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l;
  const allocations = item.calculatedDiscountAllocations ?? [];
  const currencyCode = ((_b = (_a2 = item.originalUnitPriceSet) == null ? void 0 : _a2.presentmentMoney) == null ? void 0 : _b.currencyCode) || ((_d = (_c = item.originalUnitPriceSet) == null ? void 0 : _c.shopMoney) == null ? void 0 : _d.currencyCode) || "";
  if (allocations.length === 0) {
    return {
      currencyCode,
      existingApplicationId: null,
      existingIsOurs: false,
      blocked: false,
      tag: {
        checkoutAmount: 0,
        productAmount: 0,
        orderAmount: 0,
        label: ""
      }
    };
  }
  let existingApplicationId = null;
  let existingIsOurs = false;
  let blocked = false;
  let tag = {
    checkoutAmount: 0,
    productAmount: 0,
    orderAmount: 0,
    label: ""
  };
  let resolvedCurrency = currencyCode;
  for (const allocation of allocations) {
    const app2 = allocation.discountApplication;
    if (!app2) continue;
    existingApplicationId = app2.id;
    const allocatedAmount = parseFloat(((_f = (_e = allocation.allocatedAmountSet) == null ? void 0 : _e.presentmentMoney) == null ? void 0 : _f.amount) ?? ((_h = (_g = allocation.allocatedAmountSet) == null ? void 0 : _g.shopMoney) == null ? void 0 : _h.amount) ?? "0");
    if ((_j = (_i = allocation.allocatedAmountSet) == null ? void 0 : _i.presentmentMoney) == null ? void 0 : _j.currencyCode) {
      resolvedCurrency = allocation.allocatedAmountSet.presentmentMoney.currencyCode;
    } else if ((_l = (_k = allocation.allocatedAmountSet) == null ? void 0 : _k.shopMoney) == null ? void 0 : _l.currencyCode) {
      resolvedCurrency = allocation.allocatedAmountSet.shopMoney.currencyCode;
    }
    if (app2.__typename === APP_ORIGIN_TYPENAME) {
      if (!blocked) {
        existingIsOurs = true;
      }
      const decoded = decodeTag(app2.description);
      if (decoded) {
        tag = decoded;
      } else {
        tag = {
          checkoutAmount: 0,
          productAmount: allocatedAmount,
          orderAmount: 0,
          label: app2.description ?? ""
        };
      }
    } else if (app2.targetSelection === "ALL") {
      tag = {
        checkoutAmount: allocatedAmount,
        productAmount: tag.productAmount,
        orderAmount: tag.orderAmount,
        label: app2.description || "Checkout discount"
      };
    } else {
      existingIsOurs = false;
      blocked = true;
      tag = {
        checkoutAmount: allocatedAmount,
        productAmount: 0,
        orderAmount: 0,
        label: app2.description || "Checkout discount"
      };
    }
  }
  return {
    currencyCode: resolvedCurrency,
    existingApplicationId,
    existingIsOurs,
    blocked,
    tag
  };
}
function collectExistingDiscounts(allLineItems) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i;
  const map = /* @__PURE__ */ new Map();
  for (const item of allLineItems) {
    const allocations = item.calculatedDiscountAllocations ?? [];
    for (const alloc of allocations) {
      const app2 = alloc.discountApplication;
      if (!app2 || !app2.id) continue;
      const amount = parseFloat(((_b = (_a2 = alloc.allocatedAmountSet) == null ? void 0 : _a2.presentmentMoney) == null ? void 0 : _b.amount) ?? ((_d = (_c = alloc.allocatedAmountSet) == null ? void 0 : _c.shopMoney) == null ? void 0 : _d.amount) ?? "0");
      const currency = ((_f = (_e = alloc.allocatedAmountSet) == null ? void 0 : _e.presentmentMoney) == null ? void 0 : _f.currencyCode) || ((_h = (_g = alloc.allocatedAmountSet) == null ? void 0 : _g.shopMoney) == null ? void 0 : _h.currencyCode) || "USD";
      let codeOrLabel = "";
      if (app2.code) {
        codeOrLabel = app2.code;
      } else if (app2.description) {
        const decoded = decodeTag(app2.description);
        codeOrLabel = (((_i = decoded == null ? void 0 : decoded.bxgy) == null ? void 0 : _i.code) || (decoded == null ? void 0 : decoded.label) || app2.description).trim();
      }
      const appliedTo = app2.appliedTo === "ORDER" || app2.targetSelection === "ALL" ? "ORDER" : "LINE";
      const isOurs = app2.__typename === APP_ORIGIN_TYPENAME || app2.__typename === "CalculatedManualDiscountApplication";
      if (!map.has(app2.id)) {
        map.set(app2.id, {
          id: app2.id,
          typename: app2.__typename,
          codeOrLabel,
          appliedTo,
          totalAmount: amount,
          currencyCode: currency,
          lineItemIds: [item.id],
          isOurs
        });
      } else {
        const existing = map.get(app2.id);
        existing.totalAmount = round2(existing.totalAmount + amount);
        if (!existing.lineItemIds.includes(item.id)) {
          existing.lineItemIds.push(item.id);
        }
      }
    }
  }
  return map;
}
async function getCombinesWithForExistingDiscount(admin, code) {
  var _a2, _b;
  const cleanCode = code.trim().toUpperCase();
  if (!cleanCode) {
    return {
      orderDiscounts: false,
      productDiscounts: false,
      shippingDiscounts: false
    };
  }
  try {
    const res = await admin.graphql(`#graphql
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
      }`, {
      variables: {
        code: cleanCode
      }
    });
    const json = await res.json();
    const codeDiscount = (_b = (_a2 = json.data) == null ? void 0 : _a2.codeDiscountNodeByCode) == null ? void 0 : _b.codeDiscount;
    if (codeDiscount == null ? void 0 : codeDiscount.combinesWith) {
      return {
        orderDiscounts: !!codeDiscount.combinesWith.orderDiscounts,
        productDiscounts: !!codeDiscount.combinesWith.productDiscounts,
        shippingDiscounts: !!codeDiscount.combinesWith.shippingDiscounts
      };
    }
  } catch (e) {
    console.error("[getCombinesWithForExistingDiscount] error:", e);
  }
  return {
    orderDiscounts: false,
    productDiscounts: false,
    shippingDiscounts: false
  };
}
function canDiscountsCombine(incoming, existing) {
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
function lineItemMatchesRule(item, rule) {
  var _a2, _b, _c, _d, _e, _f, _g;
  const hasSpecific = rule.variantIds.size > 0 || rule.productIds.size > 0 || rule.collectionIds.size > 0;
  if (!hasSpecific) return true;
  const variantId = (_a2 = item.variant) == null ? void 0 : _a2.id;
  const productId = (_c = (_b = item.variant) == null ? void 0 : _b.product) == null ? void 0 : _c.id;
  const collectionIds = ((_g = (_f = (_e = (_d = item.variant) == null ? void 0 : _d.product) == null ? void 0 : _e.collections) == null ? void 0 : _f.nodes) == null ? void 0 : _g.map((n) => n.id)) ?? [];
  if (variantId && rule.variantIds.has(variantId)) return true;
  if (productId && rule.productIds.has(productId)) return true;
  if (collectionIds.some((id) => rule.collectionIds.has(id))) return true;
  return false;
}
async function resolveDiscountCode(admin, code) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C;
  const cleanCode = code.trim().toUpperCase();
  const res = await admin.graphql(`#graphql
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
            minimumRequirement {
              __typename
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
              __typename
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
    }`, {
    variables: {
      code: cleanCode
    }
  });
  const json = await res.json();
  const node = (_a2 = json.data) == null ? void 0 : _a2.codeDiscountNodeByCode;
  if (!node) {
    return {
      ok: false,
      message: `Discount code "${code}" was not found.`
    };
  }
  const codeDiscount = node.codeDiscount;
  if (!codeDiscount) {
    return {
      ok: false,
      message: `Discount code "${code}" was not found.`
    };
  }
  if (codeDiscount.status && codeDiscount.status !== "ACTIVE") {
    return {
      ok: false,
      message: `Discount code "${code}" is ${String(codeDiscount.status).toLowerCase()}.`
    };
  }
  if (codeDiscount.__typename === "DiscountCodeBasic") {
    const value = (_b = codeDiscount.customerGets) == null ? void 0 : _b.value;
    const items = (_c = codeDiscount.customerGets) == null ? void 0 : _c.items;
    const amountVal = value && "amount" in value ? value.amount : null;
    if (amountVal && amountVal.appliesOnEachItem === false) {
      return {
        ok: false,
        message: `"${code}" is an order-level discount code. Only product-level discount codes can be applied here.`
      };
    }
    if (!items || items.__typename === "AllDiscountItems") {
      return {
        ok: false,
        message: `"${code}" is an order-level discount code. Only product-level discount codes can be applied here.`
      };
    }
    const variantIds = new Set((((_d = items.productVariants) == null ? void 0 : _d.nodes) ?? []).map((n) => n.id));
    const productIds = new Set((((_e = items.products) == null ? void 0 : _e.nodes) ?? []).map((n) => n.id));
    const collectionIds = new Set((((_f = items.collections) == null ? void 0 : _f.nodes) ?? []).map((n) => n.id));
    if (variantIds.size === 0 && productIds.size === 0 && collectionIds.size === 0) {
      return {
        ok: false,
        message: `"${code}" is an order-level discount code. Only product-level discount codes can be applied here.`
      };
    }
    const targeting = {
      type: "selection",
      variantIds,
      productIds,
      collectionIds
    };
    const label = codeDiscount.title || cleanCode;
    const combinesWith = {
      orderDiscounts: !!((_g = codeDiscount.combinesWith) == null ? void 0 : _g.orderDiscounts),
      productDiscounts: !!((_h = codeDiscount.combinesWith) == null ? void 0 : _h.productDiscounts),
      shippingDiscounts: !!((_i = codeDiscount.combinesWith) == null ? void 0 : _i.shippingDiscounts)
    };
    let minQty = null;
    let minSubtotal = null;
    const minReq = codeDiscount.minimumRequirement;
    if (minReq && (minReq.__typename === "DiscountMinimumQuantity" || minReq.greaterThanOrEqualToQuantity != null) && minReq.greaterThanOrEqualToQuantity != null) {
      minQty = parseInt(String(minReq.greaterThanOrEqualToQuantity), 10);
    } else if (minReq && (minReq.__typename === "DiscountMinimumSubtotal" || minReq.greaterThanOrEqualToSubtotal != null) && minReq.greaterThanOrEqualToSubtotal != null) {
      const subtotalObj = minReq.greaterThanOrEqualToSubtotal;
      const subtotalAmt = typeof subtotalObj === "object" && subtotalObj !== null ? subtotalObj.amount : subtotalObj;
      const subtotalCurr = typeof subtotalObj === "object" && subtotalObj !== null ? subtotalObj.currencyCode : "USD";
      minSubtotal = {
        amount: parseFloat(String(subtotalAmt || 0)),
        currencyCode: String(subtotalCurr || "USD")
      };
    }
    if ((value == null ? void 0 : value.percentage) != null) {
      return {
        ok: true,
        type: "basic",
        kind: "percentage",
        percentage: value.percentage * 100,
        label,
        targeting,
        combinesWith,
        minimumQuantity: minQty,
        minimumSubtotal: minSubtotal
      };
    }
    if ((_j = value == null ? void 0 : value.amount) == null ? void 0 : _j.amount) {
      return {
        ok: true,
        type: "basic",
        kind: "fixed",
        amount: value.amount.amount,
        currencyCode: value.amount.currencyCode,
        label,
        targeting,
        combinesWith,
        minimumQuantity: minQty,
        minimumSubtotal: minSubtotal
      };
    }
    return {
      ok: false,
      message: `Discount code "${code}" does not have a supported percentage or fixed value.`
    };
  }
  if (codeDiscount.__typename === "DiscountCodeBxgy") {
    const buyItems = (_k = codeDiscount.customerBuys) == null ? void 0 : _k.items;
    const buyVal = (_l = codeDiscount.customerBuys) == null ? void 0 : _l.value;
    const getItems = (_m = codeDiscount.customerGets) == null ? void 0 : _m.items;
    const getVal = (_n = codeDiscount.customerGets) == null ? void 0 : _n.value;
    const buyVariantIds = new Set((((_o = buyItems == null ? void 0 : buyItems.productVariants) == null ? void 0 : _o.nodes) ?? []).map((n) => n.id));
    const buyProductIds = new Set((((_p = buyItems == null ? void 0 : buyItems.products) == null ? void 0 : _p.nodes) ?? []).map((n) => n.id));
    const buyCollectionIds = new Set((((_q = buyItems == null ? void 0 : buyItems.collections) == null ? void 0 : _q.nodes) ?? []).map((n) => n.id));
    const getVariantIds = new Set((((_r = getItems == null ? void 0 : getItems.productVariants) == null ? void 0 : _r.nodes) ?? []).map((n) => n.id));
    const getProductIds = new Set((((_s = getItems == null ? void 0 : getItems.products) == null ? void 0 : _s.nodes) ?? []).map((n) => n.id));
    const getCollectionIds = new Set((((_t = getItems == null ? void 0 : getItems.collections) == null ? void 0 : _t.nodes) ?? []).map((n) => n.id));
    let minQuantity = 1;
    let minAmount = 0;
    if (buyVal == null ? void 0 : buyVal.quantity) {
      minQuantity = parseInt(String(buyVal.quantity), 10) || 1;
    } else if (buyVal == null ? void 0 : buyVal.amount) {
      minAmount = parseFloat(String(buyVal.amount)) || 0;
    }
    const getQty = parseInt(String(((_u = getVal == null ? void 0 : getVal.quantity) == null ? void 0 : _u.quantity) || 1), 10) || 1;
    const effect = getVal == null ? void 0 : getVal.effect;
    let getKind = "percentage";
    let getPercentage;
    let getAmount;
    let getCurrencyCode;
    if ((effect == null ? void 0 : effect.percentage) != null) {
      getKind = "percentage";
      getPercentage = effect.percentage * 100;
    } else if ((_v = effect == null ? void 0 : effect.amount) == null ? void 0 : _v.amount) {
      getKind = "fixed";
      getAmount = effect.amount.amount;
      getCurrencyCode = effect.amount.currencyCode;
    } else {
      getKind = "percentage";
      getPercentage = 100;
    }
    const combinesWith = {
      orderDiscounts: !!((_w = codeDiscount.combinesWith) == null ? void 0 : _w.orderDiscounts),
      productDiscounts: !!((_x = codeDiscount.combinesWith) == null ? void 0 : _x.productDiscounts),
      shippingDiscounts: !!((_y = codeDiscount.combinesWith) == null ? void 0 : _y.shippingDiscounts)
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
        minAmount
      },
      getRule: {
        variantIds: getVariantIds,
        productIds: getProductIds,
        collectionIds: getCollectionIds,
        quantity: getQty,
        kind: getKind,
        percentage: getPercentage,
        amount: getAmount,
        currencyCode: getCurrencyCode
      }
    };
  }
  if (codeDiscount.__typename === "DiscountCodeFreeShipping") {
    const maxPrice = ((_z = codeDiscount.maximumShippingPrice) == null ? void 0 : _z.amount) ? parseFloat(codeDiscount.maximumShippingPrice.amount) : null;
    let minQty = null;
    let minSubtotal = null;
    const minReq = codeDiscount.minimumRequirement;
    if (minReq && (minReq.__typename === "DiscountMinimumQuantity" || minReq.greaterThanOrEqualToQuantity != null) && minReq.greaterThanOrEqualToQuantity != null) {
      minQty = parseInt(String(minReq.greaterThanOrEqualToQuantity), 10);
    } else if (minReq && (minReq.__typename === "DiscountMinimumSubtotal" || minReq.greaterThanOrEqualToSubtotal != null) && minReq.greaterThanOrEqualToSubtotal != null) {
      const subtotalObj = minReq.greaterThanOrEqualToSubtotal;
      const subtotalAmt = typeof subtotalObj === "object" && subtotalObj !== null ? subtotalObj.amount : subtotalObj;
      const subtotalCurr = typeof subtotalObj === "object" && subtotalObj !== null ? subtotalObj.currencyCode : "USD";
      minSubtotal = {
        amount: parseFloat(String(subtotalAmt || 0)),
        currencyCode: String(subtotalCurr || "USD")
      };
    }
    const combinesWith = {
      orderDiscounts: !!((_A = codeDiscount.combinesWith) == null ? void 0 : _A.orderDiscounts),
      productDiscounts: !!((_B = codeDiscount.combinesWith) == null ? void 0 : _B.productDiscounts),
      shippingDiscounts: !!((_C = codeDiscount.combinesWith) == null ? void 0 : _C.shippingDiscounts)
    };
    let destinationSelection = {
      allCountries: true,
      countries: [],
      includeRestOfWorld: false
    };
    const dest = codeDiscount.destinationSelection;
    if (dest) {
      if (dest.__typename === "DiscountCountryAll") {
        destinationSelection = {
          allCountries: true,
          countries: [],
          includeRestOfWorld: false
        };
      } else if (dest.__typename === "DiscountCountries") {
        destinationSelection = {
          allCountries: false,
          countries: (dest.countries || []).map((c) => String(c).toUpperCase()),
          includeRestOfWorld: Boolean(dest.includeRestOfWorld)
        };
      }
    }
    return {
      ok: true,
      type: "free_shipping",
      label: codeDiscount.title || cleanCode,
      code: cleanCode,
      combinesWith,
      maximumShippingPrice: maxPrice,
      minimumQuantity: minQty,
      minimumSubtotal: minSubtotal,
      destinationSelection
    };
  }
  return {
    ok: false,
    message: `Discount code "${code}" is not a supported type.`
  };
}
function discountAmountAgainst(resolved, base) {
  if (resolved.kind === "percentage") {
    return Math.max(base * (resolved.percentage / 100), 0);
  }
  return Math.min(Math.max(parseFloat(resolved.amount) || 0, 0), base);
}
function lineItemMatchesTargeting(item, targeting) {
  var _a2, _b, _c, _d, _e, _f, _g;
  if (targeting.type === "order") return true;
  const variantId = (_a2 = item.variant) == null ? void 0 : _a2.id;
  const productId = (_c = (_b = item.variant) == null ? void 0 : _b.product) == null ? void 0 : _c.id;
  const collectionIds = ((_g = (_f = (_e = (_d = item.variant) == null ? void 0 : _d.product) == null ? void 0 : _e.collections) == null ? void 0 : _f.nodes) == null ? void 0 : _g.map((n) => n.id)) ?? [];
  if (variantId && targeting.variantIds.has(variantId)) return true;
  if (productId && targeting.productIds.has(productId)) return true;
  if (collectionIds.some((id) => targeting.collectionIds.has(id))) return true;
  return false;
}
async function loader$f({
  request
}) {
  const {
    cors
  } = await authenticate.public.customerAccount(request);
  return cors(new Response(JSON.stringify({
    success: true
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  }));
}
async function action$9({
  request
}) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x, _y, _z, _A, _B, _C, _D, _E, _F, _G, _H, _I, _J, _K, _L, _M, _N, _O, _P, _Q, _R, _S, _T, _U, _V, _W, _X, _Y, _Z, __, _$, _aa, _ba, _ca, _da, _ea, _fa, _ga, _ha, _ia, _ja, _ka, _la, _ma, _na, _oa, _pa, _qa, _ra, _sa, _ta, _ua, _va, _wa, _xa, _ya, _za, _Aa, _Ba, _Ca, _Da, _Ea, _Fa, _Ga, _Ha, _Ia, _Ja, _Ka, _La, _Ma, _Na, _Oa, _Pa, _Qa, _Ra, _Sa, _Ta, _Ua, _Va, _Wa, _Xa, _Ya, _Za, __a, _$a, _ab, _bb, _cb, _db, _eb, _fb, _gb, _hb, _ib, _jb, _kb, _lb, _mb, _nb, _ob, _pb, _qb;
  const {
    sessionToken,
    cors
  } = await authenticate.public.customerAccount(request);
  if (request.method === "OPTIONS") {
    return cors(new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }));
  }
  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  const {
    admin
  } = await unauthenticated.admin(storeDomain);
  const body = await request.json();
  const {
    orderId,
    discountCode,
    source
  } = body || {};
  if (!orderId || !discountCode) {
    return cors(Response.json({
      userErrors: [{
        message: "Missing orderId or discountCode."
      }]
    }, {
      status: 400
    }));
  }
  const guard = await validateOrderEditable({
    admin,
    shop: storeDomain,
    orderId,
    customerAccountId: sessionToken.sub,
    requiredServiceId: "apply-discount"
  });
  if (!guard.allowed) {
    return cors(Response.json({
      userErrors: [{
        message: guard.message
      }]
    }, {
      status: guard.status
    }));
  }
  try {
    const resolved = await resolveDiscountCode(admin, discountCode);
    if (!resolved.ok) {
      return cors(Response.json({
        userErrors: [{
          message: resolved.message
        }]
      }, {
        status: 422
      }));
    }
    if (resolved.type === "free_shipping") {
      const destSel = resolved.destinationSelection;
      if (destSel && !destSel.allCountries) {
        const orderDestRes = await admin.graphql(`#graphql
          query getOrderShippingCountry($id: ID!) {
            order(id: $id) {
              shippingAddress {
                countryCode
                country
              }
            }
          }`, {
          variables: {
            id: orderId
          }
        });
        const orderDestJson = await orderDestRes.json();
        const shippingAddress = (_b = (_a2 = orderDestJson.data) == null ? void 0 : _a2.order) == null ? void 0 : _b.shippingAddress;
        const currentCountryCode = (shippingAddress == null ? void 0 : shippingAddress.countryCode) ? String(shippingAddress.countryCode).toUpperCase() : null;
        const currentCountryName = (shippingAddress == null ? void 0 : shippingAddress.country) || currentCountryCode || "the current shipping address";
        const allowedCountries = (destSel.countries || []).map((c) => c.toUpperCase());
        const isEligible = Boolean(destSel.includeRestOfWorld) || Boolean(currentCountryCode) && allowedCountries.includes(currentCountryCode);
        if (!isEligible) {
          const allowedDisplay = allowedCountries.length > 0 ? ` (eligible for: ${allowedCountries.join(", ")})` : "";
          return cors(Response.json({
            userErrors: [{
              message: `Discount code "${discountCode}" cannot be applied because it is not valid for ${currentCountryName}${allowedDisplay}.`
            }]
          }, {
            status: 422
          }));
        }
      }
    }
    const beginRes = await admin.graphql(`#graphql
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
      }`, {
      variables: {
        id: orderId
      }
    });
    const beginJson = await beginRes.json();
    const beginErrors = ((_d = (_c = beginJson.data) == null ? void 0 : _c.orderEditBegin) == null ? void 0 : _d.userErrors) ?? [];
    if (beginErrors.length) {
      return cors(Response.json({
        userErrors: beginErrors
      }, {
        status: 422
      }));
    }
    const calculatedOrder = beginJson.data.orderEditBegin.calculatedOrder;
    const calculatedOrderId = calculatedOrder.id;
    const allLineItems = (((_e = calculatedOrder.lineItems) == null ? void 0 : _e.nodes) ?? []).filter((item) => {
      const activeQty = item.editableQuantity ?? item.quantity;
      return activeQty > 0;
    });
    if (allLineItems.length === 0) {
      return cors(Response.json({
        userErrors: [{
          message: "This order has no active line items."
        }]
      }, {
        status: 422
      }));
    }
    if (resolved.type === "free_shipping") {
      let totalActiveQty = 0;
      let totalActiveSubtotal = 0;
      let currencyCode = "USD";
      for (const item of allLineItems) {
        const qty = item.editableQuantity ?? item.quantity;
        const unitPrice = parseFloat(((_g = (_f = item.originalUnitPriceSet) == null ? void 0 : _f.presentmentMoney) == null ? void 0 : _g.amount) ?? ((_i = (_h = item.originalUnitPriceSet) == null ? void 0 : _h.shopMoney) == null ? void 0 : _i.amount) ?? "0");
        if ((_k = (_j = item.originalUnitPriceSet) == null ? void 0 : _j.presentmentMoney) == null ? void 0 : _k.currencyCode) {
          currencyCode = item.originalUnitPriceSet.presentmentMoney.currencyCode;
        } else if ((_m = (_l = item.originalUnitPriceSet) == null ? void 0 : _l.shopMoney) == null ? void 0 : _m.currencyCode) {
          currencyCode = item.originalUnitPriceSet.shopMoney.currencyCode;
        }
        totalActiveQty += qty;
        totalActiveSubtotal += qty * unitPrice;
      }
      if (resolved.minimumQuantity != null && totalActiveQty < resolved.minimumQuantity) {
        return cors(Response.json({
          userErrors: [{
            message: `Discount code "${discountCode}" requires a minimum of ${resolved.minimumQuantity} item(s) in the order.`
          }]
        }, {
          status: 422
        }));
      }
      if (resolved.minimumSubtotal != null && totalActiveSubtotal < resolved.minimumSubtotal.amount) {
        return cors(Response.json({
          userErrors: [{
            message: `Discount code "${discountCode}" requires a minimum subtotal of ${resolved.minimumSubtotal.amount.toFixed(2)} ${resolved.minimumSubtotal.currencyCode}.`
          }]
        }, {
          status: 422
        }));
      }
      const shippingLines = calculatedOrder.shippingLines ?? [];
      let existingShippingLineId = null;
      let existingShippingTitle = "Standard Shipping";
      let existingShippingAmount = 0;
      if (shippingLines.length > 0) {
        const firstLine = shippingLines[0];
        existingShippingLineId = firstLine.id;
        if (firstLine.title) existingShippingTitle = firstLine.title;
        existingShippingAmount = parseFloat(((_o = (_n = firstLine.price) == null ? void 0 : _n.presentmentMoney) == null ? void 0 : _o.amount) ?? ((_q = (_p = firstLine.price) == null ? void 0 : _p.shopMoney) == null ? void 0 : _q.amount) ?? "0");
        if ((_s = (_r = firstLine.price) == null ? void 0 : _r.presentmentMoney) == null ? void 0 : _s.currencyCode) {
          currencyCode = firstLine.price.presentmentMoney.currencyCode;
        } else if ((_u = (_t = firstLine.price) == null ? void 0 : _t.shopMoney) == null ? void 0 : _u.currencyCode) {
          currencyCode = firstLine.price.shopMoney.currencyCode;
        }
      }
      if (existingShippingLineId && existingShippingAmount === 0) {
        return cors(Response.json({
          success: false,
          applied: false,
          appliedCount: 0,
          appliedProducts: [],
          skippedProducts: ["Shipping"],
          discountLabel: resolved.label,
          warnings: ["This order already has free shipping."],
          userErrors: []
        }));
      }
      if (resolved.maximumShippingPrice != null && existingShippingAmount > resolved.maximumShippingPrice) {
        return cors(Response.json({
          userErrors: [{
            message: `Shipping rate of ${existingShippingAmount.toFixed(2)} ${currencyCode} exceeds the maximum shipping rate allowed for discount code "${discountCode}" (${resolved.maximumShippingPrice.toFixed(2)} ${currencyCode}).`
          }]
        }, {
          status: 422
        }));
      }
      const existingDiscounts2 = collectExistingDiscounts(allLineItems);
      const incompatibleDiscounts2 = [];
      for (const existingApp of existingDiscounts2.values()) {
        const existingCombinesWith = await getCombinesWithForExistingDiscount(admin, existingApp.codeOrLabel);
        const canCombine = canDiscountsCombine({
          type: "shipping",
          combinesWith: resolved.combinesWith
        }, {
          appliedTo: existingApp.appliedTo,
          combinesWith: existingCombinesWith
        });
        if (!canCombine) {
          incompatibleDiscounts2.push(existingApp);
        }
      }
      if (incompatibleDiscounts2.length > 0) {
        const totalIncompatibleAmount = round2(incompatibleDiscounts2.reduce((sum, d) => sum + d.totalAmount, 0));
        if (totalIncompatibleAmount >= existingShippingAmount) {
          const incompNames = incompatibleDiscounts2.map((d) => d.codeOrLabel || "existing discount").join(", ");
          return cors(Response.json({
            success: false,
            applied: false,
            appliedCount: 0,
            appliedProducts: [],
            skippedProducts: ["Shipping"],
            discountLabel: resolved.label,
            warnings: [`Discount code "${discountCode}" cannot be combined with existing discount "${incompNames}". The existing discount (${totalIncompatibleAmount.toFixed(2)} ${currencyCode}) was kept because it offers a higher discount than "${discountCode}" (${existingShippingAmount.toFixed(2)} ${currencyCode}).`],
            userErrors: []
          }));
        }
        for (const incomp of incompatibleDiscounts2) {
          const removeRes = await admin.graphql(`#graphql
            mutation RemoveIncompatibleDiscount($id: ID!, $discountApplicationId: ID!) {
              orderEditRemoveDiscount(id: $id, discountApplicationId: $discountApplicationId) {
                userErrors { field message }
              }
            }`, {
            variables: {
              id: calculatedOrderId,
              discountApplicationId: incomp.id
            }
          });
          const removeJson = await removeRes.json();
          const removeErrors = ((_w = (_v = removeJson.data) == null ? void 0 : _v.orderEditRemoveDiscount) == null ? void 0 : _w.userErrors) ?? [];
          if (((_x = removeJson.errors) == null ? void 0 : _x.length) || removeErrors.length) {
            const rawMsg = ((_y = removeErrors[0]) == null ? void 0 : _y.message) ?? ((_A = (_z = removeJson.errors) == null ? void 0 : _z[0]) == null ? void 0 : _A.message) ?? "unknown error";
            return cors(Response.json({
              userErrors: [{
                message: `Existing discount "${incomp.codeOrLabel}" cannot be combined with "${discountCode}" and could not be removed: ${rawMsg}`
              }]
            }, {
              status: 422
            }));
          }
        }
      }
      if (existingShippingLineId) {
        const removeShipRes = await admin.graphql(`#graphql
          mutation RemoveShippingLine($id: ID!, $shippingLineId: ID!) {
            orderEditRemoveShippingLine(id: $id, shippingLineId: $shippingLineId) {
              calculatedOrder { id }
              userErrors { field message }
            }
          }`, {
          variables: {
            id: calculatedOrderId,
            shippingLineId: existingShippingLineId
          }
        });
        const removeShipJson = await removeShipRes.json();
        const removeShipErrors = ((_C = (_B = removeShipJson.data) == null ? void 0 : _B.orderEditRemoveShippingLine) == null ? void 0 : _C.userErrors) ?? [];
        if (removeShipErrors.length) {
          return cors(Response.json({
            userErrors: removeShipErrors
          }, {
            status: 422
          }));
        }
      }
      const cleanExistingTitle = (existingShippingTitle || "Standard").replace(/\s*\(Free(?:\s*-\s*[^)]+)?\)/gi, "").replace(/\s*\(Already Applied\)/gi, "").replace(/\s*\(Free\)/gi, "").trim();
      const freeShippingTitle = `${cleanExistingTitle} (Free - ${discountCode})`;
      const targetShippingCurrency = ((_E = (_D = calculatedOrder.totalPriceSet) == null ? void 0 : _D.presentmentMoney) == null ? void 0 : _E.currencyCode) || ((_I = (_H = (_G = (_F = calculatedOrder.shippingLines) == null ? void 0 : _F[0]) == null ? void 0 : _G.price) == null ? void 0 : _H.presentmentMoney) == null ? void 0 : _I.currencyCode) || currencyCode || "USD";
      let addShipRes = await admin.graphql(`#graphql
        mutation AddFreeShippingLine($id: ID!, $shippingLine: OrderEditAddShippingLineInput!) {
          orderEditAddShippingLine(id: $id, shippingLine: $shippingLine) {
            calculatedOrder { id }
            calculatedShippingLine { id }
            userErrors { field message }
          }
        }`, {
        variables: {
          id: calculatedOrderId,
          shippingLine: {
            title: freeShippingTitle,
            price: {
              amount: "0.00",
              currencyCode: targetShippingCurrency
            }
          }
        }
      });
      let addShipJson = await addShipRes.json();
      let addShipErrors = ((_K = (_J = addShipJson.data) == null ? void 0 : _J.orderEditAddShippingLine) == null ? void 0 : _K.userErrors) ?? [];
      if (addShipErrors.length) {
        const currencyMatch = (_M = (_L = addShipErrors[0]) == null ? void 0 : _L.message) == null ? void 0 : _M.match(/must be in ([A-Z]{3})/i);
        if (currencyMatch) {
          const retryCurrency = currencyMatch[1].toUpperCase();
          addShipRes = await admin.graphql(`#graphql
            mutation AddFreeShippingLineRetry($id: ID!, $shippingLine: OrderEditAddShippingLineInput!) {
              orderEditAddShippingLine(id: $id, shippingLine: $shippingLine) {
                calculatedOrder { id }
                calculatedShippingLine { id }
                userErrors { field message }
              }
            }`, {
            variables: {
              id: calculatedOrderId,
              shippingLine: {
                title: freeShippingTitle,
                price: {
                  amount: "0.00",
                  currencyCode: retryCurrency
                }
              }
            }
          });
          addShipJson = await addShipRes.json();
          addShipErrors = ((_O = (_N = addShipJson.data) == null ? void 0 : _N.orderEditAddShippingLine) == null ? void 0 : _O.userErrors) ?? [];
        }
      }
      if (addShipErrors.length) {
        return cors(Response.json({
          userErrors: addShipErrors
        }, {
          status: 422
        }));
      }
      const commitRes2 = await admin.graphql(`#graphql
        mutation CommitEdit($id: ID!, $staffNote: String) {
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
        }`, {
        variables: {
          id: calculatedOrderId,
          staffNote: `Free shipping discount "${discountCode}" applied via customer account`
        }
      });
      const commitJson2 = await commitRes2.json();
      const commitErrors2 = ((_Q = (_P = commitJson2.data) == null ? void 0 : _P.orderEditCommit) == null ? void 0 : _Q.userErrors) ?? [];
      if (commitErrors2.length) {
        return cors(Response.json({
          userErrors: commitErrors2
        }, {
          status: 422
        }));
      }
      await persistFreeShippingCode(admin, orderId, discountCode);
      await trackOrderEdit({
        shop: storeDomain,
        orderId,
        featureId: "apply-discount",
        source
      });
      return cors(Response.json({
        success: true,
        applied: true,
        order: commitJson2.data.orderEditCommit.order,
        appliedCount: 1,
        appliedProducts: ["Shipping (Free)"],
        replacedCount: existingShippingLineId ? 1 : 0,
        skippedProducts: [],
        discountLabel: resolved.label,
        warnings: [],
        userErrors: []
      }));
    }
    if (resolved.type === "bxgy") {
      let totalBuyQty = 0;
      let totalBuyAmt = 0;
      for (const item of allLineItems) {
        if (lineItemMatchesRule(item, resolved.buyRule)) {
          const qty = item.editableQuantity ?? item.quantity;
          const unitPrice = parseFloat(((_S = (_R = item.originalUnitPriceSet) == null ? void 0 : _R.presentmentMoney) == null ? void 0 : _S.amount) ?? ((_U = (_T = item.originalUnitPriceSet) == null ? void 0 : _T.shopMoney) == null ? void 0 : _U.amount) ?? "0");
          totalBuyQty += qty;
          totalBuyAmt += qty * unitPrice;
        }
      }
      const hasRequiredBuyQty = totalBuyQty >= resolved.buyRule.minQuantity;
      const hasRequiredBuyAmt = resolved.buyRule.minAmount <= 0 || totalBuyAmt >= resolved.buyRule.minAmount;
      if (!hasRequiredBuyQty || !hasRequiredBuyAmt) {
        const reqMsg = resolved.buyRule.minAmount > 0 ? `purchase at least ${resolved.buyRule.minAmount.toFixed(2)} worth of qualifying products` : `purchase at least ${resolved.buyRule.minQuantity} qualifying product${resolved.buyRule.minQuantity > 1 ? "s" : ""}`;
        return cors(Response.json({
          userErrors: [{
            message: `Discount code "${discountCode}" requires you to ${reqMsg} first.`
          }]
        }, {
          status: 422
        }));
      }
      const eligibleYItems = allLineItems.filter((item) => lineItemMatchesRule(item, resolved.getRule));
      if (eligibleYItems.length === 0) {
        return cors(Response.json({
          userErrors: [{
            message: `The promotional item for discount code "${discountCode}" is not in this order. Please add it to your order first.`
          }]
        }, {
          status: 422
        }));
      }
      const isSameLineItem = eligibleYItems.length === 1 && lineItemMatchesRule(eligibleYItems[0], resolved.buyRule);
      if (isSameLineItem) {
        const itemQty2 = eligibleYItems[0].editableQuantity ?? eligibleYItems[0].quantity;
        const neededQty = resolved.buyRule.minQuantity + resolved.getRule.quantity;
        if (itemQty2 < neededQty) {
          return cors(Response.json({
            userErrors: [{
              message: `Discount code "${discountCode}" requires at least ${neededQty} units of "${lineItemDisplayName(eligibleYItems[0])}" in your order (Buy ${resolved.buyRule.minQuantity}, Get ${resolved.getRule.quantity}). Current quantity is ${itemQty2}.`
            }]
          }, {
            status: 422
          }));
        }
      }
      const targetItem = eligibleYItems[0];
      const targetDisplayName = lineItemDisplayName(targetItem);
      const targetActiveQty = targetItem.editableQuantity ?? targetItem.quantity;
      const targetUnit = parseFloat(((_W = (_V = targetItem.originalUnitPriceSet) == null ? void 0 : _V.presentmentMoney) == null ? void 0 : _W.amount) ?? ((_Y = (_X = targetItem.originalUnitPriceSet) == null ? void 0 : _X.shopMoney) == null ? void 0 : _Y.amount) ?? "0");
      const targetCurrency = ((__ = (_Z = calculatedOrder.totalPriceSet) == null ? void 0 : _Z.presentmentMoney) == null ? void 0 : __.currencyCode) || ((_aa = (_$ = targetItem.originalUnitPriceSet) == null ? void 0 : _$.presentmentMoney) == null ? void 0 : _aa.currencyCode) || ((_ca = (_ba = targetItem.originalUnitPriceSet) == null ? void 0 : _ba.shopMoney) == null ? void 0 : _ca.currencyCode) || "USD";
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
      const existingDiscounts2 = collectExistingDiscounts(allLineItems);
      const incompatibleDiscounts2 = [];
      for (const existingApp of existingDiscounts2.values()) {
        if (existingApp.id === state.existingApplicationId) {
          continue;
        }
        const existingCombinesWith = await getCombinesWithForExistingDiscount(admin, existingApp.codeOrLabel);
        const canCombine = canDiscountsCombine({
          type: "product",
          combinesWith: resolved.combinesWith
        }, {
          appliedTo: existingApp.appliedTo,
          combinesWith: existingCombinesWith
        });
        if (!canCombine) {
          incompatibleDiscounts2.push(existingApp);
        }
      }
      if (incompatibleDiscounts2.length > 0) {
        const totalIncompatibleAmount = round2(incompatibleDiscounts2.reduce((sum, d) => sum + d.totalAmount, 0));
        if (totalIncompatibleAmount >= calculatedDiscount) {
          const incompNames = incompatibleDiscounts2.map((d) => d.codeOrLabel || "existing discount").join(", ");
          return cors(Response.json({
            success: false,
            applied: false,
            appliedCount: 0,
            appliedProducts: [],
            skippedProducts: [targetDisplayName],
            discountLabel: resolved.label,
            warnings: [`Discount code "${discountCode}" cannot be combined with existing discount "${incompNames}". The existing discount (${totalIncompatibleAmount.toFixed(2)} ${targetCurrency}) was kept because it offers a higher discount than "${discountCode}" (${calculatedDiscount.toFixed(2)} ${targetCurrency}).`],
            userErrors: []
          }));
        }
        for (const incomp of incompatibleDiscounts2) {
          const removeRes = await admin.graphql(`#graphql
            mutation RemoveIncompatibleDiscount($id: ID!, $discountApplicationId: ID!) {
              orderEditRemoveDiscount(id: $id, discountApplicationId: $discountApplicationId) {
                userErrors { field message }
              }
            }`, {
            variables: {
              id: calculatedOrderId,
              discountApplicationId: incomp.id
            }
          });
          const removeJson = await removeRes.json();
          const removeErrors = ((_ea = (_da = removeJson.data) == null ? void 0 : _da.orderEditRemoveDiscount) == null ? void 0 : _ea.userErrors) ?? [];
          if (((_fa = removeJson.errors) == null ? void 0 : _fa.length) || removeErrors.length) {
            const rawMsg = ((_ga = removeErrors[0]) == null ? void 0 : _ga.message) ?? ((_ia = (_ha = removeJson.errors) == null ? void 0 : _ha[0]) == null ? void 0 : _ia.message) ?? "unknown error";
            return cors(Response.json({
              userErrors: [{
                message: `Existing discount "${incomp.codeOrLabel}" cannot be combined with "${discountCode}" and could not be removed: ${rawMsg}`
              }]
            }, {
              status: 422
            }));
          }
        }
      }
      if (state.blocked) {
        if (calculatedDiscount <= state.tag.checkoutAmount) {
          return cors(Response.json({
            success: false,
            applied: false,
            appliedCount: 0,
            appliedProducts: [],
            skippedProducts: [targetDisplayName],
            discountLabel: resolved.label,
            warnings: [`"${targetDisplayName}" already has a checkout discount worth ${state.tag.checkoutAmount.toFixed(2)} ${targetCurrency}. "${discountCode}" would only be worth ${calculatedDiscount.toFixed(2)} ${targetCurrency}, so the existing discount was kept.`],
            userErrors: []
          }));
        }
        if (state.existingApplicationId) {
          const removeRes = await admin.graphql(`#graphql
            mutation RemoveDiscount($id: ID!, $discountApplicationId: ID!) {
              orderEditRemoveDiscount(id: $id, discountApplicationId: $discountApplicationId) {
                userErrors { field message }
              }
            }`, {
            variables: {
              id: calculatedOrderId,
              discountApplicationId: state.existingApplicationId
            }
          });
          const removeJson = await removeRes.json();
          if ((_la = (_ka = (_ja = removeJson.data) == null ? void 0 : _ja.orderEditRemoveDiscount) == null ? void 0 : _ka.userErrors) == null ? void 0 : _la.length) {
            return cors(Response.json({
              userErrors: [{
                message: `"${targetDisplayName}" already has a discount that cannot be removed.`
              }]
            }, {
              status: 422
            }));
          }
        }
      } else {
        if (state.tag.productAmount > 0 && calculatedDiscount <= state.tag.productAmount) {
          return cors(Response.json({
            success: false,
            applied: false,
            appliedCount: 0,
            appliedProducts: [],
            skippedProducts: [targetDisplayName],
            discountLabel: resolved.label,
            warnings: [`"${targetDisplayName}" already has a discount applied worth ${state.tag.productAmount.toFixed(2)} ${targetCurrency}. "${discountCode}" would only be worth ${calculatedDiscount.toFixed(2)} ${targetCurrency}, so the existing discount was kept.`],
            userErrors: []
          }));
        }
        if (state.existingApplicationId && state.existingIsOurs) {
          await admin.graphql(`#graphql
            mutation RemoveDiscount($id: ID!, $discountApplicationId: ID!) {
              orderEditRemoveDiscount(id: $id, discountApplicationId: $discountApplicationId) {
                userErrors { field message }
              }
            }`, {
            variables: {
              id: calculatedOrderId,
              discountApplicationId: state.existingApplicationId
            }
          });
        }
      }
      const bxgyMeta = {
        code: resolved.code
      };
      const newTag = {
        checkoutAmount: 0,
        productAmount: calculatedDiscount,
        orderAmount: state.tag.orderAmount,
        label: resolved.label,
        bxgy: bxgyMeta
      };
      const combinedAmount = calculatedDiscount + state.tag.orderAmount;
      const perUnitAmount = Math.min(combinedAmount / targetActiveQty, targetUnit);
      let applyRes = await admin.graphql(`#graphql
        mutation ApplyBxgyDiscount($id: ID!, $lineItemId: ID!, $discount: OrderEditAppliedDiscountInput!) {
          orderEditAddLineItemDiscount(id: $id, lineItemId: $lineItemId, discount: $discount) {
            calculatedLineItem { id }
            userErrors { field message }
          }
        }`, {
        variables: {
          id: calculatedOrderId,
          lineItemId: targetItem.id,
          discount: {
            fixedValue: {
              amount: perUnitAmount.toFixed(2),
              currencyCode: targetCurrency
            },
            description: (resolved.code || resolved.label || discountCode).trim().slice(0, 40)
          }
        }
      });
      let applyJson = await applyRes.json();
      let applyErrors = ((_na = (_ma = applyJson.data) == null ? void 0 : _ma.orderEditAddLineItemDiscount) == null ? void 0 : _na.userErrors) ?? [];
      if (applyErrors.length) {
        const currencyMatch = (_pa = (_oa = applyErrors[0]) == null ? void 0 : _oa.message) == null ? void 0 : _pa.match(/must be in ([A-Z]{3})/i);
        if (currencyMatch) {
          const retryCurrency = currencyMatch[1].toUpperCase();
          applyRes = await admin.graphql(`#graphql
            mutation ApplyBxgyDiscountRetry($id: ID!, $lineItemId: ID!, $discount: OrderEditAppliedDiscountInput!) {
              orderEditAddLineItemDiscount(id: $id, lineItemId: $lineItemId, discount: $discount) {
                calculatedLineItem { id }
                userErrors { field message }
              }
            }`, {
            variables: {
              id: calculatedOrderId,
              lineItemId: targetItem.id,
              discount: {
                fixedValue: {
                  amount: perUnitAmount.toFixed(2),
                  currencyCode: retryCurrency
                },
                description: (resolved.code || resolved.label || discountCode).trim().slice(0, 40)
              }
            }
          });
          applyJson = await applyRes.json();
          applyErrors = ((_ra = (_qa = applyJson.data) == null ? void 0 : _qa.orderEditAddLineItemDiscount) == null ? void 0 : _ra.userErrors) ?? [];
        }
      }
      if (applyErrors.length) {
        return cors(Response.json({
          userErrors: applyErrors
        }, {
          status: 422
        }));
      }
      const commitRes2 = await admin.graphql(`#graphql
        mutation CommitEdit($id: ID!, $staffNote: String) {
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
        }`, {
        variables: {
          id: calculatedOrderId,
          staffNote: `Buy X Get Y discount "${discountCode}" applied via customer account`
        }
      });
      const commitJson2 = await commitRes2.json();
      const commitErrors2 = ((_ta = (_sa = commitJson2.data) == null ? void 0 : _sa.orderEditCommit) == null ? void 0 : _ta.userErrors) ?? [];
      if (commitErrors2.length) {
        return cors(Response.json({
          userErrors: commitErrors2
        }, {
          status: 422
        }));
      }
      await trackOrderEdit({
        shop: storeDomain,
        orderId,
        featureId: "apply-discount",
        source
      });
      return cors(Response.json({
        success: true,
        applied: true,
        order: commitJson2.data.orderEditCommit.order,
        appliedCount: 1,
        appliedProducts: [targetDisplayName],
        replacedCount: state.blocked || state.tag.productAmount > 0 ? 1 : 0,
        skippedProducts: [],
        discountLabel: resolved.label,
        warnings: [],
        userErrors: []
      }));
    }
    const targetLineItems = allLineItems.filter((item) => lineItemMatchesTargeting(item, resolved.targeting));
    if (targetLineItems.length === 0) {
      return cors(Response.json({
        userErrors: [{
          message: `No product eligible for discount code "${discountCode}" was found on this order.`
        }]
      }, {
        status: 422
      }));
    }
    if (resolved.minimumQuantity != null || resolved.minimumSubtotal != null) {
      let targetActiveQty = 0;
      let targetActiveSubtotal = 0;
      let targetCurrencyCode = "USD";
      for (const item of targetLineItems) {
        const qty = item.editableQuantity ?? item.quantity;
        const originalUnit = parseFloat(((_va = (_ua = item.originalUnitPriceSet) == null ? void 0 : _ua.shopMoney) == null ? void 0 : _va.amount) ?? "0");
        if ((_xa = (_wa = item.originalUnitPriceSet) == null ? void 0 : _wa.shopMoney) == null ? void 0 : _xa.currencyCode) {
          targetCurrencyCode = item.originalUnitPriceSet.shopMoney.currencyCode;
        }
        targetActiveQty += qty;
        targetActiveSubtotal += qty * originalUnit;
      }
      if (resolved.minimumQuantity != null && targetActiveQty < resolved.minimumQuantity) {
        return cors(Response.json({
          userErrors: [{
            message: `Discount code "${discountCode}" requires a minimum of ${resolved.minimumQuantity} eligible item(s) in the order.`
          }]
        }, {
          status: 422
        }));
      }
      if (resolved.minimumSubtotal != null && targetActiveSubtotal < resolved.minimumSubtotal.amount) {
        return cors(Response.json({
          userErrors: [{
            message: `Discount code "${discountCode}" requires a minimum subtotal of ${resolved.minimumSubtotal.amount.toFixed(2)} ${resolved.minimumSubtotal.currencyCode || targetCurrencyCode}.`
          }]
        }, {
          status: 422
        }));
      }
    }
    const warnings = [];
    const appliedProducts = [];
    const skippedProducts = [];
    let appliedCount = 0;
    let replacedCount = 0;
    let totalNewDiscount = 0;
    for (const item of targetLineItems) {
      const activeQty = item.editableQuantity ?? item.quantity;
      const originalUnit = parseFloat(((_za = (_ya = item.originalUnitPriceSet) == null ? void 0 : _ya.shopMoney) == null ? void 0 : _za.amount) ?? "0");
      const originalLineTotal = originalUnit * activeQty;
      const amount = discountAmountAgainst(resolved.kind === "percentage" ? {
        kind: "percentage",
        percentage: resolved.percentage
      } : {
        kind: "fixed",
        amount: resolved.amount
      }, originalLineTotal);
      totalNewDiscount = round2(totalNewDiscount + amount);
    }
    const targetItemIds = new Set(targetLineItems.map((i) => i.id));
    const existingDiscounts = collectExistingDiscounts(allLineItems);
    const incompatibleDiscounts = [];
    for (const existingApp of existingDiscounts.values()) {
      const allOnTargetItems = existingApp.lineItemIds.every((id) => targetItemIds.has(id));
      if (allOnTargetItems && existingApp.appliedTo === "LINE") {
        continue;
      }
      const existingCombinesWith = await getCombinesWithForExistingDiscount(admin, existingApp.codeOrLabel);
      const canCombine = canDiscountsCombine({
        type: "product",
        combinesWith: resolved.combinesWith
      }, {
        appliedTo: existingApp.appliedTo,
        combinesWith: existingCombinesWith
      });
      if (!canCombine) {
        incompatibleDiscounts.push(existingApp);
      }
    }
    if (incompatibleDiscounts.length > 0) {
      const totalIncompatibleAmount = round2(incompatibleDiscounts.reduce((sum, d) => sum + d.totalAmount, 0));
      const orderCurrency = ((_Ba = (_Aa = calculatedOrder.totalPriceSet) == null ? void 0 : _Aa.presentmentMoney) == null ? void 0 : _Ba.currencyCode) || ((_Ea = (_Da = (_Ca = targetLineItems[0]) == null ? void 0 : _Ca.originalUnitPriceSet) == null ? void 0 : _Da.presentmentMoney) == null ? void 0 : _Ea.currencyCode) || ((_Ha = (_Ga = (_Fa = targetLineItems[0]) == null ? void 0 : _Fa.originalUnitPriceSet) == null ? void 0 : _Ga.shopMoney) == null ? void 0 : _Ha.currencyCode) || "USD";
      if (totalIncompatibleAmount >= totalNewDiscount) {
        const incompNames = incompatibleDiscounts.map((d) => d.codeOrLabel || "existing discount").join(", ");
        return cors(Response.json({
          success: false,
          applied: false,
          appliedCount: 0,
          appliedProducts: [],
          skippedProducts: targetLineItems.map((i) => lineItemDisplayName(i)),
          discountLabel: resolved.label,
          warnings: [`Discount code "${discountCode}" cannot be combined with existing discount "${incompNames}". The existing discount (${totalIncompatibleAmount.toFixed(2)} ${orderCurrency}) was kept because it offers a higher discount than "${discountCode}" (${totalNewDiscount.toFixed(2)} ${orderCurrency}).`],
          userErrors: []
        }));
      }
      for (const incomp of incompatibleDiscounts) {
        const removeRes = await admin.graphql(`#graphql
          mutation RemoveIncompatibleDiscount($id: ID!, $discountApplicationId: ID!) {
            orderEditRemoveDiscount(id: $id, discountApplicationId: $discountApplicationId) {
              userErrors { field message }
            }
          }`, {
          variables: {
            id: calculatedOrderId,
            discountApplicationId: incomp.id
          }
        });
        const removeJson = await removeRes.json();
        const removeErrors = ((_Ja = (_Ia = removeJson.data) == null ? void 0 : _Ia.orderEditRemoveDiscount) == null ? void 0 : _Ja.userErrors) ?? [];
        if (((_Ka = removeJson.errors) == null ? void 0 : _Ka.length) || removeErrors.length) {
          const rawMsg = ((_La = removeErrors[0]) == null ? void 0 : _La.message) ?? ((_Na = (_Ma = removeJson.errors) == null ? void 0 : _Ma[0]) == null ? void 0 : _Na.message) ?? "unknown error";
          return cors(Response.json({
            userErrors: [{
              message: `Existing discount "${incomp.codeOrLabel}" cannot be combined with "${discountCode}" and could not be removed: ${rawMsg}`
            }]
          }, {
            status: 422
          }));
        }
      }
    }
    for (const item of targetLineItems) {
      const displayName = lineItemDisplayName(item);
      const state = readLineItemDiscountState(item);
      const activeQty = item.editableQuantity ?? item.quantity;
      const originalUnit = parseFloat(((_Pa = (_Oa = item.originalUnitPriceSet) == null ? void 0 : _Oa.presentmentMoney) == null ? void 0 : _Pa.amount) ?? ((_Ra = (_Qa = item.originalUnitPriceSet) == null ? void 0 : _Qa.shopMoney) == null ? void 0 : _Ra.amount) ?? "0");
      const originalLineTotal = originalUnit * activeQty;
      const currencyCode = ((_Ta = (_Sa = calculatedOrder.totalPriceSet) == null ? void 0 : _Sa.presentmentMoney) == null ? void 0 : _Ta.currencyCode) || ((_Va = (_Ua = item.originalUnitPriceSet) == null ? void 0 : _Ua.presentmentMoney) == null ? void 0 : _Va.currencyCode) || state.currencyCode || ((_Xa = (_Wa = item.originalUnitPriceSet) == null ? void 0 : _Wa.shopMoney) == null ? void 0 : _Xa.currencyCode) || "USD";
      const newProductAmount = discountAmountAgainst(resolved.kind === "percentage" ? {
        kind: "percentage",
        percentage: resolved.percentage
      } : {
        kind: "fixed",
        amount: resolved.amount
      }, originalLineTotal);
      if (state.blocked) {
        const existingAmount = state.tag.checkoutAmount;
        if (newProductAmount <= existingAmount) {
          warnings.push(`"${displayName}" already has a checkout discount worth ${existingAmount.toFixed(2)} ${currencyCode}. "${discountCode}" would only be worth ${newProductAmount.toFixed(2)} ${currencyCode}, so the existing discount was kept.`);
          skippedProducts.push(displayName);
          continue;
        }
        if (state.existingApplicationId) {
          const removeRes = await admin.graphql(`#graphql
            mutation RemoveDiscount($id: ID!, $discountApplicationId: ID!) {
              orderEditRemoveDiscount(id: $id, discountApplicationId: $discountApplicationId) {
                userErrors { field message }
              }
            }`, {
            variables: {
              id: calculatedOrderId,
              discountApplicationId: state.existingApplicationId
            }
          });
          const removeJson = await removeRes.json();
          const removeErrors = ((_Za = (_Ya = removeJson.data) == null ? void 0 : _Ya.orderEditRemoveDiscount) == null ? void 0 : _Za.userErrors) ?? [];
          if (((__a = removeJson.errors) == null ? void 0 : __a.length) || removeErrors.length) {
            warnings.push(`"${displayName}" already has a discount that was applied during checkout and cannot be replaced or removed.`);
            skippedProducts.push(displayName);
            continue;
          }
        }
      } else {
        if (state.tag.productAmount > 0 && newProductAmount <= state.tag.productAmount) {
          const existingLabel = state.tag.label ? `"${state.tag.label}"` : "The existing discount";
          warnings.push(`"${displayName}" already has ${existingLabel} applied, worth ${state.tag.productAmount.toFixed(2)} ${currencyCode}. "${discountCode}" would only be worth ${newProductAmount.toFixed(2)} ${currencyCode} on this product, so the existing discount was kept.`);
          skippedProducts.push(displayName);
          continue;
        }
        if (state.existingApplicationId && state.existingIsOurs) {
          const removeRes = await admin.graphql(`#graphql
            mutation RemoveDiscount($id: ID!, $discountApplicationId: ID!) {
              orderEditRemoveDiscount(id: $id, discountApplicationId: $discountApplicationId) {
                userErrors { field message }
              }
            }`, {
            variables: {
              id: calculatedOrderId,
              discountApplicationId: state.existingApplicationId
            }
          });
          const removeJson = await removeRes.json();
          const removeErrors = ((_ab = (_$a = removeJson.data) == null ? void 0 : _$a.orderEditRemoveDiscount) == null ? void 0 : _ab.userErrors) ?? [];
          if (((_bb = removeJson.errors) == null ? void 0 : _bb.length) || removeErrors.length) {
            const rawMessage = ((_cb = removeErrors[0]) == null ? void 0 : _cb.message) ?? ((_eb = (_db = removeJson.errors) == null ? void 0 : _db[0]) == null ? void 0 : _eb.message) ?? "unknown error";
            warnings.push(`Could not update the discount on "${displayName}": ${rawMessage}.`);
            skippedProducts.push(displayName);
            continue;
          }
        }
      }
      const wasReplacement = state.blocked || state.tag.productAmount > 0;
      const newTag = {
        checkoutAmount: state.blocked ? 0 : state.tag.checkoutAmount,
        productAmount: newProductAmount,
        orderAmount: state.tag.orderAmount,
        label: resolved.label
      };
      const combinedAmount = newProductAmount + state.tag.orderAmount;
      const perUnitAmount = Math.min(combinedAmount / activeQty, originalUnit);
      if (perUnitAmount <= 0) {
        warnings.push(`Could not apply the discount to "${displayName}": discount amount must be greater than 0.`);
        skippedProducts.push(displayName);
        continue;
      }
      let applyRes = await admin.graphql(`#graphql
        mutation ApplyDiscount($id: ID!, $lineItemId: ID!, $discount: OrderEditAppliedDiscountInput!) {
          orderEditAddLineItemDiscount(id: $id, lineItemId: $lineItemId, discount: $discount) {
            calculatedLineItem { id }
            userErrors { field message }
          }
        }`, {
        variables: {
          id: calculatedOrderId,
          lineItemId: item.id,
          discount: {
            fixedValue: {
              amount: perUnitAmount.toFixed(2),
              currencyCode
            },
            description: (resolved.label || discountCode).trim().slice(0, 40)
          }
        }
      });
      let applyJson = await applyRes.json();
      let applyErrors = ((_gb = (_fb = applyJson.data) == null ? void 0 : _fb.orderEditAddLineItemDiscount) == null ? void 0 : _gb.userErrors) ?? [];
      if (applyErrors.length) {
        const currencyMatch = (_ib = (_hb = applyErrors[0]) == null ? void 0 : _hb.message) == null ? void 0 : _ib.match(/must be in ([A-Z]{3})/i);
        if (currencyMatch) {
          const retryCurrency = currencyMatch[1].toUpperCase();
          applyRes = await admin.graphql(`#graphql
            mutation ApplyDiscountRetry($id: ID!, $lineItemId: ID!, $discount: OrderEditAppliedDiscountInput!) {
              orderEditAddLineItemDiscount(id: $id, lineItemId: $lineItemId, discount: $discount) {
                calculatedLineItem { id }
                userErrors { field message }
              }
            }`, {
            variables: {
              id: calculatedOrderId,
              lineItemId: item.id,
              discount: {
                fixedValue: {
                  amount: perUnitAmount.toFixed(2),
                  currencyCode: retryCurrency
                },
                description: (resolved.label || discountCode).trim().slice(0, 40)
              }
            }
          });
          applyJson = await applyRes.json();
          applyErrors = ((_kb = (_jb = applyJson.data) == null ? void 0 : _jb.orderEditAddLineItemDiscount) == null ? void 0 : _kb.userErrors) ?? [];
        }
      }
      if (((_lb = applyJson.errors) == null ? void 0 : _lb.length) || applyErrors.length) {
        const rawMessage = ((_nb = (_mb = applyJson.errors) == null ? void 0 : _mb[0]) == null ? void 0 : _nb.message) ?? ((_ob = applyErrors[0]) == null ? void 0 : _ob.message) ?? "unknown error";
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
      return cors(Response.json({
        success: false,
        applied: false,
        appliedCount: 0,
        appliedProducts: [],
        skippedProducts: uniqueSkippedProducts,
        discountLabel: resolved.label,
        warnings: uniqueWarnings.length ? uniqueWarnings : ["No eligible products found for this discount code."],
        userErrors: []
      }));
    }
    const commitRes = await admin.graphql(`#graphql
      mutation CommitEdit($id: ID!, $staffNote: String) {
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
      }`, {
      variables: {
        id: calculatedOrderId,
        staffNote: `Product discount "${discountCode}" applied via customer account`
      }
    });
    const commitJson = await commitRes.json();
    const commitErrors = ((_qb = (_pb = commitJson.data) == null ? void 0 : _pb.orderEditCommit) == null ? void 0 : _qb.userErrors) ?? [];
    if (commitErrors.length) {
      return cors(Response.json({
        userErrors: commitErrors
      }, {
        status: 422
      }));
    }
    await trackOrderEdit({
      shop: storeDomain,
      orderId,
      featureId: "apply-discount",
      source
    });
    return cors(Response.json({
      success: true,
      applied: true,
      order: commitJson.data.orderEditCommit.order,
      appliedCount,
      appliedProducts: uniqueAppliedProducts,
      replacedCount,
      skippedProducts: uniqueSkippedProducts,
      discountLabel: resolved.label,
      warnings: uniqueWarnings,
      userErrors: []
    }));
  } catch (err) {
    console.error("[order-discount8] Unexpected error:", err);
    const message = err instanceof Error ? err.message : "Internal server error";
    return cors(Response.json({
      userErrors: [{
        message
      }]
    }, {
      status: 500
    }));
  }
}
const route14 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$9,
  loader: loader$f
}, Symbol.toStringTag, { value: "Module" }));
const LINK_TTL_MS = 5 * 60 * 1e3;
function getSecret() {
  const secret = process.env.SHOPIFY_API_SECRET;
  if (!secret) {
    throw new Error("SHOPIFY_API_SECRET is not configured");
  }
  return secret;
}
function sign(payload) {
  return crypto.createHmac("sha256", getSecret()).update(payload).digest("hex");
}
function buildSignedInvoiceUrl(appUrl, params) {
  const expires = Date.now() + LINK_TTL_MS;
  const payload = `${params.shop}|${params.orderId}|${params.customerId}|${expires}`;
  const signature = sign(payload);
  const url = new URL("/public/invoice-link", appUrl);
  url.searchParams.set("shop", params.shop);
  url.searchParams.set("orderId", params.orderId);
  url.searchParams.set("customerId", params.customerId);
  url.searchParams.set("expires", String(expires));
  url.searchParams.set("signature", signature);
  return url.toString();
}
function verifySignedInvoiceUrl(searchParams) {
  const shop = searchParams.get("shop");
  const orderId = searchParams.get("orderId");
  const customerId = searchParams.get("customerId");
  const expiresRaw = searchParams.get("expires");
  const signature = searchParams.get("signature");
  if (!shop || !orderId || !customerId || !expiresRaw || !signature) {
    return null;
  }
  const expires = Number(expiresRaw);
  if (!Number.isFinite(expires) || Date.now() > expires) {
    return null;
  }
  const payload = `${shop}|${orderId}|${customerId}|${expires}`;
  const expectedSignature = sign(payload);
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) {
    return null;
  }
  return { shop, orderId, customerId, expires };
}
const ORDER_INVOICE_QUERY = `#graphql
  query getOrderInvoice($id: ID!) {
    order(id: $id) {
      id
      name
      createdAt
      email
      currencyCode
      presentmentCurrencyCode
      tags
      discountCodes
      metafield(namespace: "orderease", key: "free_shipping_code") {
        value
      }
      discountApplications(first: 20) {
        nodes {
          targetType
          targetSelection
          allocationMethod
          ... on DiscountCodeApplication {
            code
          }
          ... on ManualDiscountApplication {
            title
            description
          }
          ... on ScriptDiscountApplication {
            title
          }
          ... on AutomaticDiscountApplication {
            title
          }
        }
      }
      customer {
        id
        firstName
        lastName
        email
      }
      billingAddress {
        name
        address1
        address2
        city
        province
        zip
        country
        phone
      }
      shippingAddress {
        name
        address1
        address2
        city
        province
        zip
        country
        phone
      }
      lineItems(first: 100) {
        edges {
          node {
            name
            quantity
            currentQuantity
            originalUnitPriceSet {
              presentmentMoney { amount currencyCode }
              shopMoney { amount currencyCode }
            }
            originalTotalSet {
              presentmentMoney { amount currencyCode }
              shopMoney { amount currencyCode }
            }
            discountedUnitPriceSet {
              presentmentMoney { amount currencyCode }
              shopMoney { amount currencyCode }
            }
            discountedTotalSet {
              presentmentMoney { amount currencyCode }
              shopMoney { amount currencyCode }
            }
            totalDiscountSet {
              presentmentMoney { amount currencyCode }
              shopMoney { amount currencyCode }
            }
            discountAllocations {
              allocatedAmountSet {
                presentmentMoney { amount currencyCode }
                shopMoney { amount currencyCode }
              }
              discountApplication {
                targetType
                targetSelection
                allocationMethod
                ... on DiscountCodeApplication {
                  code
                }
                ... on ManualDiscountApplication {
                  title
                  description
                }
                ... on ScriptDiscountApplication {
                  title
                }
                ... on AutomaticDiscountApplication {
                  title
                }
              }
            }
          }
        }
      }
      currentSubtotalPriceSet {
        presentmentMoney { amount currencyCode }
        shopMoney { amount currencyCode }
      }
      currentShippingPriceSet {
        presentmentMoney { amount currencyCode }
        shopMoney { amount currencyCode }
      }
      totalShippingPriceSet {
        presentmentMoney { amount currencyCode }
        shopMoney { amount currencyCode }
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
        currentDiscountedPriceSet {
          presentmentMoney { amount currencyCode }
          shopMoney { amount currencyCode }
        }
        discountAllocations {
          allocatedAmountSet {
            presentmentMoney { amount currencyCode }
            shopMoney { amount currencyCode }
          }
          discountApplication {
            targetType
            targetSelection
            allocationMethod
            ... on DiscountCodeApplication {
              code
            }
            ... on ManualDiscountApplication {
              title
              description
            }
            ... on ScriptDiscountApplication {
              title
            }
            ... on AutomaticDiscountApplication {
              title
            }
          }
        }
      }
      shippingLines(first: 5) {
        nodes {
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
          currentDiscountedPriceSet {
            presentmentMoney { amount currencyCode }
            shopMoney { amount currencyCode }
          }
          discountAllocations {
            allocatedAmountSet {
              presentmentMoney { amount currencyCode }
              shopMoney { amount currencyCode }
            }
            discountApplication {
              targetType
              targetSelection
              allocationMethod
              ... on DiscountCodeApplication {
                code
              }
              ... on ManualDiscountApplication {
                title
                description
              }
              ... on ScriptDiscountApplication {
                title
              }
              ... on AutomaticDiscountApplication {
                title
              }
            }
          }
        }
      }
      currentTotalTaxSet {
        presentmentMoney { amount currencyCode }
        shopMoney { amount currencyCode }
      }
      currentTotalDiscountsSet {
        presentmentMoney { amount currencyCode }
        shopMoney { amount currencyCode }
      }
      currentTotalPriceSet {
        presentmentMoney { amount currencyCode }
        shopMoney { amount currencyCode }
      }
      totalReceivedSet {
        presentmentMoney { amount currencyCode }
        shopMoney { amount currencyCode }
      }
      totalOutstandingSet {
        presentmentMoney { amount currencyCode }
        shopMoney { amount currencyCode }
      }
    }
  }
`;
function getMoney(set, fallbackCurrency = "USD") {
  if (!set) return { amount: "0.00", currencyCode: fallbackCurrency };
  const m = set.presentmentMoney || set.shopMoney;
  if (!m) return { amount: "0.00", currencyCode: fallbackCurrency };
  return {
    amount: m.amount || "0.00",
    currencyCode: m.currencyCode || fallbackCurrency
  };
}
function formatMoney(money, fallbackCurrency) {
  if (!money) return "";
  const amount = Number(money.amount || 0).toFixed(2);
  return `${amount} ${money.currencyCode || fallbackCurrency}`.trim();
}
function cleanDiscountTitle(raw) {
  if (!raw) return "";
  let cleaned = raw.replace(/\{@d\d+:[^}]*\}/gi, "").replace(/@d\d+:\s*/gi, "").replace(/\{[^}]*\}/g, "").replace(/^Discount\s+/gi, "").trim();
  return cleaned || raw.trim();
}
function formatAddress(address, excludeName) {
  if (!address) return [];
  const lines = [];
  if (address.name && address.name.trim().toLowerCase() !== (excludeName == null ? void 0 : excludeName.trim().toLowerCase())) {
    lines.push(address.name);
  }
  if (address.address1) lines.push(address.address1);
  if (address.address2) lines.push(address.address2);
  const cityLine = [address.city, address.province, address.zip].filter(Boolean).join(", ");
  if (cityLine) lines.push(cityLine);
  if (address.country) lines.push(address.country);
  if (address.phone) lines.push(`Phone: ${address.phone}`);
  return lines;
}
function formatShippingLabel(shippingTitle, freeShippingCode, isZero) {
  let baseTitle = (shippingTitle || "").replace(/\s*\(Already Applied\)/gi, "").replace(/\s*\(Free(?:\s*-\s*[^)]+)?\)/gi, "").replace(/\s*\(Free\)/gi, "").trim();
  if (!baseTitle) baseTitle = "Delivery";
  if (freeShippingCode) {
    return `Shipping (${baseTitle} - Free - ${freeShippingCode})`;
  }
  if (isZero || /\bfree\b/i.test(shippingTitle || "")) {
    return `Shipping (${baseTitle} - Free)`;
  }
  return `Shipping (${baseTitle})`;
}
function extractFreeShippingCode(order) {
  var _a2, _b, _c, _d, _e, _f;
  if ((_b = (_a2 = order.metafield) == null ? void 0 : _a2.value) == null ? void 0 : _b.trim()) {
    return order.metafield.value.trim();
  }
  if (Array.isArray(order.tags)) {
    for (const tag of order.tags) {
      const match = tag.match(/^free-shipping:(.+)$/i);
      if (match) return match[1].trim();
    }
  }
  const shippingLine = order.shippingLine || ((_d = (_c = order.shippingLines) == null ? void 0 : _c.nodes) == null ? void 0 : _d[0]);
  const title = (shippingLine == null ? void 0 : shippingLine.title) || "";
  const titleMatch = title.match(/\(Free\s*-\s*([^)]+)\)/i) || title.match(/Free Shipping\s*\(([^)]+)\)/i);
  if (titleMatch) {
    return titleMatch[1].trim();
  }
  const allocs = (shippingLine == null ? void 0 : shippingLine.discountAllocations) || [];
  for (const alloc of allocs) {
    if ((_e = alloc.discountApplication) == null ? void 0 : _e.code) {
      return alloc.discountApplication.code;
    }
  }
  const orderApps = ((_f = order.discountApplications) == null ? void 0 : _f.nodes) || [];
  for (const app2 of orderApps) {
    if (app2.targetType === "SHIPPING" && app2.code) {
      return app2.code;
    }
  }
  const dCodes = order.discountCodes || [];
  if (dCodes.length > 0) {
    for (const code of dCodes) {
      if (/ship/i.test(code) || /free/i.test(code)) {
        return code;
      }
    }
    if (/\bfree\b/i.test(title)) {
      return dCodes[0];
    }
  }
  return null;
}
function generateInvoicePdf(order) {
  return new Promise((resolve, reject) => {
    var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u, _v, _w, _x;
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks = [];
      doc.on("data", (chunk) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);
      const currency = order.presentmentCurrencyCode || ((_b = (_a2 = order.currentTotalPriceSet) == null ? void 0 : _a2.presentmentMoney) == null ? void 0 : _b.currencyCode) || order.currencyCode || "USD";
      const orderDate = order.createdAt ? new Date(order.createdAt).toLocaleDateString(void 0, {
        year: "numeric",
        month: "long",
        day: "numeric"
      }) : "";
      const freeShippingCode = extractFreeShippingCode(order);
      const shippingLine = order.shippingLine || ((_d = (_c = order.shippingLines) == null ? void 0 : _c.nodes) == null ? void 0 : _d[0]);
      const shippingTitle = (shippingLine == null ? void 0 : shippingLine.title) || "";
      doc.fontSize(22).font("Helvetica-Bold").text("Invoice", { align: "left" });
      doc.moveDown(0.5);
      doc.fontSize(10.5).font("Helvetica").text(`Order: ${order.name}`).text(orderDate ? `Date: ${orderDate}` : "");
      const allDiscounts = Array.from(
        /* @__PURE__ */ new Set([
          ...order.discountCodes || [],
          ...freeShippingCode ? [freeShippingCode] : []
        ])
      ).filter(Boolean);
      if (allDiscounts.length > 0) {
        doc.text(`Discount: ${allDiscounts.join(", ")}`);
      }
      if (shippingTitle) {
        doc.text(`Shipping Method: ${shippingTitle}`);
      }
      doc.moveDown(0.8);
      const customerName = [(_e = order.customer) == null ? void 0 : _e.firstName, (_f = order.customer) == null ? void 0 : _f.lastName].filter(Boolean).join(" ");
      const customerEmail = ((_g = order.customer) == null ? void 0 : _g.email) || order.email || "";
      const billingLines = formatAddress(order.billingAddress, customerName);
      const recipientName = ((_h = order.shippingAddress) == null ? void 0 : _h.name) || customerName;
      const shippingLines = formatAddress(order.shippingAddress, recipientName);
      const infoTop = doc.y;
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000").text("Billed To", 50, infoTop);
      doc.font("Helvetica").fontSize(9);
      let billedY = infoTop + 15;
      if (customerName) {
        doc.text(customerName, 50, billedY, { width: 230 });
        billedY = Math.max(billedY + 13, doc.y + 2.5);
      }
      if (customerEmail) {
        doc.text(customerEmail, 50, billedY, { width: 230 });
        billedY = Math.max(billedY + 13, doc.y + 2.5);
      }
      for (const line of billingLines) {
        doc.text(line, 50, billedY, { width: 230 });
        billedY = Math.max(billedY + 13, doc.y + 2.5);
      }
      doc.font("Helvetica-Bold").fontSize(10).fillColor("#000000").text("Shipped To", 295, infoTop);
      doc.font("Helvetica").fontSize(9);
      let shippedY = infoTop + 15;
      if (recipientName) {
        doc.text(recipientName, 295, shippedY, { width: 250 });
        shippedY = Math.max(shippedY + 13, doc.y + 2.5);
      }
      if (order.shippingAddress) {
        for (const line of shippingLines) {
          doc.text(line, 295, shippedY, { width: 250 });
          shippedY = Math.max(shippedY + 13, doc.y + 2.5);
        }
      } else if (billingLines.length > 0) {
        doc.text("Same as billing address", 295, shippedY, { width: 250 });
        shippedY = Math.max(shippedY + 13, doc.y + 2.5);
      }
      if (shippingTitle) {
        doc.font("Helvetica-Bold").text("Method: ", 295, shippedY, { continued: true, width: 250 }).font("Helvetica").text(shippingTitle);
        shippedY = Math.max(shippedY + 13, doc.y + 2.5);
      }
      doc.y = Math.max(billedY, shippedY) + 12;
      doc.moveDown(0.5);
      const col = {
        name: 50,
        // width: 145
        qty: 200,
        // width: 30
        origPrice: 235,
        // width: 60
        discount: 300,
        // width: 105
        netPrice: 410,
        // width: 65
        total: 480
        // width: 65
      };
      const drawTableHeader = (y) => {
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000");
        doc.text("Item", col.name, y);
        doc.text("Qty", col.qty, y, { width: 30, align: "center" });
        doc.text("Orig. Price", col.origPrice, y, { width: 60, align: "right" });
        doc.text("Discount", col.discount, y, { width: 105, align: "right" });
        doc.text("Net Price", col.netPrice, y, { width: 65, align: "right" });
        doc.text("Total", col.total, y, { width: 65, align: "right" });
        doc.moveTo(50, y + 14).lineTo(545, y + 14).strokeColor("#cccccc").stroke();
      };
      const tableTop = doc.y;
      drawTableHeader(tableTop);
      let rowY = tableTop + 22;
      const items = (((_i = order.lineItems) == null ? void 0 : _i.edges) ?? []).filter(
        ({ node }) => node.currentQuantity > 0
      );
      for (const { node } of items) {
        const qty = node.currentQuantity;
        const origUnitMoney = getMoney(node.originalUnitPriceSet, currency);
        const origUnitAmt = Number(origUnitMoney.amount || 0);
        const activeAllocations = (node.discountAllocations || []).filter(
          (alloc) => Number(getMoney(alloc.allocatedAmountSet, currency).amount || 0) > 1e-3
        );
        const targetAllocations = activeAllocations.length > 0 ? activeAllocations : node.discountAllocations || [];
        const discountCodes = Array.from(
          new Set(
            targetAllocations.map((alloc) => {
              const app2 = alloc.discountApplication;
              if (!app2) return "";
              if (app2.code) return app2.code;
              return cleanDiscountTitle(app2.title) || cleanDiscountTitle(app2.description);
            }).filter(Boolean)
          )
        );
        const discountNameStr = discountCodes.length > 0 ? discountCodes.join(", ") : "";
        let totalDiscountAmt = 0;
        if (((_j = node.totalDiscountSet) == null ? void 0 : _j.presentmentMoney) || ((_k = node.totalDiscountSet) == null ? void 0 : _k.shopMoney)) {
          totalDiscountAmt = Number(getMoney(node.totalDiscountSet, currency).amount || 0);
        } else if (node.discountAllocations && node.discountAllocations.length > 0) {
          totalDiscountAmt = node.discountAllocations.reduce((sum, alloc) => {
            return sum + Number(getMoney(alloc.allocatedAmountSet, currency).amount || 0);
          }, 0);
        }
        let discUnitAmt = origUnitAmt;
        if (((_l = node.discountedUnitPriceSet) == null ? void 0 : _l.presentmentMoney) || ((_m = node.discountedUnitPriceSet) == null ? void 0 : _m.shopMoney)) {
          discUnitAmt = Number(getMoney(node.discountedUnitPriceSet, currency).amount || 0);
        } else if (totalDiscountAmt > 0 && qty > 0) {
          discUnitAmt = Math.max(0, origUnitAmt - totalDiscountAmt / qty);
        }
        if (totalDiscountAmt === 0 && origUnitAmt > discUnitAmt && qty > 0) {
          totalDiscountAmt = (origUnitAmt - discUnitAmt) * qty;
        }
        const unitDiscountAmt = Math.max(0, origUnitAmt - discUnitAmt);
        const hasDiscount = unitDiscountAmt > 1e-3 || totalDiscountAmt > 1e-3;
        let lineTotalAmt = discUnitAmt * qty;
        if (((_n = node.discountedTotalSet) == null ? void 0 : _n.presentmentMoney) || ((_o = node.discountedTotalSet) == null ? void 0 : _o.shopMoney)) {
          lineTotalAmt = Number(getMoney(node.discountedTotalSet, currency).amount || 0);
        }
        const origPriceStr = formatMoney(origUnitMoney, currency);
        const netPriceStr = formatMoney({ amount: discUnitAmt.toFixed(2), currencyCode: currency }, currency);
        const lineTotalStr = formatMoney({ amount: lineTotalAmt.toFixed(2), currencyCode: currency }, currency);
        const nameHeight = doc.heightOfString(node.name, { width: 145 });
        const discountCellHeight = hasDiscount ? qty > 1 ? 32 : 22 : 12;
        const totalRowHeight = Math.max(18, nameHeight, discountCellHeight) + 4;
        if (rowY + totalRowHeight > 730) {
          doc.addPage();
          rowY = 50;
          drawTableHeader(rowY);
          rowY += 22;
        }
        doc.font("Helvetica").fontSize(9).fillColor("#000000");
        doc.text(node.name, col.name, rowY, { width: 145 });
        doc.text(String(qty), col.qty, rowY, { width: 30, align: "center" });
        doc.text(origPriceStr, col.origPrice, rowY, { width: 60, align: "right" });
        if (hasDiscount) {
          const codeLabel = discountNameStr ? discountNameStr : "Discount";
          const unitDiscText = `-${formatMoney({ amount: unitDiscountAmt.toFixed(2), currencyCode: currency }, currency)} / unit`;
          const totalDiscText = `(-${formatMoney({ amount: totalDiscountAmt.toFixed(2), currencyCode: currency }, currency)} total)`;
          doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#000000");
          doc.text(codeLabel, col.discount, rowY, { width: 105, align: "right" });
          doc.font("Helvetica").fontSize(8).fillColor("#555555");
          doc.text(unitDiscText, col.discount, rowY + 11, { width: 105, align: "right" });
          if (qty > 1) {
            doc.text(totalDiscText, col.discount, rowY + 21, { width: 105, align: "right" });
          }
        } else {
          doc.font("Helvetica").fontSize(9).fillColor("#000000");
          doc.text("-", col.discount, rowY, { width: 105, align: "right" });
        }
        doc.font("Helvetica").fontSize(9).fillColor("#000000");
        doc.text(netPriceStr, col.netPrice, rowY, { width: 65, align: "right" });
        doc.text(lineTotalStr, col.total, rowY, { width: 65, align: "right" });
        rowY += totalRowHeight + 4;
      }
      doc.moveTo(50, rowY + 4).lineTo(545, rowY + 4).strokeColor("#cccccc").stroke();
      let totalsY = rowY + 16;
      const labelX = 295;
      const labelWidth = col.total - labelX - 10;
      const totalsRow = (label, value, bold = false, isDiscount = false, extraSpacingBelow = 0) => {
        if (!value) return;
        const valNum = Number(value.amount || 0);
        if (isDiscount && valNum <= 0) return;
        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor("#000000");
        const labelHeight = Math.ceil(doc.heightOfString(label, { width: labelWidth }));
        doc.text(label, labelX, totalsY, { width: labelWidth, align: "left" });
        const formattedVal = isDiscount ? `-${formatMoney(value, currency)}` : formatMoney(value, currency);
        doc.text(formattedVal, col.total, totalsY, { width: 65, align: "right" });
        const rowHeight = Math.max(16, labelHeight + 2);
        totalsY += rowHeight + extraSpacingBelow;
      };
      totalsRow("Subtotal", getMoney(order.currentSubtotalPriceSet, currency));
      const shippingAllocations = (shippingLine == null ? void 0 : shippingLine.discountAllocations) || [];
      const totalShippingDiscount = shippingAllocations.reduce((sum, alloc) => {
        return sum + Number(getMoney(alloc.allocatedAmountSet, currency).amount || 0);
      }, 0);
      const origShippingAmt = Number(
        getMoney(shippingLine == null ? void 0 : shippingLine.originalPriceSet, currency).amount || getMoney(order.totalShippingPriceSet, currency).amount || 0
      );
      let shippingMoney;
      if (((_p = order.currentShippingPriceSet) == null ? void 0 : _p.presentmentMoney) || ((_q = order.currentShippingPriceSet) == null ? void 0 : _q.shopMoney)) {
        shippingMoney = getMoney(order.currentShippingPriceSet, currency);
      } else if (((_r = shippingLine == null ? void 0 : shippingLine.currentDiscountedPriceSet) == null ? void 0 : _r.presentmentMoney) || ((_s = shippingLine == null ? void 0 : shippingLine.currentDiscountedPriceSet) == null ? void 0 : _s.shopMoney)) {
        shippingMoney = getMoney(shippingLine.currentDiscountedPriceSet, currency);
      } else if (((_t = shippingLine == null ? void 0 : shippingLine.discountedPriceSet) == null ? void 0 : _t.presentmentMoney) || ((_u = shippingLine == null ? void 0 : shippingLine.discountedPriceSet) == null ? void 0 : _u.shopMoney)) {
        shippingMoney = getMoney(shippingLine.discountedPriceSet, currency);
      } else if (totalShippingDiscount > 0) {
        shippingMoney = {
          amount: Math.max(0, origShippingAmt - totalShippingDiscount).toFixed(2),
          currencyCode: currency
        };
      } else {
        shippingMoney = getMoney(order.totalShippingPriceSet, currency);
      }
      if (freeShippingCode && (((_v = shippingLine == null ? void 0 : shippingLine.title) == null ? void 0 : _v.includes("Free")) || origShippingAmt > 0)) {
        shippingMoney = { amount: "0.00", currencyCode: currency };
      }
      const isZeroShipping = Number(shippingMoney.amount) === 0;
      const shippingLabel2 = formatShippingLabel(shippingTitle, freeShippingCode, isZeroShipping);
      totalsRow(shippingLabel2, shippingMoney, false, false, 5);
      if (((_w = order.currentTotalTaxSet) == null ? void 0 : _w.presentmentMoney) || ((_x = order.currentTotalTaxSet) == null ? void 0 : _x.shopMoney)) {
        totalsRow("Tax", getMoney(order.currentTotalTaxSet, currency));
      }
      const discSet = getMoney(order.currentTotalDiscountsSet, currency);
      if (Number(discSet.amount) > 0) {
        totalsRow("Total Discounts", discSet, false, true);
      }
      totalsRow("Total", getMoney(order.currentTotalPriceSet, currency), true, false, 4);
      if (freeShippingCode) {
        totalsY += 2;
        doc.font("Helvetica-Oblique").fontSize(8.5).fillColor("#2e7d32");
        doc.text(
          `* Free shipping discount code "${freeShippingCode}" applied`,
          labelX,
          totalsY,
          { width: col.total + 65 - labelX, align: "right" }
        );
        totalsY += 14;
      }
      const totalPriceAmt = Number(getMoney(order.currentTotalPriceSet, currency).amount || 0);
      const paidMoney = getMoney(order.totalReceivedSet, currency);
      const paidAmt = Number(paidMoney.amount || 0);
      const remainingMoney = getMoney(order.totalOutstandingSet, currency);
      const outstandingAmt = Number(remainingMoney.amount || 0);
      totalsY += 6;
      totalsRow("Amount Paid", paidMoney);
      totalsRow("Remaining Amount", remainingMoney, outstandingAmt > 0);
      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}
async function loader$e({
  request
}) {
  var _a2, _b;
  const url = new URL(request.url);
  const verified = verifySignedInvoiceUrl(url.searchParams);
  if (!verified) {
    return new Response("This invoice link is invalid or has expired.", {
      status: 403,
      headers: {
        "Content-Type": "text/plain"
      }
    });
  }
  const {
    shop,
    orderId,
    customerId
  } = verified;
  if (!await isServiceEnabled(shop, "download-invoice")) {
    return new Response("Invoice download is not enabled by the merchant.", {
      status: 403,
      headers: {
        "Content-Type": "text/plain"
      }
    });
  }
  try {
    const {
      admin
    } = await unauthenticated.admin(shop);
    const response = await admin.graphql(ORDER_INVOICE_QUERY, {
      variables: {
        id: orderId
      }
    });
    const json = await response.json();
    const order = (_a2 = json.data) == null ? void 0 : _a2.order;
    if (!order) {
      return new Response("Order not found.", {
        status: 404,
        headers: {
          "Content-Type": "text/plain"
        }
      });
    }
    const numericId = (gidOrId) => {
      var _a3;
      return (_a3 = gidOrId == null ? void 0 : gidOrId.match(/\d+$/)) == null ? void 0 : _a3[0];
    };
    if (!((_b = order.customer) == null ? void 0 : _b.id) || numericId(order.customer.id) !== numericId(customerId)) {
      return new Response("Not authorized to access this order.", {
        status: 403,
        headers: {
          "Content-Type": "text/plain"
        }
      });
    }
    const pdfBuffer = await generateInvoicePdf(order);
    const filename = `invoice-${order.name.replace(/[^a-zA-Z0-9-_]/g, "")}.pdf`;
    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        // "inline" lets the browser open/preview it in the new tab rather
        // than forcing a save dialog, matching the previous window.open UX.
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.length),
        "Cache-Control": "no-store"
      }
    });
  } catch (err) {
    console.error("[invoice-link] Unexpected error:", err);
    return new Response("Failed to generate invoice.", {
      status: 500,
      headers: {
        "Content-Type": "text/plain"
      }
    });
  }
}
const route15 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  loader: loader$e
}, Symbol.toStringTag, { value: "Module" }));
const action$8 = async ({
  request
}) => {
  const {
    shop,
    topic
  } = await authenticate.webhook(request);
  const normalizedTopic = topic.toUpperCase().replace(/\//g, "_");
  if (normalizedTopic === "SHOP_REDACT") {
    const shopVariants = Array.from(/* @__PURE__ */ new Set([shop, shop.toLowerCase().trim()]));
    const shopFilter = {
      where: {
        shop: {
          in: shopVariants
        }
      }
    };
    await prisma.$transaction([prisma.session.deleteMany(shopFilter), prisma.serviceSettings.deleteMany(shopFilter), prisma.orderEditTimeLimit.deleteMany(shopFilter), prisma.googlePlacesConfig.deleteMany(shopFilter), prisma.editedOrder.deleteMany(shopFilter), prisma.featureUsage.deleteMany(shopFilter)]);
    return new Response(null, {
      status: 200
    });
  }
  if (normalizedTopic === "CUSTOMERS_DATA_REQUEST" || normalizedTopic === "CUSTOMERS_REDACT") {
    return new Response(null, {
      status: 200
    });
  }
  return new Response(null, {
    status: 400
  });
};
const route16 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$8
}, Symbol.toStringTag, { value: "Module" }));
async function loader$d({
  request
}) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s;
  const {
    sessionToken,
    cors
  } = await authenticate.public.customerAccount(request);
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");
  if (!orderId) {
    return cors(Response.json({
      error: "Missing orderId"
    }, {
      status: 400
    }));
  }
  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  if (!await isServiceEnabled(storeDomain, "change-shipping-method")) {
    return cors(Response.json({
      error: "This feature is not enabled by the merchant."
    }, {
      status: 403
    }));
  }
  const {
    admin,
    session
  } = await unauthenticated.admin(storeDomain);
  try {
    const res = await admin.graphql(`#graphql
      query getOrderShippingMethod($id: ID!) {
        order(id: $id) {
          id
          customer {
            id
          }
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
      }`, {
      variables: {
        id: orderId
      }
    });
    const json = await res.json();
    const order = (_a2 = json.data) == null ? void 0 : _a2.order;
    if (!order) {
      return cors(Response.json({
        error: "Order not found"
      }, {
        status: 404
      }));
    }
    if (!isCustomerAuthorized((_b = order.customer) == null ? void 0 : _b.id, sessionToken.sub)) {
      return cors(Response.json({
        error: "Unauthorized access to order."
      }, {
        status: 403
      }));
    }
    const shippingLine = (order == null ? void 0 : order.shippingLine) ?? null;
    const freeShippingInfo = await detectActiveFreeShipping(admin, order);
    const activeCurrency = ((_d = (_c = shippingLine == null ? void 0 : shippingLine.originalPriceSet) == null ? void 0 : _c.presentmentMoney) == null ? void 0 : _d.currencyCode) || (order == null ? void 0 : order.presentmentCurrencyCode) || (order == null ? void 0 : order.currencyCode) || "USD";
    const currentShipping = shippingLine ? {
      title: shippingLine.title,
      code: shippingLine.code,
      amount: freeShippingInfo.hasFreeShipping ? "0.00" : ((_f = (_e = shippingLine.discountedPriceSet) == null ? void 0 : _e.presentmentMoney) == null ? void 0 : _f.amount) || ((_h = (_g = shippingLine.originalPriceSet) == null ? void 0 : _g.presentmentMoney) == null ? void 0 : _h.amount) || "0.00",
      currencyCode: activeCurrency
    } : null;
    let availableMethods = [];
    const orderCountry = ((_i = order == null ? void 0 : order.shippingAddress) == null ? void 0 : _i.countryCode) || null;
    const scoredMap = /* @__PURE__ */ new Map();
    try {
      const profilesRes = await admin.graphql(`#graphql
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
        }`);
      const profilesJson = await profilesRes.json();
      const profiles = ((_k = (_j = profilesJson.data) == null ? void 0 : _j.deliveryProfiles) == null ? void 0 : _k.nodes) || [];
      for (const profile of profiles) {
        const isCustomProfile = !profile.default;
        const groups = profile.profileLocationGroups || [];
        for (const group of groups) {
          const zones = ((_l = group.locationGroupZones) == null ? void 0 : _l.nodes) || [];
          for (const zoneNode of zones) {
            const zone = zoneNode.zone;
            const countries = (zone == null ? void 0 : zone.countries) || [];
            let isExactCountryMatch = false;
            let isRestOfWorldMatch = false;
            if (orderCountry) {
              for (const c of countries) {
                if (((_m = c.code) == null ? void 0 : _m.countryCode) === orderCountry) {
                  isExactCountryMatch = true;
                  break;
                }
                if ((_n = c.code) == null ? void 0 : _n.restOfWorld) {
                  isRestOfWorldMatch = true;
                }
              }
            }
            if (orderCountry && !isExactCountryMatch && !isRestOfWorldMatch) {
              continue;
            }
            let score = 5;
            if (isExactCountryMatch) {
              score = isCustomProfile ? 40 : 30;
            } else if (isRestOfWorldMatch) {
              score = isCustomProfile ? 20 : 10;
            }
            const defs = ((_o = zoneNode.methodDefinitions) == null ? void 0 : _o.nodes) || [];
            for (const def of defs) {
              const name = def.name;
              if (!name) continue;
              let price = 0;
              if (((_p = def.rateProvider) == null ? void 0 : _p.__typename) === "DeliveryRateDefinition" && ((_q = def.rateProvider.price) == null ? void 0 : _q.amount)) {
                price = parseFloat(def.rateProvider.price.amount);
              } else if (((_r = def.rateProvider) == null ? void 0 : _r.__typename) === "DeliveryParticipant" && ((_s = def.rateProvider.fixedFee) == null ? void 0 : _s.amount)) {
                price = parseFloat(def.rateProvider.fixedFee.amount);
              }
              const key = name.toLowerCase().trim();
              const existing = scoredMap.get(key);
              if (!existing || score > existing.score) {
                scoredMap.set(key, {
                  id: def.id || key,
                  title: name,
                  price,
                  score
                });
              }
            }
          }
        }
      }
    } catch (e) {
      console.warn("[order-shipping-loader] GraphQL deliveryProfiles fetch error:", e);
    }
    if (scoredMap.size === 0 && (session == null ? void 0 : session.accessToken)) {
      try {
        const restRes = await fetch(`https://${storeDomain}/admin/api/2026-04/shipping_zones.json`, {
          headers: {
            "X-Shopify-Access-Token": session.accessToken,
            "Content-Type": "application/json"
          }
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
                  score: 1
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
                  score: 1
                });
              }
            }
          }
        }
      } catch (restErr) {
        console.warn("[order-shipping-loader] REST shipping_zones fetch error:", restErr);
      }
    }
    availableMethods = Array.from(scoredMap.values()).map(({
      id,
      title,
      price
    }) => ({
      id,
      title,
      price
    }));
    if (freeShippingInfo.hasFreeShipping) {
      availableMethods = availableMethods.map((m) => {
        const qualifies = freeShippingInfo.maxPrice == null || m.price <= freeShippingInfo.maxPrice;
        if (qualifies) {
          return {
            ...m,
            originalPrice: m.price,
            price: 0,
            freeShippingApplied: true
          };
        }
        return m;
      });
    }
    return cors(Response.json({
      currentShipping,
      currencyCode: activeCurrency,
      availableMethods,
      hasFreeShipping: freeShippingInfo.hasFreeShipping,
      activeFreeShippingCode: freeShippingInfo.code
    }));
  } catch (err) {
    console.error("[order-shipping-loader] Error:", err);
    return cors(Response.json({
      currentShipping: null,
      currencyCode: "INR",
      availableMethods: []
    }));
  }
}
async function action$7({
  request
}) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i, _j, _k, _l, _m, _n, _o, _p, _q, _r, _s, _t, _u;
  const {
    sessionToken,
    cors
  } = await authenticate.public.customerAccount(request);
  if (request.method === "OPTIONS") {
    return cors(new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }));
  }
  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  const customerAccountId = sessionToken.sub;
  const {
    admin
  } = await unauthenticated.admin(storeDomain);
  const body = await request.json();
  const {
    orderId,
    title,
    price,
    currencyCode = "USD"
  } = body;
  if (!orderId || !title || price === void 0 || price === null) {
    return cors(Response.json({
      userErrors: [{
        message: "Missing orderId, title, or price."
      }]
    }, {
      status: 400
    }));
  }
  const guard = await validateOrderEditable({
    admin,
    shop: storeDomain,
    orderId,
    customerAccountId,
    requiredServiceId: "change-shipping-method"
  });
  if (!guard.allowed) {
    return cors(Response.json({
      userErrors: [{
        message: guard.message
      }]
    }, {
      status: guard.status
    }));
  }
  const ownerRes = await admin.graphql(`#graphql
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
    }`, {
    variables: {
      id: orderId
    }
  });
  const ownerJson = await ownerRes.json();
  const order = (_a2 = ownerJson.data) == null ? void 0 : _a2.order;
  if (!order) {
    return cors(Response.json({
      userErrors: [{
        message: "Order not found."
      }]
    }, {
      status: 404
    }));
  }
  const numericId = (gidOrId) => {
    var _a3;
    return (_a3 = gidOrId == null ? void 0 : gidOrId.match(/\d+$/)) == null ? void 0 : _a3[0];
  };
  if (!((_b = order.customer) == null ? void 0 : _b.id) || numericId(order.customer.id) !== numericId(customerAccountId)) {
    return cors(Response.json({
      userErrors: [{
        message: "Not authorized to update this order."
      }]
    }, {
      status: 403
    }));
  }
  try {
    const freeShippingInfo = await detectActiveFreeShipping(admin, order);
    const numericPrice = typeof price === "number" ? price : parseFloat(String(price));
    const cleanTitle = (title || "").replace(/\s*\(Free(?:\s*-\s*[^)]+)?\)/gi, "").replace(/\s*\(Already Applied\)/gi, "").trim();
    let finalPrice = numericPrice;
    let finalTitle = cleanTitle;
    const qualifiesForFreeShipping = freeShippingInfo.hasFreeShipping && (freeShippingInfo.maxPrice == null || numericPrice <= freeShippingInfo.maxPrice);
    if (qualifiesForFreeShipping) {
      finalPrice = 0;
      finalTitle = freeShippingInfo.code ? `${cleanTitle} (Free - ${freeShippingInfo.code})` : `${cleanTitle} (Free)`;
    }
    const beginRes = await admin.graphql(`#graphql
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
      }`, {
      variables: {
        id: orderId
      }
    });
    const beginJson = await beginRes.json();
    const beginErrors = ((_d = (_c = beginJson.data) == null ? void 0 : _c.orderEditBegin) == null ? void 0 : _d.userErrors) ?? [];
    if (beginErrors.length) {
      return cors(Response.json({
        userErrors: beginErrors
      }, {
        status: 422
      }));
    }
    const calculatedOrder = beginJson.data.orderEditBegin.calculatedOrder;
    const calculatedOrderId = calculatedOrder.id;
    const existingLines = calculatedOrder.shippingLines ?? [];
    for (const line of existingLines) {
      const removeRes = await admin.graphql(`#graphql
        mutation OrderEditRemoveShippingLine($id: ID!, $shippingLineId: ID!) {
          orderEditRemoveShippingLine(id: $id, shippingLineId: $shippingLineId) {
            calculatedOrder { id }
            userErrors { field message }
          }
        }`, {
        variables: {
          id: calculatedOrderId,
          shippingLineId: line.id
        }
      });
      const removeJson = await removeRes.json();
      const removeErrors = ((_f = (_e = removeJson.data) == null ? void 0 : _e.orderEditRemoveShippingLine) == null ? void 0 : _f.userErrors) ?? [];
      if (removeErrors.length) {
        console.warn("[order-shipping] Warning removing line:", removeErrors);
      }
    }
    const targetCurrency = ((_h = (_g = calculatedOrder.totalPriceSet) == null ? void 0 : _g.presentmentMoney) == null ? void 0 : _h.currencyCode) || order.presentmentCurrencyCode || ((_k = (_j = (_i = order.shippingLine) == null ? void 0 : _i.originalPriceSet) == null ? void 0 : _j.presentmentMoney) == null ? void 0 : _k.currencyCode) || order.currencyCode || currencyCode || "USD";
    let addRes = await admin.graphql(`#graphql
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
      }`, {
      variables: {
        id: calculatedOrderId,
        shippingLine: {
          title: finalTitle,
          price: {
            amount: finalPrice,
            currencyCode: targetCurrency
          }
        }
      }
    });
    let addJson = await addRes.json();
    let addErrors = ((_m = (_l = addJson.data) == null ? void 0 : _l.orderEditAddShippingLine) == null ? void 0 : _m.userErrors) ?? [];
    if (addErrors.length) {
      const currencyMatch = (_o = (_n = addErrors[0]) == null ? void 0 : _n.message) == null ? void 0 : _o.match(/must be in ([A-Z]{3})/i);
      if (currencyMatch) {
        const retryCurrency = currencyMatch[1].toUpperCase();
        addRes = await admin.graphql(`#graphql
          mutation OrderEditAddShippingLineRetry($id: ID!, $shippingLine: OrderEditAddShippingLineInput!) {
            orderEditAddShippingLine(id: $id, shippingLine: $shippingLine) {
              calculatedOrder { id }
              userErrors { field message }
            }
          }`, {
          variables: {
            id: calculatedOrderId,
            shippingLine: {
              title: finalTitle,
              price: {
                amount: finalPrice,
                currencyCode: retryCurrency
              }
            }
          }
        });
        addJson = await addRes.json();
        addErrors = ((_q = (_p = addJson.data) == null ? void 0 : _p.orderEditAddShippingLine) == null ? void 0 : _q.userErrors) ?? [];
      }
    }
    if (addErrors.length) {
      return cors(Response.json({
        userErrors: addErrors
      }, {
        status: 422
      }));
    }
    const staffNote = qualifiesForFreeShipping && freeShippingInfo.code ? `Shipping method updated to ${cleanTitle} with free shipping discount (${freeShippingInfo.code})` : "Shipping method updated by customer via Customer Account UI";
    const commitRes = await admin.graphql(`#graphql
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
      }`, {
      variables: {
        id: calculatedOrderId,
        staffNote
      }
    });
    const commitJson = await commitRes.json();
    const commitErrors = ((_s = (_r = commitJson.data) == null ? void 0 : _r.orderEditCommit) == null ? void 0 : _s.userErrors) ?? [];
    if (commitErrors.length) {
      return cors(Response.json({
        userErrors: commitErrors
      }, {
        status: 422
      }));
    }
    const updatedOrder = commitJson.data.orderEditCommit.order;
    const balanceDue = ((_t = updatedOrder == null ? void 0 : updatedOrder.totalOutstandingSet) == null ? void 0 : _t.presentmentMoney) ?? ((_u = updatedOrder == null ? void 0 : updatedOrder.totalOutstandingSet) == null ? void 0 : _u.shopMoney) ?? null;
    const owesRefund = balanceDue ? parseFloat(balanceDue.amount) < 0 : false;
    if (qualifiesForFreeShipping && freeShippingInfo.code) {
      await persistFreeShippingCode(admin, orderId, freeShippingInfo.code);
    }
    const extraTags = qualifiesForFreeShipping && freeShippingInfo.code ? [`free-shipping:${freeShippingInfo.code.toLowerCase()}`] : [];
    await addOrderTags(admin, orderId, owesRefund, extraTags);
    const {
      source
    } = body || {};
    await trackOrderEdit({
      shop: storeDomain,
      orderId,
      featureId: "change-shipping-method",
      source
    });
    return cors(Response.json({
      order: updatedOrder,
      balanceDue,
      userErrors: []
    }));
  } catch (err) {
    console.error("[order-shipping] Unexpected error:", err);
    return cors(Response.json({
      userErrors: [{
        message: err instanceof Error ? err.message : "Internal error updating shipping method"
      }]
    }, {
      status: 500
    }));
  }
}
const route17 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$7,
  loader: loader$d
}, Symbol.toStringTag, { value: "Module" }));
async function loader$c({
  request
}) {
  var _a2, _b;
  const {
    sessionToken,
    cors
  } = await authenticate.public.customerAccount(request);
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");
  if (!orderId) {
    return cors(Response.json({
      error: "Missing orderId"
    }, {
      status: 400
    }));
  }
  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  if (!await isServiceEnabled(storeDomain, "change-address")) {
    return cors(Response.json({
      error: "This feature is not enabled by the merchant."
    }, {
      status: 403
    }));
  }
  const {
    admin
  } = await unauthenticated.admin(storeDomain);
  try {
    const res = await admin.graphql(`#graphql
      query getOrderAddresses($id: ID!) {
        order(id: $id) {
          customer {
            id
          }
          shippingAddress {
            firstName
            lastName
            address1
            address2
            city
            province
            zip
            countryCode
            country
            phone
          }
          billingAddress {
            firstName
            lastName
            address1
            address2
            city
            province
            zip
            countryCode
            country
            phone
          }
        }
      }`, {
      variables: {
        id: orderId
      }
    });
    const json = await res.json();
    const order = (_a2 = json.data) == null ? void 0 : _a2.order;
    if (!order) {
      return cors(Response.json({
        error: "Order not found"
      }, {
        status: 404
      }));
    }
    if (!isCustomerAuthorized((_b = order.customer) == null ? void 0 : _b.id, sessionToken.sub)) {
      return cors(Response.json({
        error: "Unauthorized access to order."
      }, {
        status: 403
      }));
    }
    const shippingAddress = order.shippingAddress ?? null;
    const billingAddress = order.billingAddress ?? null;
    return cors(Response.json({
      shippingAddress,
      billingAddress
    }));
  } catch (err) {
    return cors(Response.json({
      shippingAddress: null,
      billingAddress: null
    }));
  }
}
async function action$6({
  request
}) {
  var _a2, _b, _c, _d, _e, _f;
  const {
    sessionToken,
    cors
  } = await authenticate.public.customerAccount(request);
  if (request.method === "OPTIONS") {
    return cors(new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }));
  }
  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  const customerAccountId = sessionToken.sub;
  const {
    admin
  } = await unauthenticated.admin(storeDomain);
  const body = await request.json();
  const {
    orderId,
    addressType,
    address
  } = body;
  if (!orderId || !addressType || !address) {
    return cors(Response.json({
      userErrors: [{
        message: "Missing orderId, addressType, or address."
      }]
    }, {
      status: 400
    }));
  }
  const guard = await validateOrderEditable({
    admin,
    shop: storeDomain,
    orderId,
    customerAccountId,
    requiredServiceId: "change-address"
  });
  if (!guard.allowed) {
    return cors(Response.json({
      userErrors: [{
        message: guard.message
      }]
    }, {
      status: guard.status
    }));
  }
  if (!["shipping", "billing"].includes(addressType)) {
    return cors(Response.json({
      userErrors: [{
        message: "addressType must be 'shipping' or 'billing'."
      }]
    }, {
      status: 400
    }));
  }
  if (!address.address1 || !address.city || !address.countryCode) {
    return cors(Response.json({
      userErrors: [{
        message: "Address line 1, city, and country are required."
      }]
    }, {
      status: 400
    }));
  }
  const fieldsToCheck = [{
    name: "First name",
    value: address.firstName
  }, {
    name: "Last name",
    value: address.lastName
  }, {
    name: "Address line 1",
    value: address.address1
  }, {
    name: "Address line 2",
    value: address.address2
  }, {
    name: "City",
    value: address.city
  }, {
    name: "State / Province",
    value: address.province
  }, {
    name: "Postal / ZIP code",
    value: address.zip
  }, {
    name: "Phone",
    value: address.phone
  }];
  for (const f of fieldsToCheck) {
    if (f.value && String(f.value).trim().length > 50) {
      return cors(Response.json({
        userErrors: [{
          message: `${f.name} cannot exceed 50 characters.`
        }]
      }, {
        status: 400
      }));
    }
  }
  const ownerRes = await admin.graphql(`#graphql
    query getOrderOwner($id: ID!) {
      order(id: $id) {
        id
        customer { id }
        billingAddress {
          countryCode
          country
        }
        shippingAddress {
          countryCode
          country
        }
      }
    }`, {
    variables: {
      id: orderId
    }
  });
  const ownerJson = await ownerRes.json();
  const order = (_a2 = ownerJson.data) == null ? void 0 : _a2.order;
  if (!order) {
    return cors(Response.json({
      userErrors: [{
        message: "Order not found."
      }]
    }, {
      status: 404
    }));
  }
  const numericId = (gidOrId) => {
    var _a3;
    return (_a3 = gidOrId == null ? void 0 : gidOrId.match(/\d+$/)) == null ? void 0 : _a3[0];
  };
  if (!((_b = order.customer) == null ? void 0 : _b.id) || numericId(order.customer.id) !== numericId(customerAccountId)) {
    return cors(Response.json({
      userErrors: [{
        message: "Not authorized to update this order."
      }]
    }, {
      status: 403
    }));
  }
  const allowedCountryCode = ((_c = order.billingAddress) == null ? void 0 : _c.countryCode) || ((_d = order.shippingAddress) == null ? void 0 : _d.countryCode) || address.countryCode;
  const mailingAddress = {
    firstName: (address.firstName || "").slice(0, 50),
    lastName: (address.lastName || "").slice(0, 50),
    address1: (address.address1 || "").slice(0, 50),
    address2: (address.address2 || "").slice(0, 50),
    city: (address.city || "").slice(0, 50),
    province: (address.province || "").slice(0, 50),
    zip: (address.zip || "").slice(0, 50),
    countryCode: allowedCountryCode,
    phone: (address.phone || "").slice(0, 50)
  };
  const input = {
    id: orderId
  };
  if (addressType === "shipping") {
    input.shippingAddress = mailingAddress;
  } else {
    return cors(Response.json({
      userErrors: [{
        message: "Billing address cannot be updated directly on a placed order. Please contact support to update your billing address."
      }]
    }, {
      status: 422
    }));
  }
  try {
    const updateRes = await admin.graphql(`#graphql
      mutation orderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
            name
            statusPageUrl
            shippingAddress {
              firstName
              lastName
              address1
              address2
              city
              province
              zip
              country
              phone
            }
          }
          userErrors { field message }
        }
      }`, {
      variables: {
        input
      }
    });
    const updateJson = await updateRes.json();
    const errors = ((_f = (_e = updateJson.data) == null ? void 0 : _e.orderUpdate) == null ? void 0 : _f.userErrors) ?? [];
    if (errors.length) {
      return cors(Response.json({
        userErrors: errors
      }, {
        status: 422
      }));
    }
    await addOrderTags(admin, orderId);
    const {
      source
    } = body || {};
    await trackOrderEdit({
      shop: storeDomain,
      orderId,
      featureId: "change-address",
      source
    });
    return cors(Response.json({
      order: updateJson.data.orderUpdate.order,
      userErrors: []
    }));
  } catch (err) {
    console.error("[order-address] Unexpected error:", err);
    return cors(Response.json({
      userErrors: [{
        message: err instanceof Error ? err.message : "Internal error"
      }]
    }, {
      status: 500
    }));
  }
}
const route18 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$6,
  loader: loader$c
}, Symbol.toStringTag, { value: "Module" }));
function isValidEmail(email) {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;
  if (/\s/.test(trimmed)) return false;
  const parts = trimmed.split("@");
  if (parts.length !== 2) return false;
  const [localPart, domainPart] = parts;
  if (!localPart || !domainPart) return false;
  if (localPart.length > 64) return false;
  if (localPart.startsWith(".") || localPart.endsWith(".") || localPart.includes("..")) {
    return false;
  }
  const localRegex = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
  if (!localRegex.test(localPart)) {
    return false;
  }
  if (domainPart.startsWith(".") || domainPart.endsWith(".") || domainPart.includes("..")) {
    return false;
  }
  const domainLabels = domainPart.split(".");
  if (domainLabels.length < 2) {
    return false;
  }
  const tld = domainLabels[domainLabels.length - 1];
  if (!/^[a-zA-Z]{2,63}$/.test(tld)) {
    return false;
  }
  for (let i = 0; i < domainLabels.length - 1; i++) {
    const label = domainLabels[i];
    if (!label || label.length > 63) return false;
    if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label)) {
      return false;
    }
  }
  return true;
}
function isValidPhone(phone) {
  if (!phone || typeof phone !== "string") return false;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    return false;
  }
  return /^\+?[\d\s\-()]+$/.test(trimmed);
}
async function loader$b({
  request
}) {
  const {
    cors
  } = await authenticate.public.customerAccount(request);
  return cors(new Response(JSON.stringify({
    success: true
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  }));
}
async function action$5({
  request
}) {
  var _a2, _b, _c, _d, _e;
  const {
    sessionToken,
    cors
  } = await authenticate.public.customerAccount(request);
  if (request.method === "OPTIONS") {
    return cors(new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }));
  }
  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  const customerAccountId = sessionToken.sub;
  const {
    admin
  } = await unauthenticated.admin(storeDomain);
  const body = await request.json();
  const {
    orderId,
    email,
    phone
  } = body;
  if (!orderId) {
    return cors(Response.json({
      userErrors: [{
        message: "Missing orderId."
      }]
    }, {
      status: 400
    }));
  }
  const guard = await validateOrderEditable({
    admin,
    shop: storeDomain,
    orderId,
    customerAccountId,
    requiredServiceId: "contact-info"
  });
  if (!guard.allowed) {
    return cors(Response.json({
      userErrors: [{
        message: guard.message
      }]
    }, {
      status: guard.status
    }));
  }
  const emailStr = typeof email === "string" ? email.trim() : "";
  const phoneStr = typeof phone === "string" ? phone.trim() : "";
  if (!emailStr && !phoneStr) {
    return cors(Response.json({
      userErrors: [{
        message: "Provide at least one field to update (email or phone)."
      }]
    }, {
      status: 400
    }));
  }
  if (emailStr && !isValidEmail(emailStr)) {
    return cors(Response.json({
      userErrors: [{
        field: ["email"],
        message: "Please enter a valid email address format (e.g., name@example.com)."
      }]
    }, {
      status: 422
    }));
  }
  if (phoneStr && !isValidPhone(phoneStr)) {
    return cors(Response.json({
      userErrors: [{
        field: ["phone"],
        message: "Please enter a valid telephone number format (7–15 digits)."
      }]
    }, {
      status: 422
    }));
  }
  const ownerRes = await admin.graphql(`#graphql
    query getOrderOwner($id: ID!) {
      order(id: $id) {
        id
        customer { id }
      }
    }`, {
    variables: {
      id: orderId
    }
  });
  const ownerJson = await ownerRes.json();
  const order = (_a2 = ownerJson.data) == null ? void 0 : _a2.order;
  if (!order) {
    return cors(Response.json({
      userErrors: [{
        message: "Order not found."
      }]
    }, {
      status: 404
    }));
  }
  const numericId = (gidOrId) => {
    var _a3;
    return (_a3 = gidOrId == null ? void 0 : gidOrId.match(/\d+$/)) == null ? void 0 : _a3[0];
  };
  if (!((_b = order.customer) == null ? void 0 : _b.id) || numericId(order.customer.id) !== numericId(customerAccountId)) {
    return cors(Response.json({
      userErrors: [{
        message: "Not authorized to update this order."
      }]
    }, {
      status: 403
    }));
  }
  const numericOrderId = (_c = orderId.match(/\d+$/)) == null ? void 0 : _c[0];
  if (!numericOrderId) {
    return cors(Response.json({
      userErrors: [{
        message: "Invalid orderId format."
      }]
    }, {
      status: 400
    }));
  }
  const input = {
    id: orderId
  };
  if (emailStr) input.email = emailStr;
  if (phoneStr) input.phone = phoneStr;
  try {
    const updateRes = await admin.graphql(`#graphql
      mutation orderUpdate($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
            name
            email
            phone
            statusPageUrl
          }
          userErrors { field message }
        }
      }`, {
      variables: {
        input
      }
    });
    const updateJson = await updateRes.json();
    const errors = ((_e = (_d = updateJson.data) == null ? void 0 : _d.orderUpdate) == null ? void 0 : _e.userErrors) ?? [];
    if (errors.length) {
      return cors(Response.json({
        userErrors: errors
      }, {
        status: 422
      }));
    }
    await addOrderTags(admin, orderId);
    const {
      source
    } = body || {};
    await trackOrderEdit({
      shop: storeDomain,
      orderId,
      featureId: "contact-info",
      source
    });
    return cors(Response.json({
      order: updateJson.data.orderUpdate.order,
      userErrors: []
    }));
  } catch (err) {
    console.error("[order-contact] Unexpected error:", err);
    return cors(Response.json({
      userErrors: [{
        message: err instanceof Error ? err.message : "Internal error"
      }]
    }, {
      status: 500
    }));
  }
}
const route19 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$5,
  loader: loader$b
}, Symbol.toStringTag, { value: "Module" }));
async function loader$a({
  request
}) {
  const {
    cors
  } = await authenticate.public.customerAccount(request);
  return cors(new Response(JSON.stringify({
    success: true
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  }));
}
const action$4 = async ({
  request
}) => {
  var _a2, _b;
  const {
    sessionToken,
    cors
  } = await authenticate.public.customerAccount(request);
  if (request.method === "OPTIONS") {
    return cors(new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }));
  }
  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  if (!await isServiceEnabled(storeDomain, "download-invoice")) {
    return cors(Response.json({
      error: "This feature is not enabled by the merchant."
    }, {
      status: 403
    }));
  }
  const customerAccountId = sessionToken.sub;
  const body = await request.json();
  const orderId = body.orderId;
  if (!orderId) {
    return cors(Response.json({
      error: "Missing orderId"
    }, {
      status: 400
    }));
  }
  try {
    const {
      admin
    } = await unauthenticated.admin(storeDomain);
    const response = await admin.graphql(`#graphql
      query getOrderOwner($id: ID!) {
        order(id: $id) {
          id
          customer { id }
        }
      }`, {
      variables: {
        id: orderId
      }
    });
    const json = await response.json();
    const order = (_a2 = json.data) == null ? void 0 : _a2.order;
    if (!order) {
      return cors(Response.json({
        error: "Order not found"
      }, {
        status: 404
      }));
    }
    const numericId = (gidOrId) => {
      var _a3;
      return (_a3 = gidOrId == null ? void 0 : gidOrId.match(/\d+$/)) == null ? void 0 : _a3[0];
    };
    if (!((_b = order.customer) == null ? void 0 : _b.id) || numericId(order.customer.id) !== numericId(customerAccountId)) {
      return cors(Response.json({
        error: "Not authorized to access this order"
      }, {
        status: 403
      }));
    }
    const appUrl = process.env.SHOPIFY_APP_URL || new URL(request.url).origin;
    const invoiceUrl = buildSignedInvoiceUrl(appUrl, {
      shop: storeDomain,
      orderId,
      customerId: customerAccountId
    });
    await trackFeatureUsage({
      shop: storeDomain,
      featureId: "download-invoice"
    });
    return cors(Response.json({
      url: invoiceUrl
    }));
  } catch (err) {
    console.error("[order-invoice] Unexpected error:", err);
    return cors(Response.json({
      error: "Internal error"
    }, {
      status: 500
    }));
  }
};
const route20 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$4,
  loader: loader$a
}, Symbol.toStringTag, { value: "Module" }));
async function loader$9({
  request
}) {
  const {
    cors
  } = await authenticate.public.customerAccount(request);
  return cors(new Response(JSON.stringify({
    success: true
  }), {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  }));
}
async function action$3({
  request
}) {
  var _a2, _b;
  const {
    sessionToken,
    cors
  } = await authenticate.public.customerAccount(request);
  if (request.method === "OPTIONS") {
    return cors(new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }));
  }
  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  const {
    admin
  } = await unauthenticated.admin(storeDomain);
  const body = await request.json();
  const {
    orderId,
    reason,
    source
  } = body || {};
  if (!orderId) {
    return cors(Response.json({
      userErrors: [{
        message: "Missing orderId."
      }]
    }, {
      status: 400
    }));
  }
  const guard = await validateOrderEditable({
    admin,
    shop: storeDomain,
    orderId,
    customerAccountId: sessionToken.sub,
    requiredServiceId: "cancel-order"
  });
  if (!guard.allowed) {
    return cors(Response.json({
      userErrors: [{
        message: guard.message
      }]
    }, {
      status: guard.status
    }));
  }
  try {
    const cancelResponse = await admin.graphql(`#graphql
      mutation OrderCancel($orderId: ID!, $reason: OrderCancelReason!) {
        orderCancel(orderId: $orderId, reason: $reason, notifyCustomer: true, restock: true, refundMethod: { originalPaymentMethodsRefund: true }) {
          job { id }
          orderCancelUserErrors { field message }
        }
      }`, {
      variables: {
        orderId,
        reason: reason || "CUSTOMER"
      }
    });
    const cancelJson = await cancelResponse.json();
    const errors = ((_b = (_a2 = cancelJson.data) == null ? void 0 : _a2.orderCancel) == null ? void 0 : _b.orderCancelUserErrors) ?? [];
    if (errors.length) {
      return cors(Response.json({
        userErrors: errors
      }, {
        status: 422
      }));
    }
    await trackOrderEdit({
      shop: storeDomain,
      orderId,
      featureId: "cancel-order",
      source
    });
    return cors(Response.json({
      success: true,
      userErrors: []
    }));
  } catch (err) {
    console.error("[order-cancel] Unexpected error:", err);
    return cors(Response.json({
      userErrors: [{
        message: err instanceof Error ? err.message : "Internal error"
      }]
    }, {
      status: 500
    }));
  }
}
const route21 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$3,
  loader: loader$9
}, Symbol.toStringTag, { value: "Module" }));
async function loader$8({
  request
}) {
  var _a2, _b;
  const {
    sessionToken,
    cors
  } = await authenticate.public.customerAccount(request);
  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");
  if (!orderId) {
    return cors(Response.json({
      error: "Missing orderId"
    }, {
      status: 400
    }));
  }
  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  if (!await isServiceEnabled(storeDomain, "order-note")) {
    return cors(Response.json({
      error: "This feature is not enabled by the merchant."
    }, {
      status: 403
    }));
  }
  const {
    admin
  } = await unauthenticated.admin(storeDomain);
  try {
    const res = await admin.graphql(`#graphql
      query getOrderNote($id: ID!) {
        order(id: $id) {
          id
          customer {
            id
          }
          note
        }
      }`, {
      variables: {
        id: orderId
      }
    });
    const json = await res.json();
    const order = (_a2 = json.data) == null ? void 0 : _a2.order;
    if (!order) {
      return cors(Response.json({
        error: "Order not found"
      }, {
        status: 404
      }));
    }
    if (!isCustomerAuthorized((_b = order.customer) == null ? void 0 : _b.id, sessionToken.sub)) {
      return cors(Response.json({
        error: "Unauthorized access to order."
      }, {
        status: 403
      }));
    }
    return cors(Response.json({
      note: order.note || ""
    }));
  } catch (err) {
    console.error("[order-note-loader] Error:", err);
    return cors(Response.json({
      note: ""
    }));
  }
}
async function action$2({
  request
}) {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i;
  const {
    sessionToken,
    cors
  } = await authenticate.public.customerAccount(request);
  if (request.method === "OPTIONS") {
    return cors(new Response(null, {
      status: 200,
      headers: {
        "Content-Type": "application/json"
      }
    }));
  }
  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  const customerAccountId = sessionToken.sub;
  const {
    admin
  } = await unauthenticated.admin(storeDomain);
  const body = await request.json();
  const {
    orderId,
    note
  } = body;
  if (!orderId || note === void 0) {
    return cors(Response.json({
      userErrors: [{
        message: "Missing orderId or note."
      }]
    }, {
      status: 400
    }));
  }
  const guard = await validateOrderEditable({
    admin,
    shop: storeDomain,
    orderId,
    customerAccountId,
    requiredServiceId: "order-note"
  });
  if (!guard.allowed) {
    return cors(Response.json({
      userErrors: [{
        message: guard.message
      }]
    }, {
      status: guard.status
    }));
  }
  const ownerRes = await admin.graphql(`#graphql
    query getOrderOwnerForNote($id: ID!) {
      order(id: $id) {
        id
        customer { id }
      }
    }`, {
    variables: {
      id: orderId
    }
  });
  const ownerJson = await ownerRes.json();
  const order = (_a2 = ownerJson.data) == null ? void 0 : _a2.order;
  if (!order) {
    return cors(Response.json({
      userErrors: [{
        message: "Order not found."
      }]
    }, {
      status: 404
    }));
  }
  const numericId = (gidOrId) => {
    var _a3;
    return (_a3 = gidOrId == null ? void 0 : gidOrId.match(/\d+$/)) == null ? void 0 : _a3[0];
  };
  if (!((_b = order.customer) == null ? void 0 : _b.id) || numericId(order.customer.id) !== numericId(customerAccountId)) {
    return cors(Response.json({
      userErrors: [{
        message: "Not authorized to update this order."
      }]
    }, {
      status: 403
    }));
  }
  try {
    const updateRes = await admin.graphql(`#graphql
      mutation updateOrderNote($input: OrderInput!) {
        orderUpdate(input: $input) {
          order {
            id
            note
            statusPageUrl
          }
          userErrors { field message }
        }
      }`, {
      variables: {
        input: {
          id: orderId,
          note: String(note).trim()
        }
      }
    });
    const updateJson = await updateRes.json();
    const userErrors = ((_d = (_c = updateJson.data) == null ? void 0 : _c.orderUpdate) == null ? void 0 : _d.userErrors) ?? [];
    if (userErrors.length > 0) {
      return cors(Response.json({
        userErrors
      }, {
        status: 422
      }));
    }
    await addOrderTags(admin, orderId, false);
    const {
      source
    } = body || {};
    await trackOrderEdit({
      shop: storeDomain,
      orderId,
      featureId: "order-note",
      source
    });
    return cors(Response.json({
      note: ((_g = (_f = (_e = updateJson.data) == null ? void 0 : _e.orderUpdate) == null ? void 0 : _f.order) == null ? void 0 : _g.note) || "",
      order: ((_i = (_h = updateJson.data) == null ? void 0 : _h.orderUpdate) == null ? void 0 : _i.order) || null,
      userErrors: []
    }));
  } catch (err) {
    console.error("[order-note-action] Unexpected error:", err);
    return cors(Response.json({
      userErrors: [{
        message: err instanceof Error ? err.message : "Internal error updating order note"
      }]
    }, {
      status: 500
    }));
  }
}
const route22 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$2,
  loader: loader$8
}, Symbol.toStringTag, { value: "Module" }));
function loginErrorMessage(loginErrors) {
  if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.MissingShop) {
    return { shop: "Please enter your shop domain to log in" };
  } else if ((loginErrors == null ? void 0 : loginErrors.shop) === LoginErrorType.InvalidShop) {
    return { shop: "Please enter a valid shop domain to log in" };
  }
  return {};
}
const loader$7 = async ({
  request
}) => {
  const errors = loginErrorMessage(await login(request));
  return {
    errors
  };
};
const action$1 = async ({
  request
}) => {
  const errors = loginErrorMessage(await login(request));
  return {
    errors
  };
};
const route$1 = UNSAFE_withComponentProps(function Auth() {
  const loaderData = useLoaderData();
  const actionData = useActionData();
  const [shop, setShop] = useState("");
  const {
    errors
  } = actionData || loaderData;
  return /* @__PURE__ */ jsx(AppProvider, {
    embedded: false,
    children: /* @__PURE__ */ jsx("s-page", {
      children: /* @__PURE__ */ jsx(Form, {
        method: "post",
        children: /* @__PURE__ */ jsxs("s-section", {
          heading: "Log in",
          children: [/* @__PURE__ */ jsx("s-text-field", {
            name: "shop",
            label: "Shop domain",
            details: "example.myshopify.com",
            value: shop,
            onChange: (e) => setShop(e.currentTarget.value),
            autocomplete: "on",
            error: errors.shop
          }), /* @__PURE__ */ jsx("s-button", {
            type: "submit",
            children: "Log in"
          })]
        })
      })
    })
  });
});
const route23 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action: action$1,
  default: route$1,
  loader: loader$7
}, Symbol.toStringTag, { value: "Module" }));
const pageWrapper = "_pageWrapper_ak723_18";
const container = "_container_ak723_29";
const header = "_header_ak723_37";
const nav = "_nav_ak723_48";
const logo = "_logo_ak723_55";
const logoIcon = "_logoIcon_ak723_66";
const logoText = "_logoText_ak723_77";
const navLinks = "_navLinks_ak723_81";
const navLink = "_navLink_ak723_81";
const navActions = "_navActions_ak723_102";
const installButtonPill = "_installButtonPill_ak723_108";
const heroSection = "_heroSection_ak723_140";
const heroGrid = "_heroGrid_ak723_144";
const heroContent = "_heroContent_ak723_151";
const heroBadge = "_heroBadge_ak723_155";
const heroHeading = "_heroHeading_ak723_168";
const heroDescription = "_heroDescription_ak723_177";
const domainForm = "_domainForm_ak723_184";
const formLabel = "_formLabel_ak723_190";
const inputRow = "_inputRow_ak723_196";
const domainInput = "_domainInput_ak723_203";
const primaryButton = "_primaryButton_ak723_222";
const formHelper = "_formHelper_ak723_242";
const heroCardWrapper = "_heroCardWrapper_ak723_250";
const orderCard = "_orderCard_ak723_255";
const orderCardHeader = "_orderCardHeader_ak723_272";
const orderNumber = "_orderNumber_ak723_279";
const timerBadge = "_timerBadge_ak723_285";
const timerPulse = "_timerPulse_ak723_297";
const orderItemRow = "_orderItemRow_ak723_321";
const itemThumb = "_itemThumb_ak723_332";
const itemDetails = "_itemDetails_ak723_344";
const itemTitle = "_itemTitle_ak723_348";
const itemVariant = "_itemVariant_ak723_355";
const variantFrom = "_variantFrom_ak723_363";
const variantArrow = "_variantArrow_ak723_368";
const variantTo = "_variantTo_ak723_373";
const itemQty = "_itemQty_ak723_378";
const shippingBox = "_shippingBox_ak723_384";
const shippingLabel = "_shippingLabel_ak723_392";
const shippingText = "_shippingText_ak723_401";
const shippingTextSub = "_shippingTextSub_ak723_407";
const saveChangesBtn = "_saveChangesBtn_ak723_412";
const saveFeedback = "_saveFeedback_ak723_433";
const syncNote = "_syncNote_ak723_437";
const syncDot = "_syncDot_ak723_447";
const whereSection = "_whereSection_ak723_456";
const whereContainer = "_whereContainer_ak723_460";
const whereHeading = "_whereHeading_ak723_470";
const whereBlock = "_whereBlock_ak723_479";
const whereBlockTitle = "_whereBlockTitle_ak723_484";
const whereBlockText = "_whereBlockText_ak723_491";
const featuresSection = "_featuresSection_ak723_500";
const sectionEyebrow = "_sectionEyebrow_ak723_504";
const sectionHeading = "_sectionHeading_ak723_513";
const sectionSubhead = "_sectionSubhead_ak723_522";
const featuresGrid = "_featuresGrid_ak723_528";
const featureCard = "_featureCard_ak723_534";
const featureNumber = "_featureNumber_ak723_550";
const featureTitle = "_featureTitle_ak723_558";
const featureText = "_featureText_ak723_566";
const featuresNote = "_featuresNote_ak723_573";
const howSection = "_howSection_ak723_581";
const stepsGrid = "_stepsGrid_ak723_585";
const stepCard = "_stepCard_ak723_592";
const stepTag = "_stepTag_ak723_597";
const stepTitle = "_stepTitle_ak723_604";
const stepText = "_stepText_ak723_612";
const controlsSection = "_controlsSection_ak723_621";
const controlsCard = "_controlsCard_ak723_625";
const controlsLeft = "_controlsLeft_ak723_636";
const controlsEyebrow = "_controlsEyebrow_ak723_641";
const controlsHeading = "_controlsHeading_ak723_650";
const controlsSubhead = "_controlsSubhead_ak723_659";
const controlsRight = "_controlsRight_ak723_666";
const controlItem = "_controlItem_ak723_672";
const controlItemTitle = "_controlItemTitle_ak723_677";
const controlItemText = "_controlItemText_ak723_684";
const faqSection = "_faqSection_ak723_693";
const faqHeader = "_faqHeader_ak723_697";
const faqContainer = "_faqContainer_ak723_702";
const faqItem = "_faqItem_ak723_708";
const faqQuestionBtn = "_faqQuestionBtn_ak723_712";
const faqQuestionLeft = "_faqQuestionLeft_ak723_728";
const faqArrow = "_faqArrow_ak723_734";
const faqArrowOpen = "_faqArrowOpen_ak723_741";
const faqAnswer = "_faqAnswer_ak723_745";
const bottomCtaSection = "_bottomCtaSection_ak723_755";
const bottomCtaCard = "_bottomCtaCard_ak723_759";
const bottomCtaHeading = "_bottomCtaHeading_ak723_770";
const bottomCtaSubhead = "_bottomCtaSubhead_ak723_779";
const bottomCtaForm = "_bottomCtaForm_ak723_785";
const bottomCtaFormGroup = "_bottomCtaFormGroup_ak723_793";
const bottomCtaLabel = "_bottomCtaLabel_ak723_801";
const bottomCtaInputRow = "_bottomCtaInputRow_ak723_807";
const bottomCtaInput = "_bottomCtaInput_ak723_807";
const bottomCtaButton = "_bottomCtaButton_ak723_831";
const footer = "_footer_ak723_853";
const footerContent = "_footerContent_ak723_858";
const footerLeft = "_footerLeft_ak723_866";
const footerRight = "_footerRight_ak723_870";
const footerLink = "_footerLink_ak723_876";
const modalBackdrop = "_modalBackdrop_ak723_893";
const modalBox = "_modalBox_ak723_905";
const modalCloseBtn = "_modalCloseBtn_ak723_917";
const styles = {
  pageWrapper,
  container,
  header,
  nav,
  logo,
  logoIcon,
  logoText,
  navLinks,
  navLink,
  navActions,
  installButtonPill,
  heroSection,
  heroGrid,
  heroContent,
  heroBadge,
  heroHeading,
  heroDescription,
  domainForm,
  formLabel,
  inputRow,
  domainInput,
  primaryButton,
  formHelper,
  heroCardWrapper,
  orderCard,
  orderCardHeader,
  orderNumber,
  timerBadge,
  timerPulse,
  orderItemRow,
  itemThumb,
  itemDetails,
  itemTitle,
  itemVariant,
  variantFrom,
  variantArrow,
  variantTo,
  itemQty,
  shippingBox,
  shippingLabel,
  shippingText,
  shippingTextSub,
  saveChangesBtn,
  saveFeedback,
  syncNote,
  syncDot,
  whereSection,
  whereContainer,
  whereHeading,
  whereBlock,
  whereBlockTitle,
  whereBlockText,
  featuresSection,
  sectionEyebrow,
  sectionHeading,
  sectionSubhead,
  featuresGrid,
  featureCard,
  featureNumber,
  featureTitle,
  featureText,
  featuresNote,
  howSection,
  stepsGrid,
  stepCard,
  stepTag,
  stepTitle,
  stepText,
  controlsSection,
  controlsCard,
  controlsLeft,
  controlsEyebrow,
  controlsHeading,
  controlsSubhead,
  controlsRight,
  controlItem,
  controlItemTitle,
  controlItemText,
  faqSection,
  faqHeader,
  faqContainer,
  faqItem,
  faqQuestionBtn,
  faqQuestionLeft,
  faqArrow,
  faqArrowOpen,
  faqAnswer,
  bottomCtaSection,
  bottomCtaCard,
  bottomCtaHeading,
  bottomCtaSubhead,
  bottomCtaForm,
  bottomCtaFormGroup,
  bottomCtaLabel,
  bottomCtaInputRow,
  bottomCtaInput,
  bottomCtaButton,
  footer,
  footerContent,
  footerLeft,
  footerRight,
  footerLink,
  modalBackdrop,
  modalBox,
  modalCloseBtn
};
const meta = () => {
  return [{
    title: "OrderEase - Self-Serve Order Editing for Shopify"
  }, {
    name: "description",
    content: "OrderEase lets shoppers update shipping addresses, sizes, colors and items on unfulfilled orders right after checkout, with no support ticket needed."
  }];
};
const loader$6 = async ({
  request
}) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }
  return {
    showForm: Boolean(login)
  };
};
const route = UNSAFE_withComponentProps(function App2() {
  const {
    showForm
  } = useLoaderData();
  const [shopDomain, setShopDomain] = useState("");
  const [openFaq, setOpenFaq] = useState(null);
  const [savedDemo, setSavedDemo] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(872);
  const [activeModal, setActiveModal] = useState(null);
  const heroInputRef = useRef(null);
  useEffect(() => {
    const timer = setInterval(() => {
      setSecondsLeft((prev) => prev > 0 ? prev - 1 : 900);
    }, 1e3);
    return () => clearInterval(timer);
  }, []);
  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s < 10 ? "0" : ""}${s}`;
  };
  const handleDemoSave = () => {
    setSavedDemo(true);
    setTimeout(() => setSavedDemo(false), 2200);
  };
  const scrollToInstall = (e) => {
    var _a2;
    e.preventDefault();
    (_a2 = heroInputRef.current) == null ? void 0 : _a2.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
    setTimeout(() => {
      var _a3;
      (_a3 = heroInputRef.current) == null ? void 0 : _a3.focus();
    }, 400);
  };
  const handleFormSubmit = (e) => {
    const form = e.currentTarget;
    const input = form.elements.namedItem("shop");
    if (input && input.value) {
      let val = input.value.trim().toLowerCase();
      val = val.replace(/^https?:\/\//, "").replace(/\/$/, "");
      if (!val.includes(".") && val.length > 0) {
        val = `${val}.myshopify.com`;
      }
      input.value = val;
    }
  };
  const toggleFaq = (index) => {
    setOpenFaq(openFaq === index ? null : index);
  };
  const handleSupportClick = () => {
    var _a2;
    if (typeof window !== "undefined" && ((_a2 = window.Tawk_API) == null ? void 0 : _a2.maximize)) {
      window.Tawk_API.maximize();
    } else {
      setActiveModal("support");
    }
  };
  const faqs = [{
    q: "Which orders can customers edit?",
    a: "Unfulfilled orders, within the time window and edit limits you configure."
  }, {
    q: "Does it update my Shopify admin?",
    a: "Yes. Edits are validated first, then applied to the order in Shopify admin instantly."
  }, {
    q: "Where do customers find the editor?",
    a: "On the checkout thank-you page and in the order details of their customer account."
  }, {
    q: "Can I turn features on or off?",
    a: "Yes. Manage which of the 11 services are active from inside the app."
  }];
  return /* @__PURE__ */ jsxs("div", {
    className: styles.pageWrapper,
    children: [/* @__PURE__ */ jsx("header", {
      className: styles.header,
      children: /* @__PURE__ */ jsx("div", {
        className: styles.container,
        children: /* @__PURE__ */ jsxs("nav", {
          className: styles.nav,
          children: [/* @__PURE__ */ jsxs("a", {
            href: "/",
            className: styles.logo,
            children: [/* @__PURE__ */ jsx("span", {
              className: styles.logoIcon,
              children: /* @__PURE__ */ jsx("svg", {
                width: "16",
                height: "16",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: "3",
                strokeLinecap: "round",
                strokeLinejoin: "round",
                children: /* @__PURE__ */ jsx("polyline", {
                  points: "20 6 9 17 4 12"
                })
              })
            }), /* @__PURE__ */ jsx("span", {
              className: styles.logoText,
              children: "OrderEase"
            })]
          }), /* @__PURE__ */ jsxs("ul", {
            className: styles.navLinks,
            children: [/* @__PURE__ */ jsx("li", {
              children: /* @__PURE__ */ jsx("a", {
                href: "#features",
                className: styles.navLink,
                children: "Features"
              })
            }), /* @__PURE__ */ jsx("li", {
              children: /* @__PURE__ */ jsx("a", {
                href: "#how-it-works",
                className: styles.navLink,
                children: "How it works"
              })
            }), /* @__PURE__ */ jsx("li", {
              children: /* @__PURE__ */ jsx("a", {
                href: "#controls",
                className: styles.navLink,
                children: "Controls"
              })
            }), /* @__PURE__ */ jsx("li", {
              children: /* @__PURE__ */ jsx("a", {
                href: "#faq",
                className: styles.navLink,
                children: "FAQ"
              })
            })]
          }), /* @__PURE__ */ jsx("div", {
            className: styles.navActions,
            children: /* @__PURE__ */ jsx("button", {
              type: "button",
              onClick: scrollToInstall,
              className: styles.installButtonPill,
              children: "Install app"
            })
          })]
        })
      })
    }), /* @__PURE__ */ jsx("section", {
      className: styles.heroSection,
      children: /* @__PURE__ */ jsx("div", {
        className: styles.container,
        children: /* @__PURE__ */ jsxs("div", {
          className: styles.heroGrid,
          children: [/* @__PURE__ */ jsxs("div", {
            className: styles.heroContent,
            children: [/* @__PURE__ */ jsx("div", {
              className: styles.heroBadge,
              children: "Order editing for Shopify"
            }), /* @__PURE__ */ jsxs("h1", {
              className: styles.heroHeading,
              children: ["Let customers fix", /* @__PURE__ */ jsx("br", {}), "their own orders."]
            }), /* @__PURE__ */ jsx("p", {
              className: styles.heroDescription,
              children: "OrderEase lets shoppers update shipping addresses, sizes, colors and items on unfulfilled orders right after checkout, with no support ticket needed."
            }), showForm && /* @__PURE__ */ jsxs("div", {
              id: "hero-install-form",
              className: styles.domainForm,
              children: [/* @__PURE__ */ jsx("label", {
                htmlFor: "hero-shop-input",
                className: styles.formLabel,
                children: "Your Shopify store domain"
              }), /* @__PURE__ */ jsx(Form, {
                method: "post",
                action: "/auth/login",
                onSubmit: handleFormSubmit,
                children: /* @__PURE__ */ jsxs("div", {
                  className: styles.inputRow,
                  children: [/* @__PURE__ */ jsx("input", {
                    ref: heroInputRef,
                    id: "hero-shop-input",
                    className: styles.domainInput,
                    type: "text",
                    name: "shop",
                    value: shopDomain,
                    onChange: (e) => setShopDomain(e.target.value),
                    placeholder: "my-shop-domain.myshopify.com",
                    required: true
                  }), /* @__PURE__ */ jsx("button", {
                    className: styles.primaryButton,
                    type: "submit",
                    children: "Install OrderEase"
                  })]
                })
              }), /* @__PURE__ */ jsx("span", {
                className: styles.formHelper,
                children: "e.g. my-shop-domain.myshopify.com"
              })]
            })]
          }), /* @__PURE__ */ jsx("div", {
            className: styles.heroCardWrapper,
            children: /* @__PURE__ */ jsxs("div", {
              className: styles.orderCard,
              children: [/* @__PURE__ */ jsxs("div", {
                className: styles.orderCardHeader,
                children: [/* @__PURE__ */ jsx("span", {
                  className: styles.orderNumber,
                  children: "Order #1001"
                }), /* @__PURE__ */ jsxs("span", {
                  className: styles.timerBadge,
                  children: [/* @__PURE__ */ jsx("span", {
                    className: styles.timerPulse
                  }), "Edit window: ", formatTime(secondsLeft), " left"]
                })]
              }), /* @__PURE__ */ jsxs("div", {
                className: styles.orderItemRow,
                children: [/* @__PURE__ */ jsx("div", {
                  className: styles.itemThumb,
                  children: /* @__PURE__ */ jsx("svg", {
                    width: "24",
                    height: "24",
                    viewBox: "0 0 24 24",
                    fill: "none",
                    stroke: "currentColor",
                    strokeWidth: "1.8",
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                    children: /* @__PURE__ */ jsx("path", {
                      d: "M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"
                    })
                  })
                }), /* @__PURE__ */ jsxs("div", {
                  className: styles.itemDetails,
                  children: [/* @__PURE__ */ jsx("div", {
                    className: styles.itemTitle,
                    children: "Classic Tee"
                  }), /* @__PURE__ */ jsxs("div", {
                    className: styles.itemVariant,
                    children: [/* @__PURE__ */ jsx("span", {
                      className: styles.variantFrom,
                      children: "Size M"
                    }), /* @__PURE__ */ jsx("span", {
                      className: styles.variantArrow,
                      children: "→"
                    }), /* @__PURE__ */ jsx("span", {
                      className: styles.variantTo,
                      children: "Size L"
                    })]
                  })]
                }), /* @__PURE__ */ jsx("div", {
                  className: styles.itemQty,
                  children: "Qty 1"
                })]
              }), /* @__PURE__ */ jsxs("div", {
                className: styles.shippingBox,
                children: [/* @__PURE__ */ jsx("div", {
                  className: styles.shippingLabel,
                  children: "SHIPPING ADDRESS"
                }), /* @__PURE__ */ jsx("div", {
                  className: styles.shippingText,
                  children: "12 Example Street, Apt 4B"
                }), /* @__PURE__ */ jsx("div", {
                  className: styles.shippingTextSub,
                  children: "Springfield, 00000"
                })]
              }), /* @__PURE__ */ jsx("button", {
                type: "button",
                onClick: handleDemoSave,
                className: `${styles.saveChangesBtn} ${savedDemo ? styles.saveFeedback : ""}`,
                children: savedDemo ? /* @__PURE__ */ jsxs(Fragment, {
                  children: [/* @__PURE__ */ jsx("svg", {
                    width: "16",
                    height: "16",
                    viewBox: "0 0 24 24",
                    fill: "none",
                    stroke: "currentColor",
                    strokeWidth: "3",
                    strokeLinecap: "round",
                    strokeLinejoin: "round",
                    children: /* @__PURE__ */ jsx("polyline", {
                      points: "20 6 9 17 4 12"
                    })
                  }), "Saved successfully!"]
                }) : "Save changes"
              }), /* @__PURE__ */ jsxs("div", {
                className: styles.syncNote,
                children: [/* @__PURE__ */ jsx("span", {
                  className: styles.syncDot
                }), "Synced to Shopify admin instantly"]
              })]
            })
          })]
        })
      })
    }), /* @__PURE__ */ jsx("section", {
      className: styles.whereSection,
      children: /* @__PURE__ */ jsx("div", {
        className: styles.container,
        children: /* @__PURE__ */ jsxs("div", {
          className: styles.whereContainer,
          children: [/* @__PURE__ */ jsxs("h2", {
            className: styles.whereHeading,
            children: ["Right where customers", /* @__PURE__ */ jsx("br", {}), "already are"]
          }), /* @__PURE__ */ jsxs("div", {
            className: styles.whereBlock,
            children: [/* @__PURE__ */ jsx("h3", {
              className: styles.whereBlockTitle,
              children: "Checkout thank-you page"
            }), /* @__PURE__ */ jsx("p", {
              className: styles.whereBlockText,
              children: "Appears right after purchase, perfect for the wrong size or a mistyped address caught seconds later."
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: styles.whereBlock,
            children: [/* @__PURE__ */ jsx("h3", {
              className: styles.whereBlockTitle,
              children: "Customer account"
            }), /* @__PURE__ */ jsx("p", {
              className: styles.whereBlockText,
              children: "An order status block on past and active orders gives shoppers control over anything still pending."
            })]
          })]
        })
      })
    }), /* @__PURE__ */ jsx("section", {
      id: "features",
      className: styles.featuresSection,
      children: /* @__PURE__ */ jsxs("div", {
        className: styles.container,
        children: [/* @__PURE__ */ jsx("div", {
          className: styles.sectionEyebrow,
          children: "FEATURES"
        }), /* @__PURE__ */ jsx("h2", {
          className: styles.sectionHeading,
          children: "Every common order fix, self-serve"
        }), /* @__PURE__ */ jsx("p", {
          className: styles.sectionSubhead,
          children: "Fewer support tickets, fewer wrong shipments, happier customers."
        }), /* @__PURE__ */ jsxs("div", {
          className: styles.featuresGrid,
          children: [/* @__PURE__ */ jsxs("div", {
            className: styles.featureCard,
            children: [/* @__PURE__ */ jsx("span", {
              className: styles.featureNumber,
              children: "01"
            }), /* @__PURE__ */ jsx("h3", {
              className: styles.featureTitle,
              children: "Update shipping address"
            }), /* @__PURE__ */ jsx("p", {
              className: styles.featureText,
              children: "Typed it wrong? Customers correct the address themselves before the order ships."
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: styles.featureCard,
            children: [/* @__PURE__ */ jsx("span", {
              className: styles.featureNumber,
              children: "02"
            }), /* @__PURE__ */ jsx("h3", {
              className: styles.featureTitle,
              children: "Swap size or color"
            }), /* @__PURE__ */ jsx("p", {
              className: styles.featureText,
              children: "Variant changes on unfulfilled orders, with no ticket and no back and forth."
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: styles.featureCard,
            children: [/* @__PURE__ */ jsx("span", {
              className: styles.featureNumber,
              children: "03"
            }), /* @__PURE__ */ jsx("h3", {
              className: styles.featureTitle,
              children: "Change quantity"
            }), /* @__PURE__ */ jsx("p", {
              className: styles.featureText,
              children: "Add or remove units. Inventory is checked before any change goes through."
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: styles.featureCard,
            children: [/* @__PURE__ */ jsx("span", {
              className: styles.featureNumber,
              children: "04"
            }), /* @__PURE__ */ jsx("h3", {
              className: styles.featureTitle,
              children: "Add forgotten items"
            }), /* @__PURE__ */ jsx("p", {
              className: styles.featureText,
              children: "Shoppers add what they missed straight after purchase, so you keep the extra sale."
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: styles.featureCard,
            children: [/* @__PURE__ */ jsx("span", {
              className: styles.featureNumber,
              children: "05"
            }), /* @__PURE__ */ jsx("h3", {
              className: styles.featureTitle,
              children: "Apply missed discount codes"
            }), /* @__PURE__ */ jsx("p", {
              className: styles.featureText,
              children: "Forgot a code at checkout? Customers can apply it right after they order."
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: styles.featureCard,
            children: [/* @__PURE__ */ jsx("span", {
              className: styles.featureNumber,
              children: "06"
            }), /* @__PURE__ */ jsx("h3", {
              className: styles.featureTitle,
              children: "Order notes and PDF invoice"
            }), /* @__PURE__ */ jsx("p", {
              className: styles.featureText,
              children: "Edit the order note and download an invoice from the same screen."
            })]
          })]
        }), /* @__PURE__ */ jsx("p", {
          className: styles.featuresNote,
          children: "OrderEase includes 11 services in total. Turn on only the ones you want."
        })]
      })
    }), /* @__PURE__ */ jsx("section", {
      id: "how-it-works",
      className: styles.howSection,
      children: /* @__PURE__ */ jsxs("div", {
        className: styles.container,
        children: [/* @__PURE__ */ jsx("div", {
          className: styles.sectionEyebrow,
          children: "HOW IT WORKS"
        }), /* @__PURE__ */ jsxs("h2", {
          className: styles.sectionHeading,
          children: ["From order to corrected order", /* @__PURE__ */ jsx("br", {}), "in four steps"]
        }), /* @__PURE__ */ jsxs("div", {
          className: styles.stepsGrid,
          children: [/* @__PURE__ */ jsxs("div", {
            className: styles.stepCard,
            children: [/* @__PURE__ */ jsx("span", {
              className: styles.stepTag,
              children: "Step 1"
            }), /* @__PURE__ */ jsx("h3", {
              className: styles.stepTitle,
              children: "Customer orders"
            }), /* @__PURE__ */ jsx("p", {
              className: styles.stepText,
              children: "They check out on your store and the edit countdown starts immediately."
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: styles.stepCard,
            children: [/* @__PURE__ */ jsx("span", {
              className: styles.stepTag,
              children: "Step 2"
            }), /* @__PURE__ */ jsx("h3", {
              className: styles.stepTitle,
              children: "They open their order"
            }), /* @__PURE__ */ jsx("p", {
              className: styles.stepText,
              children: "From the thank-you page or the order details in their account."
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: styles.stepCard,
            children: [/* @__PURE__ */ jsx("span", {
              className: styles.stepTag,
              children: "Step 3"
            }), /* @__PURE__ */ jsx("h3", {
              className: styles.stepTitle,
              children: "They make the edit"
            }), /* @__PURE__ */ jsx("p", {
              className: styles.stepText,
              children: "Quantity, variant, address, note or invoice, whatever you have enabled."
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: styles.stepCard,
            children: [/* @__PURE__ */ jsx("span", {
              className: styles.stepTag,
              children: "Step 4"
            }), /* @__PURE__ */ jsx("h3", {
              className: styles.stepTitle,
              children: "Shopify updates"
            }), /* @__PURE__ */ jsx("p", {
              className: styles.stepText,
              children: "The edit is validated against your rules, then your Shopify admin updates instantly."
            })]
          })]
        })]
      })
    }), /* @__PURE__ */ jsx("section", {
      id: "controls",
      className: styles.controlsSection,
      children: /* @__PURE__ */ jsx("div", {
        className: styles.container,
        children: /* @__PURE__ */ jsxs("div", {
          className: styles.controlsCard,
          children: [/* @__PURE__ */ jsxs("div", {
            className: styles.controlsLeft,
            children: [/* @__PURE__ */ jsx("div", {
              className: styles.controlsEyebrow,
              children: "CONTROLS"
            }), /* @__PURE__ */ jsxs("h2", {
              className: styles.controlsHeading,
              children: ["You set the rules.", /* @__PURE__ */ jsx("br", {}), "Customers work inside", /* @__PURE__ */ jsx("br", {}), "them."]
            }), /* @__PURE__ */ jsx("p", {
              className: styles.controlsSubhead,
              children: "No surprise changes to orders that are ready to ship."
            })]
          }), /* @__PURE__ */ jsxs("div", {
            className: styles.controlsRight,
            children: [/* @__PURE__ */ jsxs("div", {
              className: styles.controlItem,
              children: [/* @__PURE__ */ jsx("h3", {
                className: styles.controlItemTitle,
                children: "Time window limits"
              }), /* @__PURE__ */ jsx("p", {
                className: styles.controlItemText,
                children: "Choose how long after checkout an order can be edited."
              })]
            }), /* @__PURE__ */ jsxs("div", {
              className: styles.controlItem,
              children: [/* @__PURE__ */ jsx("h3", {
                className: styles.controlItemTitle,
                children: "Edit count limits"
              }), /* @__PURE__ */ jsx("p", {
                className: styles.controlItemText,
                children: "Cap how many times a single order can be changed."
              })]
            }), /* @__PURE__ */ jsxs("div", {
              className: styles.controlItem,
              children: [/* @__PURE__ */ jsx("h3", {
                className: styles.controlItemTitle,
                children: "Inventory checks"
              }), /* @__PURE__ */ jsx("p", {
                className: styles.controlItemText,
                children: "Edits are validated against stock levels before anything changes."
              })]
            }), /* @__PURE__ */ jsxs("div", {
              className: styles.controlItem,
              children: [/* @__PURE__ */ jsx("h3", {
                className: styles.controlItemTitle,
                children: "Live Shopify sync"
              }), /* @__PURE__ */ jsx("p", {
                className: styles.controlItemText,
                children: "Approved edits show up in Shopify admin right away."
              })]
            })]
          })]
        })
      })
    }), /* @__PURE__ */ jsx("section", {
      id: "faq",
      className: styles.faqSection,
      children: /* @__PURE__ */ jsxs("div", {
        className: styles.container,
        children: [/* @__PURE__ */ jsx("div", {
          className: styles.faqHeader,
          children: /* @__PURE__ */ jsx("h2", {
            className: styles.sectionHeading,
            children: "Questions merchants ask"
          })
        }), /* @__PURE__ */ jsx("div", {
          className: styles.faqContainer,
          children: faqs.map((faq, index) => {
            const isOpen = openFaq === index;
            return /* @__PURE__ */ jsxs("div", {
              className: styles.faqItem,
              children: [/* @__PURE__ */ jsx("button", {
                type: "button",
                className: styles.faqQuestionBtn,
                onClick: () => toggleFaq(index),
                "aria-expanded": isOpen,
                children: /* @__PURE__ */ jsxs("span", {
                  className: styles.faqQuestionLeft,
                  children: [/* @__PURE__ */ jsx("span", {
                    className: `${styles.faqArrow} ${isOpen ? styles.faqArrowOpen : ""}`,
                    children: "▶"
                  }), faq.q]
                })
              }), isOpen && /* @__PURE__ */ jsx("p", {
                className: styles.faqAnswer,
                children: faq.a
              })]
            }, index);
          })
        })]
      })
    }), /* @__PURE__ */ jsx("section", {
      className: styles.bottomCtaSection,
      children: /* @__PURE__ */ jsx("div", {
        className: styles.container,
        children: /* @__PURE__ */ jsxs("div", {
          className: styles.bottomCtaCard,
          children: [/* @__PURE__ */ jsx("h2", {
            className: styles.bottomCtaHeading,
            children: "Stop fixing orders by email"
          }), /* @__PURE__ */ jsx("p", {
            className: styles.bottomCtaSubhead,
            children: "Enter your store domain to add OrderEase to Shopify."
          }), showForm && /* @__PURE__ */ jsx("div", {
            className: styles.bottomCtaForm,
            children: /* @__PURE__ */ jsxs(Form, {
              method: "post",
              action: "/auth/login",
              onSubmit: handleFormSubmit,
              className: styles.bottomCtaFormGroup,
              children: [/* @__PURE__ */ jsx("label", {
                htmlFor: "bottom-shop-input",
                className: styles.bottomCtaLabel,
                children: "Your Shopify store domain"
              }), /* @__PURE__ */ jsxs("div", {
                className: styles.bottomCtaInputRow,
                children: [/* @__PURE__ */ jsx("input", {
                  id: "bottom-shop-input",
                  className: styles.bottomCtaInput,
                  type: "text",
                  name: "shop",
                  value: shopDomain,
                  onChange: (e) => setShopDomain(e.target.value),
                  placeholder: "my-shop-domain.myshopify.com",
                  required: true
                }), /* @__PURE__ */ jsx("button", {
                  className: styles.bottomCtaButton,
                  type: "submit",
                  children: "Install OrderEase"
                })]
              })]
            })
          })]
        })
      })
    }), /* @__PURE__ */ jsx("footer", {
      className: styles.footer,
      children: /* @__PURE__ */ jsx("div", {
        className: styles.container,
        children: /* @__PURE__ */ jsxs("div", {
          className: styles.footerContent,
          children: [/* @__PURE__ */ jsx("div", {
            className: styles.footerLeft,
            children: "© OrderEase"
          }), /* @__PURE__ */ jsxs("div", {
            className: styles.footerRight,
            children: [/* @__PURE__ */ jsx("button", {
              type: "button",
              className: styles.footerLink,
              onClick: () => setActiveModal("privacy"),
              children: "Privacy policy"
            }), /* @__PURE__ */ jsx("button", {
              type: "button",
              className: styles.footerLink,
              onClick: handleSupportClick,
              children: "Support"
            })]
          })]
        })
      })
    }), activeModal === "privacy" && /* @__PURE__ */ jsx("div", {
      className: styles.modalBackdrop,
      onClick: () => setActiveModal(null),
      children: /* @__PURE__ */ jsxs("div", {
        className: styles.modalBox,
        onClick: (e) => e.stopPropagation(),
        children: [/* @__PURE__ */ jsx("button", {
          type: "button",
          className: styles.modalCloseBtn,
          onClick: () => setActiveModal(null),
          "aria-label": "Close",
          children: "✕"
        }), /* @__PURE__ */ jsx("h2", {
          style: {
            fontSize: "22px",
            fontWeight: 700,
            marginBottom: "16px",
            color: "#111827"
          },
          children: "Privacy Policy"
        }), /* @__PURE__ */ jsxs("div", {
          style: {
            color: "#4b5563",
            fontSize: "14px",
            lineHeight: "1.6"
          },
          children: [/* @__PURE__ */ jsx("p", {
            style: {
              marginBottom: "12px"
            },
            children: "OrderEase is committed to protecting the privacy of merchants and their customers. This Privacy Policy describes how personal information is collected, used, and shared when you install or use the app in connection with your Shopify-supported store."
          }), /* @__PURE__ */ jsx("h4", {
            style: {
              fontWeight: 600,
              color: "#111827",
              margin: "16px 0 6px"
            },
            children: "Information We Collect"
          }), /* @__PURE__ */ jsx("p", {
            style: {
              marginBottom: "12px"
            },
            children: "When you install OrderEase, we automatically receive access to certain order information via Shopify APIs (such as order ID, shipping address, line items, and fulfillment status) strictly necessary to facilitate self-serve customer order adjustments."
          }), /* @__PURE__ */ jsx("h4", {
            style: {
              fontWeight: 600,
              color: "#111827",
              margin: "16px 0 6px"
            },
            children: "How We Use Your Information"
          }), /* @__PURE__ */ jsx("p", {
            style: {
              marginBottom: "12px"
            },
            children: "We use the information solely to perform customer-requested order edits, validate changes against merchant-configured rules, and update Shopify admin records accordingly. We never sell customer personal data to third parties."
          }), /* @__PURE__ */ jsx("h4", {
            style: {
              fontWeight: 600,
              color: "#111827",
              margin: "16px 0 6px"
            },
            children: "Contact Us"
          }), /* @__PURE__ */ jsx("p", {
            children: "If you have questions about our privacy practices, please contact us at support@orderease.io."
          })]
        })]
      })
    }), activeModal === "support" && /* @__PURE__ */ jsx("div", {
      className: styles.modalBackdrop,
      onClick: () => setActiveModal(null),
      children: /* @__PURE__ */ jsxs("div", {
        className: styles.modalBox,
        onClick: (e) => e.stopPropagation(),
        children: [/* @__PURE__ */ jsx("button", {
          type: "button",
          className: styles.modalCloseBtn,
          onClick: () => setActiveModal(null),
          "aria-label": "Close",
          children: "✕"
        }), /* @__PURE__ */ jsx("h2", {
          style: {
            fontSize: "22px",
            fontWeight: 700,
            marginBottom: "16px",
            color: "#111827"
          },
          children: "OrderEase Support"
        }), /* @__PURE__ */ jsxs("div", {
          style: {
            color: "#4b5563",
            fontSize: "14px",
            lineHeight: "1.6"
          },
          children: [/* @__PURE__ */ jsx("p", {
            style: {
              marginBottom: "16px"
            },
            children: "Need help setting up OrderEase or configuring your self-serve editing rules? Our team is here to assist you!"
          }), /* @__PURE__ */ jsxs("div", {
            style: {
              background: "#f3f4f6",
              padding: "16px",
              borderRadius: "8px",
              marginBottom: "16px"
            },
            children: [/* @__PURE__ */ jsx("div", {
              style: {
                fontWeight: 600,
                color: "#111827",
                marginBottom: "4px"
              },
              children: "Email Support"
            }), /* @__PURE__ */ jsx("div", {
              children: "support@orderease.io"
            }), /* @__PURE__ */ jsx("div", {
              style: {
                fontSize: "12.5px",
                color: "#6b7280",
                marginTop: "4px"
              },
              children: "Response time: Usually within a few hours"
            })]
          }), /* @__PURE__ */ jsx("p", {
            style: {
              fontSize: "13px",
              color: "#6b7280"
            },
            children: "You can also use the live chat widget at the bottom right corner of the page to speak with a specialist immediately."
          })]
        })]
      })
    })]
  });
});
const route24 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: route,
  loader: loader$6,
  meta
}, Symbol.toStringTag, { value: "Module" }));
const loader$5 = async ({
  request
}) => {
  await authenticate.admin(request);
  return null;
};
const headers$4 = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const route25 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  headers: headers$4,
  loader: loader$5
}, Symbol.toStringTag, { value: "Module" }));
const loader$4 = async ({
  request
}) => {
  await authenticate.admin(request);
  return {
    apiKey: process.env.SHOPIFY_API_KEY || ""
  };
};
const app = UNSAFE_withComponentProps(function App3() {
  const {
    apiKey
  } = useLoaderData();
  return /* @__PURE__ */ jsxs(AppProvider, {
    embedded: true,
    apiKey,
    children: [/* @__PURE__ */ jsxs("s-app-nav", {
      children: [/* @__PURE__ */ jsx("s-link", {
        href: "/app/active-services",
        children: "Active Services"
      }), /* @__PURE__ */ jsx("s-link", {
        href: "/app/insights",
        children: "Insights"
      }), /* @__PURE__ */ jsx("s-link", {
        href: "/app/help",
        children: "Help & Guide"
      })]
    }), /* @__PURE__ */ jsx(Outlet, {})]
  });
});
const ErrorBoundary = UNSAFE_withErrorBoundaryProps(function ErrorBoundary2() {
  return boundary.error(useRouteError());
});
const headers$3 = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const route26 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ErrorBoundary,
  default: app,
  headers: headers$3,
  loader: loader$4
}, Symbol.toStringTag, { value: "Module" }));
const SSwitch = "s-switch";
const GET_PRODUCTS_QUERY = `#graphql
  query GetProductsForUpsellTags($query: String, $first: Int!) {
    products(first: $first, query: $query) {
      edges {
        node {
          id
          title
          handle
          tags
          featuredMedia {
            preview {
              image {
                url
                altText
              }
            }
          }
        }
      }
    }
  }
`;
const ADD_TAGS_MUTATION = `#graphql
  mutation AddProductTags($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) {
      node {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;
const REMOVE_TAGS_MUTATION = `#graphql
  mutation RemoveProductTags($id: ID!, $tags: [String!]!) {
    tagsRemove(id: $id, tags: $tags) {
      node {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;
const SERVICES = [{
  id: "add-product",
  title: "Add Product to Order",
  description: "Allow customers to add new products or additional items to their unfulfilled order.",
  category: "Item Management"
}, {
  id: "product-upsell",
  title: "Product Upsell & Recommendations",
  description: "Offer smart product recommendations and upsells directly on the order edit page.",
  category: "Revenue & Growth"
}, {
  id: "edit-quantity",
  title: "Edit Product Quantity",
  description: "Let customers increase or decrease quantities of line items in existing orders.",
  category: "Item Management"
}, {
  id: "swap-variant",
  title: "Swap Product Variant",
  description: "Enable customers to switch product size, color, or variant options easily.",
  category: "Item Management"
}, {
  id: "bulk-update",
  title: "Bulk Update Order Items",
  description: "Allow customers to bulk add, adjust quantities, swap variants, or replace items via CSV upload.",
  category: "Item Management"
}, {
  id: "change-address",
  title: "Change Shipping Address",
  description: "Allow customers to update their delivery address before order dispatch.",
  category: "Shipping & Delivery"
}, {
  id: "change-shipping-method",
  title: "Change Shipping Method",
  description: "Let customers upgrade or change their selected shipping method and speed.",
  category: "Shipping & Delivery"
}, {
  id: "order-note",
  title: "Add / Edit Order Note",
  description: "Allow customers to leave special instructions, gift notes, or delivery hints.",
  category: "Communication"
}, {
  id: "contact-info",
  title: "Update Contact Information",
  description: "Enable customers to update email address or phone number on pending orders.",
  category: "Account & Contact"
}, {
  id: "apply-discount",
  title: "Apply Discount Code",
  description: "Allow customers to apply coupon codes or promotional discounts to active orders.",
  category: "Promotions"
}, {
  id: "cancel-order",
  title: "Cancel Order",
  description: "Provide self-serve order cancellation within merchant-defined time limits.",
  category: "Order Management"
}, {
  id: "download-invoice",
  title: "Download & Print Invoice",
  description: "Provide downloadable PDF invoices on customer order status pages.",
  category: "Billing & Receipts"
}];
const loader$3 = async ({
  request
}) => {
  const {
    admin,
    session
  } = await authenticate.admin(request);
  const shop = session.shop.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase().trim();
  let rows = await prisma.serviceSettings.findMany({
    where: {
      shop
    }
  });
  const existingIds = new Set(rows.map((r) => r.id));
  const missingServices = SERVICES.filter((s) => !existingIds.has(s.id));
  if (missingServices.length > 0) {
    console.log(`[ActiveServices Loader] Seeding ${missingServices.length} missing services in DB with enabled=false for shop ${shop}`);
    await prisma.serviceSettings.createMany({
      data: missingServices.map((s) => ({
        id: s.id,
        shop,
        enabled: false
      }))
    });
    rows = await prisma.serviceSettings.findMany({
      where: {
        shop
      }
    });
  }
  const dbMap = {};
  rows.forEach((row) => {
    dbMap[row.id] = row.enabled;
  });
  const services = SERVICES.map((s) => ({
    ...s,
    enabled: dbMap[s.id] ?? false
  }));
  let timeLimitRecord = await prisma.orderEditTimeLimit.findUnique({
    where: {
      shop
    }
  });
  if (!timeLimitRecord) {
    timeLimitRecord = await prisma.orderEditTimeLimit.create({
      data: {
        shop,
        timeLimit: "1h",
        customValue: 1,
        customUnit: "hours"
      }
    });
  }
  const googleConfig = await prisma.googlePlacesConfig.findUnique({
    where: {
      shop
    }
  });
  const initialProducts = [];
  return {
    shop,
    services,
    timeLimitSettings: {
      timeLimit: timeLimitRecord.timeLimit,
      customValue: timeLimitRecord.customValue ?? 1,
      customUnit: timeLimitRecord.customUnit ?? "hours",
      maxEdits: timeLimitRecord.maxEdits ?? null
    },
    hasGoogleApiKey: Boolean((googleConfig == null ? void 0 : googleConfig.apiKey) && googleConfig.apiKey.trim().length > 0),
    initialProducts
  };
};
const action = async ({
  request
}) => {
  var _a2, _b, _c, _d, _e, _f, _g, _h, _i;
  const {
    admin,
    session
  } = await authenticate.admin(request);
  const shop = session.shop.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase().trim();
  const formData = await request.formData();
  const intent = formData.get("intent");
  if (intent === "addProductTag") {
    const productId = formData.get("productId");
    const tag = (_a2 = formData.get("tag")) == null ? void 0 : _a2.trim();
    if (!productId || !tag) {
      return {
        ok: false,
        error: "Product ID and Tag are required"
      };
    }
    console.log(`[ActiveServices Action] Adding tag "${tag}" to product ${productId}`);
    const res = await admin.graphql(ADD_TAGS_MUTATION, {
      variables: {
        id: productId,
        tags: [tag]
      }
    });
    const json = await res.json();
    const errors = ((_c = (_b = json.data) == null ? void 0 : _b.tagsAdd) == null ? void 0 : _c.userErrors) ?? [];
    if (errors.length > 0) {
      return {
        ok: false,
        error: errors[0].message
      };
    }
    return {
      ok: true,
      type: "productTag",
      action: "added",
      productId,
      tag
    };
  }
  if (intent === "removeProductTag") {
    const productId = formData.get("productId");
    const tag = (_d = formData.get("tag")) == null ? void 0 : _d.trim();
    if (!productId || !tag) {
      return {
        ok: false,
        error: "Product ID and Tag are required"
      };
    }
    console.log(`[ActiveServices Action] Removing tag "${tag}" from product ${productId}`);
    const res = await admin.graphql(REMOVE_TAGS_MUTATION, {
      variables: {
        id: productId,
        tags: [tag]
      }
    });
    const json = await res.json();
    const errors = ((_f = (_e = json.data) == null ? void 0 : _e.tagsRemove) == null ? void 0 : _f.userErrors) ?? [];
    if (errors.length > 0) {
      return {
        ok: false,
        error: errors[0].message
      };
    }
    return {
      ok: true,
      type: "productTag",
      action: "removed",
      productId,
      tag
    };
  }
  if (intent === "searchProducts") {
    const query = ((_g = formData.get("query")) == null ? void 0 : _g.trim()) || "";
    console.log(`[ActiveServices Action] Searching products with query "${query}"`);
    const res = await admin.graphql(GET_PRODUCTS_QUERY, {
      variables: {
        first: 12,
        query: query ? `title:*${query}* OR tag:*${query}*` : void 0
      }
    });
    const json = await res.json();
    const edges = ((_i = (_h = json.data) == null ? void 0 : _h.products) == null ? void 0 : _i.edges) ?? [];
    const products = edges.map((e) => {
      var _a3, _b2, _c2;
      return {
        id: e.node.id,
        title: e.node.title,
        handle: e.node.handle,
        tags: e.node.tags || [],
        imageUrl: ((_c2 = (_b2 = (_a3 = e.node.featuredMedia) == null ? void 0 : _a3.preview) == null ? void 0 : _b2.image) == null ? void 0 : _c2.url) || ""
      };
    });
    return {
      ok: true,
      type: "searchProducts",
      products
    };
  }
  if (intent === "saveGoogleApiKey") {
    const apiKeyRaw = formData.get("googleApiKey");
    const apiKey = apiKeyRaw ? apiKeyRaw.trim() : null;
    if (!apiKey) {
      return {
        ok: false,
        type: "googleApiKey",
        error: "Enter a Google Places API key to save, or use Delete Key to remove the saved key."
      };
    }
    console.log(`[ActiveServices Action] Saving Google Places API Key: shop=${shop}, hasKey=${Boolean(apiKey)}`);
    await prisma.googlePlacesConfig.upsert({
      where: {
        shop
      },
      create: {
        shop,
        apiKey
      },
      update: {
        apiKey
      }
    });
    return {
      ok: true,
      type: "googleApiKey",
      action: "saved",
      hasGoogleApiKey: true
    };
  }
  if (intent === "deleteGoogleApiKey") {
    console.log(`[ActiveServices Action] Deleting Google Places API Key for shop=${shop}`);
    try {
      await prisma.googlePlacesConfig.delete({
        where: {
          shop
        }
      });
    } catch (e) {
      await prisma.googlePlacesConfig.upsert({
        where: {
          shop
        },
        create: {
          shop,
          apiKey: null
        },
        update: {
          apiKey: null
        }
      });
    }
    return {
      ok: true,
      type: "googleApiKey",
      action: "deleted"
    };
  }
  if (intent === "saveMaxEdits") {
    const maxEditsStr = formData.get("maxEdits");
    const maxEdits = !maxEditsStr || maxEditsStr === "0" || maxEditsStr === "unlimited" ? 0 : parseInt(maxEditsStr, 10);
    console.log(`[ActiveServices Action] Saving max edits limit: shop=${shop}, maxEdits=${maxEdits}`);
    const timeLimitRecord = await prisma.orderEditTimeLimit.upsert({
      where: {
        shop
      },
      create: {
        shop,
        maxEdits
      },
      update: {
        maxEdits
      }
    });
    return {
      ok: true,
      type: "maxEdits",
      result: timeLimitRecord
    };
  }
  if (intent === "saveTimeLimit") {
    const timeLimit = formData.get("timeLimit") || "1h";
    const customValueStr = formData.get("customValue");
    const customUnit = formData.get("customUnit") || "hours";
    const customValue = customValueStr ? parseInt(customValueStr, 10) : null;
    console.log(`[ActiveServices Action] Saving time limit setting: shop=${shop}, timeLimit=${timeLimit}, customValue=${customValue}, customUnit=${customUnit}`);
    const timeLimitRecord = await prisma.orderEditTimeLimit.upsert({
      where: {
        shop
      },
      create: {
        shop,
        timeLimit,
        customValue,
        customUnit
      },
      update: {
        timeLimit,
        customValue,
        customUnit
      }
    });
    return {
      ok: true,
      type: "timeLimit",
      result: timeLimitRecord
    };
  }
  const serviceId = formData.get("serviceId");
  const enabledStr = formData.get("enabled");
  const enabled = enabledStr === "true";
  console.log(`[ActiveServices Action] Saving service setting: shop=${shop}, serviceId=${serviceId}, enabled=${enabled}`);
  if (!serviceId) {
    return {
      ok: false,
      error: "Missing serviceId"
    };
  }
  const result = await prisma.serviceSettings.upsert({
    where: {
      shop_id: {
        shop,
        id: serviceId
      }
    },
    create: {
      id: serviceId,
      shop,
      enabled
    },
    update: {
      enabled
    }
  });
  return {
    ok: true,
    type: "service",
    result
  };
};
const headers$2 = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const app_activeServices = UNSAFE_withComponentProps(function ActiveServicesPage() {
  const {
    services,
    timeLimitSettings,
    hasGoogleApiKey,
    initialProducts
  } = useLoaderData();
  return /* @__PURE__ */ jsxs("s-page", {
    heading: "Active Services",
    children: [/* @__PURE__ */ jsx("s-section", {
      heading: "Order Edit App Capabilities",
      children: /* @__PURE__ */ jsx("s-paragraph", {
        children: "Manage and monitor all active customer-facing services provided by your Order Edit App. Use the toggles on the right to enable or disable specific functionalities for your store customers."
      })
    }), /* @__PURE__ */ jsx(ProductTagsSection, {
      initialProducts
    }), /* @__PURE__ */ jsx(GoogleApiKeySection, {
      initialHasKey: hasGoogleApiKey
    }), /* @__PURE__ */ jsx(MaxEditsSection, {
      initialMaxEdits: timeLimitSettings.maxEdits
    }), /* @__PURE__ */ jsx(TimeLimitSection, {
      initialSettings: timeLimitSettings
    }), /* @__PURE__ */ jsx("s-section", {
      heading: "Services Overview",
      children: /* @__PURE__ */ jsx("s-stack", {
        direction: "block",
        gap: "base",
        children: services.map((service) => /* @__PURE__ */ jsx(ServiceRow, {
          id: service.id,
          title: service.title,
          description: service.description,
          category: service.category,
          enabled: service.enabled
        }, service.id))
      })
    })]
  });
});
const MAX_EDITS_PRESETS = [{
  value: "1",
  label: "1 Edit"
}, {
  value: "2",
  label: "2 Edits"
}, {
  value: "3",
  label: "3 Edits"
}, {
  value: "5",
  label: "5 Edits"
}, {
  value: "unlimited",
  label: "Unlimited"
}, {
  value: "custom",
  label: "Custom Limit"
}];
const getMaxEditsPreset = (val) => {
  if (val === null || val === void 0 || val === 0) {
    return "unlimited";
  }
  const num = Number(val);
  if ([1, 2, 3, 5].includes(num)) {
    return String(num);
  }
  return "custom";
};
function MaxEditsSection({
  initialMaxEdits
}) {
  const fetcher = useFetcher();
  const initialPreset = getMaxEditsPreset(initialMaxEdits);
  const lastSavedPresetRef = useRef(null);
  const [selectedPreset, setSelectedPreset] = useState(initialPreset);
  const [customVal, setCustomVal] = useState(typeof initialMaxEdits === "number" && initialMaxEdits > 0 ? initialMaxEdits : 3);
  const [isSaved, setIsSaved] = useState(false);
  useEffect(() => {
    if (lastSavedPresetRef.current === null) {
      setSelectedPreset(getMaxEditsPreset(initialMaxEdits));
      if (typeof initialMaxEdits === "number" && initialMaxEdits > 0) {
        setCustomVal(initialMaxEdits);
      }
    }
  }, [initialMaxEdits]);
  useEffect(() => {
    var _a2, _b, _c, _d;
    if (fetcher.state === "submitting") {
      return;
    }
    if (fetcher.state === "idle" && ((_a2 = fetcher.data) == null ? void 0 : _a2.ok) && ((_b = fetcher.data) == null ? void 0 : _b.type) === "maxEdits") {
      const savedMax = (_c = fetcher.data.result) == null ? void 0 : _c.maxEdits;
      const savedPreset = getMaxEditsPreset(savedMax);
      lastSavedPresetRef.current = savedPreset;
      setSelectedPreset(savedPreset);
      if (typeof savedMax === "number" && savedMax > 0) {
        setCustomVal(savedMax);
      }
      setIsSaved(true);
      if (typeof window !== "undefined" && ((_d = window.shopify) == null ? void 0 : _d.toast)) {
        window.shopify.toast.show("Maximum order edit limit updated successfully!");
      }
      const timer = setTimeout(() => {
        setIsSaved(false);
        lastSavedPresetRef.current = null;
      }, 4e3);
      return () => clearTimeout(timer);
    }
  }, [fetcher.state, fetcher.data]);
  const handleSave = (preset, cVal) => {
    lastSavedPresetRef.current = preset;
    let valToSend = preset;
    if (preset === "custom") {
      valToSend = String(cVal ?? customVal);
    }
    fetcher.submit({
      intent: "saveMaxEdits",
      maxEdits: valToSend
    }, {
      method: "post"
    });
  };
  return /* @__PURE__ */ jsx("s-section", {
    heading: "Maximum Order Edits Allowed",
    children: /* @__PURE__ */ jsx("s-box", {
      padding: "large",
      border: "base",
      borderRadius: "base",
      background: "subdued",
      children: /* @__PURE__ */ jsxs("s-stack", {
        direction: "block",
        gap: "large",
        children: [/* @__PURE__ */ jsxs("s-stack", {
          direction: "block",
          gap: "small",
          children: [/* @__PURE__ */ jsx("s-text", {
            type: "strong",
            children: "Maximum Allowed Edits Per Order"
          }), /* @__PURE__ */ jsx("s-paragraph", {
            color: "subdued",
            children: "Set the maximum number of edit actions a customer can perform on a single order (e.g. 3 edits max). Once this edit count is reached, order editing will be disabled. PDF Invoice downloads will always remain available."
          })]
        }), /* @__PURE__ */ jsxs("s-stack", {
          direction: "block",
          gap: "small",
          children: [/* @__PURE__ */ jsx("s-text", {
            type: "strong",
            children: "Limit Options"
          }), /* @__PURE__ */ jsx("s-grid", {
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: "small",
            children: MAX_EDITS_PRESETS.map((preset) => {
              const isActive = selectedPreset === preset.value;
              return /* @__PURE__ */ jsx("button", {
                type: "button",
                style: {
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: isActive ? "2px solid #008060" : "1px solid #c9cccf",
                  backgroundColor: isActive ? "#eaf4f0" : "#ffffff",
                  color: isActive ? "#004c3f" : "#202223",
                  fontWeight: isActive ? "600" : "400",
                  cursor: "pointer",
                  textAlign: "center",
                  transition: "all 0.15s ease-in-out"
                },
                onClick: () => {
                  setSelectedPreset(preset.value);
                  if (preset.value !== "custom") {
                    handleSave(preset.value);
                  }
                },
                children: preset.label
              }, preset.value);
            })
          })]
        }), selectedPreset === "custom" && /* @__PURE__ */ jsx("s-box", {
          padding: "base",
          border: "base",
          borderRadius: "base",
          children: /* @__PURE__ */ jsxs("s-stack", {
            direction: "block",
            gap: "base",
            children: [/* @__PURE__ */ jsx("s-text", {
              type: "strong",
              children: "Custom Max Edits Limit"
            }), /* @__PURE__ */ jsxs("div", {
              style: {
                display: "flex",
                gap: "12px",
                alignItems: "flex-end"
              },
              children: [/* @__PURE__ */ jsxs("div", {
                style: {
                  flex: 1
                },
                children: [/* @__PURE__ */ jsx("s-text", {
                  color: "subdued",
                  children: "Number of Edits Allowed"
                }), /* @__PURE__ */ jsx("input", {
                  type: "number",
                  min: "1",
                  value: customVal,
                  onChange: (e) => setCustomVal(Math.max(1, parseInt(e.target.value, 10) || 1)),
                  style: {
                    marginTop: "6px",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #c9cccf",
                    fontSize: "14px",
                    width: "100%",
                    boxSizing: "border-box"
                  }
                })]
              }), /* @__PURE__ */ jsx("button", {
                type: "button",
                onClick: () => handleSave("custom", customVal),
                style: {
                  padding: "9px 18px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: "#008060",
                  color: "#ffffff",
                  fontWeight: "600",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  height: "36px",
                  flexShrink: 0
                },
                children: "Save Limit"
              })]
            })]
          })
        }), isSaved && /* @__PURE__ */ jsx("s-banner", {
          tone: "success",
          children: "Maximum order edit limit saved successfully!"
        })]
      })
    })
  });
}
const TIME_LIMIT_PRESETS = [{
  value: "30m",
  label: "30 Minutes"
}, {
  value: "1h",
  label: "1 Hour"
}, {
  value: "2h",
  label: "2 Hours"
}, {
  value: "1d",
  label: "1 Day"
}, {
  value: "2d",
  label: "2 Days"
}, {
  value: "custom",
  label: "Custom Time"
}];
function TimeLimitSection({
  initialSettings
}) {
  const fetcher = useFetcher();
  const [selectedPreset, setSelectedPreset] = useEffectState(initialSettings.timeLimit || "1h");
  const [customVal, setCustomVal] = useEffectState(initialSettings.customValue || 1);
  const [customUnitVal, setCustomUnitVal] = useEffectState(initialSettings.customUnit || "hours");
  const [isSaved, setIsSaved] = useEffectState(false);
  useEffect(() => {
    setSelectedPreset(initialSettings.timeLimit || "1h");
    setCustomVal(initialSettings.customValue || 1);
    setCustomUnitVal(initialSettings.customUnit || "hours");
  }, [initialSettings]);
  useEffect(() => {
    var _a2, _b, _c;
    if (fetcher.state === "idle" && ((_a2 = fetcher.data) == null ? void 0 : _a2.ok) && ((_b = fetcher.data) == null ? void 0 : _b.type) === "timeLimit") {
      setIsSaved(true);
      if (typeof window !== "undefined" && ((_c = window.shopify) == null ? void 0 : _c.toast)) {
        window.shopify.toast.show("Order edit time limit updated successfully!");
      }
      const timer = setTimeout(() => setIsSaved(false), 4e3);
      return () => clearTimeout(timer);
    }
  }, [fetcher.state, fetcher.data]);
  const handleSave = (preset, cVal, cUnit) => {
    fetcher.submit({
      intent: "saveTimeLimit",
      timeLimit: preset,
      customValue: String(cVal ?? customVal),
      customUnit: cUnit ?? customUnitVal
    }, {
      method: "post"
    });
  };
  return /* @__PURE__ */ jsx("s-section", {
    heading: "Order Edit Time Limit",
    children: /* @__PURE__ */ jsx("s-box", {
      padding: "large",
      border: "base",
      borderRadius: "base",
      background: "subdued",
      children: /* @__PURE__ */ jsxs("s-stack", {
        direction: "block",
        gap: "large",
        children: [/* @__PURE__ */ jsxs("s-stack", {
          direction: "block",
          gap: "small",
          children: [/* @__PURE__ */ jsx("s-text", {
            type: "strong",
            children: "Maximum Allowed Time for Order Edits"
          }), /* @__PURE__ */ jsx("s-paragraph", {
            color: "subdued",
            children: "Set how long after placing an order a customer is permitted to edit their order. Once this time window expires, editing will be disabled."
          })]
        }), /* @__PURE__ */ jsxs("s-stack", {
          direction: "block",
          gap: "small",
          children: [/* @__PURE__ */ jsx("s-text", {
            type: "strong",
            children: "Preset Options"
          }), /* @__PURE__ */ jsx("s-grid", {
            gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
            gap: "small",
            children: TIME_LIMIT_PRESETS.map((preset) => {
              const isActive = selectedPreset === preset.value;
              return /* @__PURE__ */ jsx("button", {
                type: "button",
                style: {
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: isActive ? "2px solid #008060" : "1px solid #c9cccf",
                  backgroundColor: isActive ? "#eaf4f0" : "#ffffff",
                  color: isActive ? "#004c3f" : "#202223",
                  fontWeight: isActive ? "600" : "400",
                  cursor: "pointer",
                  textAlign: "center",
                  transition: "all 0.15s ease-in-out"
                },
                onClick: () => {
                  setSelectedPreset(preset.value);
                  handleSave(preset.value);
                },
                children: preset.label
              }, preset.value);
            })
          })]
        }), selectedPreset === "custom" && /* @__PURE__ */ jsx("s-box", {
          padding: "base",
          border: "base",
          borderRadius: "base",
          children: /* @__PURE__ */ jsxs("s-stack", {
            direction: "block",
            gap: "base",
            children: [/* @__PURE__ */ jsx("s-text", {
              type: "strong",
              children: "Custom Duration"
            }), /* @__PURE__ */ jsxs("div", {
              style: {
                display: "flex",
                gap: "12px",
                alignItems: "flex-end",
                flexWrap: "wrap"
              },
              children: [/* @__PURE__ */ jsxs("div", {
                style: {
                  flex: 1,
                  minWidth: "140px"
                },
                children: [/* @__PURE__ */ jsx("s-text", {
                  color: "subdued",
                  children: "Duration Value"
                }), /* @__PURE__ */ jsx("input", {
                  type: "number",
                  min: "1",
                  value: customVal,
                  onChange: (e) => setCustomVal(Math.max(1, parseInt(e.target.value, 10) || 1)),
                  style: {
                    marginTop: "6px",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #c9cccf",
                    fontSize: "14px",
                    width: "100%",
                    boxSizing: "border-box"
                  }
                })]
              }), /* @__PURE__ */ jsxs("div", {
                style: {
                  flex: 1,
                  minWidth: "140px"
                },
                children: [/* @__PURE__ */ jsx("s-text", {
                  color: "subdued",
                  children: "Time Unit"
                }), /* @__PURE__ */ jsxs("select", {
                  value: customUnitVal,
                  onChange: (e) => setCustomUnitVal(e.target.value),
                  style: {
                    marginTop: "6px",
                    padding: "8px 12px",
                    borderRadius: "6px",
                    border: "1px solid #c9cccf",
                    fontSize: "14px",
                    width: "100%",
                    boxSizing: "border-box",
                    backgroundColor: "#ffffff"
                  },
                  children: [/* @__PURE__ */ jsx("option", {
                    value: "minutes",
                    children: "Minutes"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "hours",
                    children: "Hours"
                  }), /* @__PURE__ */ jsx("option", {
                    value: "days",
                    children: "Days"
                  })]
                })]
              }), /* @__PURE__ */ jsx("button", {
                type: "button",
                onClick: () => handleSave("custom", customVal, customUnitVal),
                style: {
                  padding: "9px 18px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: "#008060",
                  color: "#ffffff",
                  fontWeight: "600",
                  cursor: "pointer",
                  whiteSpace: "nowrap",
                  height: "36px",
                  flexShrink: 0
                },
                children: "Save Custom Limit"
              })]
            })]
          })
        }), isSaved && /* @__PURE__ */ jsx("s-banner", {
          tone: "success",
          children: "Time limit settings saved successfully!"
        })]
      })
    })
  });
}
function useEffectState(initialValue) {
  const [val, setVal] = useState(initialValue);
  return [val, setVal];
}
function ServiceRow({
  id,
  title,
  description,
  category,
  enabled
}) {
  var _a2;
  const fetcher = useFetcher();
  const switchRef = useRef(null);
  const optimisticEnabled = fetcher.state !== "idle" ? ((_a2 = fetcher.formData) == null ? void 0 : _a2.get("enabled")) === "true" : enabled;
  const toggleService = (nextState) => {
    console.log(`[ServiceRow] Toggling service ${id} to ${nextState}`);
    fetcher.submit({
      serviceId: id,
      enabled: String(nextState)
    }, {
      method: "post"
    });
  };
  useEffect(() => {
    const el = switchRef.current;
    if (!el) return;
    const handleCustomEvent = (e) => {
      e.stopPropagation();
      const target = e.target;
      const newChecked = target.checked !== void 0 ? target.checked : !optimisticEnabled;
      toggleService(newChecked);
    };
    el.addEventListener("change", handleCustomEvent);
    return () => {
      el.removeEventListener("change", handleCustomEvent);
    };
  }, [id, optimisticEnabled]);
  return /* @__PURE__ */ jsx("s-box", {
    padding: "base",
    border: "base",
    borderRadius: "base",
    background: "subdued",
    children: /* @__PURE__ */ jsxs("s-grid", {
      gridTemplateColumns: "1fr auto",
      alignItems: "center",
      gap: "base",
      children: [/* @__PURE__ */ jsxs("s-stack", {
        direction: "block",
        gap: "base",
        children: [/* @__PURE__ */ jsxs("s-stack", {
          direction: "inline",
          alignItems: "center",
          gap: "base",
          children: [/* @__PURE__ */ jsx("s-text", {
            type: "strong",
            children: title
          }), /* @__PURE__ */ jsx("s-badge", {
            tone: optimisticEnabled ? "success" : "neutral",
            children: category
          })]
        }), /* @__PURE__ */ jsx("s-paragraph", {
          color: "subdued",
          children: description
        })]
      }), /* @__PURE__ */ jsx("s-badge", {
        tone: optimisticEnabled ? "success" : "neutral",
        children: /* @__PURE__ */ jsx(SSwitch, {
          tone: optimisticEnabled ? "success" : "neutral",
          ref: switchRef,
          label: optimisticEnabled ? "Active" : "Inactive",
          name: id,
          checked: optimisticEnabled,
          onClick: () => {
            if (fetcher.state === "idle") {
              toggleService(!optimisticEnabled);
            }
          }
        })
      })]
    })
  });
}
function GoogleApiKeySection({
  initialHasKey
}) {
  var _a2, _b;
  const fetcher = useFetcher();
  const [hasKey, setHasKey] = useState(initialHasKey);
  const [apiKey, setApiKey] = useEffectState("");
  const [showKey, setShowKey] = useState(false);
  const [isSaved, setIsSaved] = useEffectState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [lastAction, setLastAction] = useState(null);
  useEffect(() => {
    setHasKey(initialHasKey);
  }, [initialHasKey]);
  useEffect(() => {
    var _a3, _b2, _c, _d;
    if (fetcher.state === "idle" && ((_a3 = fetcher.data) == null ? void 0 : _a3.ok) && ((_b2 = fetcher.data) == null ? void 0 : _b2.type) === "googleApiKey") {
      setIsSaved(true);
      const isDeleted = ((_c = fetcher.data) == null ? void 0 : _c.action) === "deleted";
      setLastAction(isDeleted ? "deleted" : "saved");
      setHasKey(!isDeleted);
      setApiKey("");
      const msg = isDeleted ? "Google Places API key deleted successfully!" : "Google Places API key saved successfully!";
      setActionMessage(msg);
      if (typeof window !== "undefined" && ((_d = window.shopify) == null ? void 0 : _d.toast)) {
        window.shopify.toast.show(msg);
      }
      const timer = setTimeout(() => {
        setIsSaved(false);
        setLastAction(null);
      }, 4e3);
      return () => clearTimeout(timer);
    }
  }, [fetcher.state, fetcher.data]);
  const handleSave = () => {
    if (!apiKey.trim()) return;
    fetcher.submit({
      intent: "saveGoogleApiKey",
      googleApiKey: apiKey
    }, {
      method: "post"
    });
  };
  const handleDelete = () => {
    fetcher.submit({
      intent: "deleteGoogleApiKey"
    }, {
      method: "post"
    });
  };
  const isDeleting = fetcher.state !== "idle" && ((_a2 = fetcher.formData) == null ? void 0 : _a2.get("intent")) === "deleteGoogleApiKey";
  const isConfigured = hasKey || isDeleting;
  const showDeleteButton = isConfigured || isDeleting || isSaved && lastAction === "deleted";
  return /* @__PURE__ */ jsx("s-section", {
    heading: "Google Places & Location Suggestions",
    children: /* @__PURE__ */ jsx("s-box", {
      padding: "large",
      border: "base",
      borderRadius: "base",
      background: "subdued",
      children: /* @__PURE__ */ jsxs("s-stack", {
        direction: "block",
        gap: "large",
        children: [/* @__PURE__ */ jsxs("s-stack", {
          direction: "block",
          gap: "small",
          children: [/* @__PURE__ */ jsxs("s-stack", {
            direction: "inline",
            justifyContent: "space-between",
            alignItems: "center",
            children: [/* @__PURE__ */ jsx("s-text", {
              type: "strong",
              children: "🔑 Google Places API Key"
            }), /* @__PURE__ */ jsx("s-badge", {
              tone: isConfigured && !isDeleting && lastAction !== "deleted" ? "success" : "neutral",
              children: isConfigured && !isDeleting && lastAction !== "deleted" ? "Active (Autocomplete Enabled)" : "Disabled (No Key)"
            })]
          }), /* @__PURE__ */ jsx("s-paragraph", {
            color: "subdued",
            children: "Enter your Google Places & Geocoding API Key to enable instant location autocomplete and auto-filling address suggestions for your store customers. If left blank, the location suggestions section will be hidden on storefront address forms."
          })]
        }), /* @__PURE__ */ jsx("s-box", {
          padding: "base",
          border: "base",
          borderRadius: "base",
          background: "surface",
          children: /* @__PURE__ */ jsxs("s-stack", {
            direction: "block",
            gap: "base",
            children: [/* @__PURE__ */ jsx("s-text", {
              type: "strong",
              children: "Merchant API Key"
            }), /* @__PURE__ */ jsxs("div", {
              style: {
                display: "flex",
                gap: "12px",
                alignItems: "flex-end"
              },
              children: [/* @__PURE__ */ jsxs("div", {
                style: {
                  flex: 1
                },
                children: [/* @__PURE__ */ jsx("s-text", {
                  color: "subdued",
                  children: "API Key (Places API & Geocoding API enabled)"
                }), /* @__PURE__ */ jsxs("div", {
                  style: {
                    position: "relative",
                    marginTop: "6px"
                  },
                  children: [/* @__PURE__ */ jsx("input", {
                    type: showKey ? "text" : "password",
                    value: apiKey,
                    onChange: (e) => setApiKey(e.target.value),
                    placeholder: hasKey ? "API key saved — enter a new key to replace" : "e.g. AIzaSyD...",
                    style: {
                      padding: "8px 50px 8px 12px",
                      borderRadius: "6px",
                      border: "1px solid #c9cccf",
                      fontSize: "14px",
                      width: "100%",
                      height: "36px",
                      boxSizing: "border-box",
                      fontFamily: "monospace"
                    }
                  }), /* @__PURE__ */ jsx("button", {
                    type: "button",
                    onClick: () => setShowKey(!showKey),
                    style: {
                      position: "absolute",
                      right: "10px",
                      top: "50%",
                      transform: "translateY(-50%)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontSize: "13px",
                      color: "#5c5f62",
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                      lineHeight: 1
                    },
                    children: showKey ? "Hide" : "Show"
                  })]
                })]
              }), /* @__PURE__ */ jsx("button", {
                type: "button",
                onClick: handleSave,
                disabled: !apiKey.trim(),
                style: {
                  padding: "9px 20px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: "#008060",
                  color: "#ffffff",
                  fontWeight: "600",
                  cursor: apiKey.trim() ? "pointer" : "not-allowed",
                  opacity: apiKey.trim() ? 1 : 0.6,
                  whiteSpace: "nowrap",
                  height: "36px",
                  flexShrink: 0
                },
                children: fetcher.state !== "idle" && ((_b = fetcher.formData) == null ? void 0 : _b.get("intent")) === "saveGoogleApiKey" ? "Saving..." : "Save Key"
              }), showDeleteButton && /* @__PURE__ */ jsx("button", {
                type: "button",
                onClick: handleDelete,
                disabled: isDeleting,
                style: {
                  padding: "9px 20px",
                  borderRadius: "6px",
                  border: "none",
                  backgroundColor: "#d82c0d",
                  color: "#ffffff",
                  fontWeight: "600",
                  cursor: isDeleting ? "not-allowed" : "pointer",
                  whiteSpace: "nowrap",
                  height: "36px",
                  flexShrink: 0,
                  opacity: isDeleting ? 0.7 : 1
                },
                children: isDeleting ? "Deleting..." : "Delete Key"
              })]
            })]
          })
        }), isSaved && /* @__PURE__ */ jsx("s-banner", {
          tone: lastAction === "deleted" ? "critical" : "success",
          children: actionMessage
        })]
      })
    })
  });
}
function ProductTagsSection({
  initialProducts
}) {
  const [products, setProducts] = useState(initialProducts || []);
  const [searchQuery, setSearchQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [newTagsMap, setNewTagsMap] = useState({});
  const [bannerInfo, setBannerInfo] = useState(null);
  const searchFetcher = useFetcher();
  const tagFetcher = useFetcher();
  useEffect(() => {
    var _a2, _b;
    if (searchFetcher.state === "idle" && ((_a2 = searchFetcher.data) == null ? void 0 : _a2.ok) && ((_b = searchFetcher.data) == null ? void 0 : _b.type) === "searchProducts") {
      setProducts(searchFetcher.data.products || []);
      setHasSearched(true);
    }
  }, [searchFetcher.state, searchFetcher.data]);
  useEffect(() => {
    var _a2, _b;
    if (tagFetcher.state === "idle" && ((_a2 = tagFetcher.data) == null ? void 0 : _a2.ok) && ((_b = tagFetcher.data) == null ? void 0 : _b.type) === "productTag") {
      const {
        action: action2,
        productId,
        tag
      } = tagFetcher.data;
      setProducts((prev) => prev.map((p) => {
        if (p.id !== productId) return p;
        let updatedTags = [...p.tags];
        if (action2 === "added" && !updatedTags.includes(tag)) {
          updatedTags.push(tag);
        } else if (action2 === "removed") {
          updatedTags = updatedTags.filter((t) => t !== tag);
        }
        return {
          ...p,
          tags: updatedTags
        };
      }));
      setBannerInfo({
        msg: action2 === "added" ? `Added tag "${tag}" successfully!` : `Removed tag "${tag}" successfully!`,
        tone: action2 === "added" ? "success" : "critical"
      });
      const timer = setTimeout(() => setBannerInfo(null), 4e3);
      return () => clearTimeout(timer);
    }
  }, [tagFetcher.state, tagFetcher.data]);
  const handleSearch = (e) => {
    e.preventDefault();
    setHasSearched(true);
    searchFetcher.submit({
      intent: "searchProducts",
      query: searchQuery
    }, {
      method: "post"
    });
  };
  const handleAddTag = (productId, tagToAdd) => {
    if (!tagToAdd || !tagToAdd.trim()) return;
    const cleanTag = tagToAdd.trim();
    tagFetcher.submit({
      intent: "addProductTag",
      productId,
      tag: cleanTag
    }, {
      method: "post"
    });
    setNewTagsMap((prev) => ({
      ...prev,
      [productId]: ""
    }));
  };
  const handleRemoveTag = (productId, tagToRemove) => {
    tagFetcher.submit({
      intent: "removeProductTag",
      productId,
      tag: tagToRemove
    }, {
      method: "post"
    });
  };
  return /* @__PURE__ */ jsx("s-section", {
    heading: "Product Tags & Upsell Management",
    children: /* @__PURE__ */ jsx("s-box", {
      padding: "large",
      border: "base",
      borderRadius: "base",
      background: "subdued",
      children: /* @__PURE__ */ jsxs("s-stack", {
        direction: "block",
        gap: "large",
        children: [/* @__PURE__ */ jsxs("s-stack", {
          direction: "block",
          gap: "small",
          children: [/* @__PURE__ */ jsx("s-text", {
            type: "strong",
            children: "🏷️ Configure Product Tags for Upsell Recommendations"
          }), /* @__PURE__ */ jsx("s-paragraph", {
            color: "subdued",
            children: "Organize your product catalog by managing product tags. The OrderEase Upsell feature automatically pairs items in a customer's order tagged with [tag] with recommendation products tagged with [tag]-upshell."
          })]
        }), bannerInfo ? /* @__PURE__ */ jsx("s-banner", {
          tone: bannerInfo.tone,
          children: bannerInfo.msg
        }) : null, /* @__PURE__ */ jsxs("form", {
          onSubmit: handleSearch,
          style: {
            display: "flex",
            gap: "10px"
          },
          children: [/* @__PURE__ */ jsx("input", {
            type: "text",
            placeholder: "Search products by title or tag...",
            value: searchQuery,
            onChange: (e) => setSearchQuery(e.target.value),
            style: {
              flex: 1,
              padding: "8px 12px",
              borderRadius: "6px",
              border: "1px solid #c9cccf",
              fontSize: "14px"
            }
          }), /* @__PURE__ */ jsx("button", {
            type: "submit",
            style: {
              padding: "8px 16px",
              borderRadius: "6px",
              border: "none",
              backgroundColor: "#008060",
              color: "#ffffff",
              fontWeight: "600",
              cursor: "pointer"
            },
            children: searchFetcher.state !== "idle" ? "Searching..." : "Search Products"
          })]
        }), /* @__PURE__ */ jsx("s-stack", {
          direction: "block",
          gap: "base",
          children: searchFetcher.state !== "idle" ? /* @__PURE__ */ jsx("s-box", {
            padding: "base",
            border: "base",
            borderRadius: "base",
            children: /* @__PURE__ */ jsx("s-paragraph", {
              color: "subdued",
              children: "⏳ Searching products..."
            })
          }) : !hasSearched ? /* @__PURE__ */ jsx("s-box", {
            padding: "base",
            border: "base",
            borderRadius: "base",
            children: /* @__PURE__ */ jsx("s-paragraph", {
              color: "subdued",
              children: "🔍 Search for a product by title or tag above to view and manage its tags."
            })
          }) : products.length === 0 ? /* @__PURE__ */ jsx("s-box", {
            padding: "base",
            border: "base",
            borderRadius: "base",
            children: /* @__PURE__ */ jsx("s-paragraph", {
              color: "subdued",
              children: "No products found. Try adjusting your search query."
            })
          }) : products.map((prod) => {
            const currentNewTag = newTagsMap[prod.id] || "";
            return /* @__PURE__ */ jsx("s-box", {
              padding: "base",
              border: "base",
              borderRadius: "base",
              children: /* @__PURE__ */ jsxs("s-grid", {
                gridTemplateColumns: "auto 1fr",
                gap: "base",
                alignItems: "start",
                children: [/* @__PURE__ */ jsx("div", {
                  style: {
                    width: "56px",
                    height: "56px",
                    borderRadius: "8px",
                    overflow: "hidden",
                    backgroundColor: "#f1f2f3",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1px solid #e1e3e5"
                  },
                  children: prod.imageUrl ? /* @__PURE__ */ jsx("img", {
                    src: prod.imageUrl,
                    alt: prod.title,
                    style: {
                      width: "100%",
                      height: "100%",
                      objectFit: "cover"
                    }
                  }) : /* @__PURE__ */ jsx("span", {
                    style: {
                      fontSize: "20px"
                    },
                    children: "📦"
                  })
                }), /* @__PURE__ */ jsxs("s-stack", {
                  direction: "block",
                  gap: "small",
                  children: [/* @__PURE__ */ jsx("s-text", {
                    type: "strong",
                    children: prod.title
                  }), /* @__PURE__ */ jsx("div", {
                    style: {
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "6px",
                      alignItems: "center"
                    },
                    children: prod.tags && prod.tags.length > 0 ? prod.tags.map((tag) => {
                      const isUpsellTag = tag.endsWith("-upshell");
                      return /* @__PURE__ */ jsxs("span", {
                        style: {
                          display: "inline-flex",
                          alignItems: "center",
                          gap: "6px",
                          padding: "3px 8px",
                          borderRadius: "12px",
                          backgroundColor: isUpsellTag ? "#eaf4f0" : "#f1f2f3",
                          color: isUpsellTag ? "#004c3f" : "#202223",
                          border: isUpsellTag ? "1px solid #95c9b4" : "1px solid #c9cccf",
                          fontSize: "12px",
                          fontWeight: isUpsellTag ? "600" : "500"
                        },
                        children: [isUpsellTag ? `⚡ ${tag}` : tag, /* @__PURE__ */ jsx("button", {
                          type: "button",
                          onClick: () => handleRemoveTag(prod.id, tag),
                          style: {
                            background: "none",
                            border: "none",
                            color: "#5c5f62",
                            cursor: "pointer",
                            fontSize: "13px",
                            padding: "0 2px",
                            lineHeight: 1
                          },
                          title: `Remove tag ${tag}`,
                          children: "×"
                        })]
                      }, tag);
                    }) : /* @__PURE__ */ jsx("s-text", {
                      color: "subdued",
                      children: "No tags assigned"
                    })
                  }), /* @__PURE__ */ jsxs("div", {
                    style: {
                      display: "flex",
                      gap: "8px",
                      marginTop: "4px",
                      flexWrap: "wrap"
                    },
                    children: [/* @__PURE__ */ jsx("input", {
                      type: "text",
                      placeholder: "Add tag (e.g. Summer or Summer-upshell)...",
                      value: currentNewTag,
                      onChange: (e) => setNewTagsMap((prev) => ({
                        ...prev,
                        [prod.id]: e.target.value
                      })),
                      onKeyDown: (e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          handleAddTag(prod.id, currentNewTag);
                        }
                      },
                      style: {
                        flex: 1,
                        minWidth: "180px",
                        padding: "6px 10px",
                        borderRadius: "6px",
                        border: "1px solid #c9cccf",
                        fontSize: "13px"
                      }
                    }), /* @__PURE__ */ jsx("button", {
                      type: "button",
                      onClick: () => handleAddTag(prod.id, currentNewTag),
                      disabled: !currentNewTag.trim(),
                      style: {
                        padding: "6px 12px",
                        borderRadius: "6px",
                        border: "none",
                        backgroundColor: "#008060",
                        color: "#ffffff",
                        fontSize: "13px",
                        fontWeight: "600",
                        cursor: currentNewTag.trim() ? "pointer" : "not-allowed",
                        opacity: currentNewTag.trim() ? 1 : 0.6
                      },
                      children: "+ Tag"
                    }), currentNewTag.trim() && !currentNewTag.trim().endsWith("-upshell") ? /* @__PURE__ */ jsxs("button", {
                      type: "button",
                      onClick: () => handleAddTag(prod.id, `${currentNewTag.trim()}-upshell`),
                      style: {
                        padding: "6px 12px",
                        borderRadius: "6px",
                        border: "1px solid #008060",
                        backgroundColor: "#eaf4f0",
                        color: "#004c3f",
                        fontSize: "13px",
                        fontWeight: "600",
                        cursor: "pointer"
                      },
                      children: ["+ Quick Add ", currentNewTag.trim(), "-upshell"]
                    }) : null]
                  })]
                })]
              })
            }, prod.id);
          })
        })]
      })
    })
  });
}
const route27 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  action,
  default: app_activeServices,
  headers: headers$2,
  loader: loader$3
}, Symbol.toStringTag, { value: "Module" }));
const app_additional = UNSAFE_withComponentProps(function AdditionalPage() {
  return /* @__PURE__ */ jsxs("s-page", {
    heading: "Additional page",
    children: [/* @__PURE__ */ jsxs("s-section", {
      heading: "Multiple pages",
      children: [/* @__PURE__ */ jsxs("s-paragraph", {
        children: ["The app template comes with an additional page which demonstrates how to create multiple pages within app navigation using", " ", /* @__PURE__ */ jsx("s-link", {
          href: "https://shopify.dev/docs/apps/tools/app-bridge",
          target: "_blank",
          children: "App Bridge"
        }), "."]
      }), /* @__PURE__ */ jsxs("s-paragraph", {
        children: ["To create your own page and have it show up in the app navigation, add a page inside ", /* @__PURE__ */ jsx("code", {
          children: "app/routes"
        }), ", and a link to it in the", " ", /* @__PURE__ */ jsx("code", {
          children: "<ui-nav-menu>"
        }), " component found in", " ", /* @__PURE__ */ jsx("code", {
          children: "app/routes/app.jsx"
        }), "."]
      })]
    }), /* @__PURE__ */ jsx("s-section", {
      slot: "aside",
      heading: "Resources",
      children: /* @__PURE__ */ jsx("s-unordered-list", {
        children: /* @__PURE__ */ jsx("s-list-item", {
          children: /* @__PURE__ */ jsx("s-link", {
            href: "https://shopify.dev/docs/apps/design-guidelines/navigation#app-nav",
            target: "_blank",
            children: "App nav best practices"
          })
        })
      })
    })]
  });
});
const route28 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: app_additional
}, Symbol.toStringTag, { value: "Module" }));
const ALL_SERVICES = [{
  id: "add-product",
  title: "Add Product to Order",
  category: "Item Management"
}, {
  id: "product-upsell",
  title: "Product Upsell & Recommendations",
  category: "Revenue & Growth"
}, {
  id: "edit-quantity",
  title: "Edit Product Quantity",
  category: "Item Management"
}, {
  id: "swap-variant",
  title: "Swap Product Variant",
  category: "Item Management"
}, {
  id: "bulk-update",
  title: "Bulk Update Order Items",
  category: "Item Management"
}, {
  id: "change-address",
  title: "Change Shipping Address",
  category: "Shipping & Delivery"
}, {
  id: "change-shipping-method",
  title: "Change Shipping Method",
  category: "Shipping & Delivery"
}, {
  id: "order-note",
  title: "Add / Edit Order Note",
  category: "Communication"
}, {
  id: "contact-info",
  title: "Update Contact Information",
  category: "Account & Contact"
}, {
  id: "apply-discount",
  title: "Apply Discount Code",
  category: "Promotions"
}, {
  id: "cancel-order",
  title: "Cancel Order",
  category: "Order Management"
}, {
  id: "download-invoice",
  title: "Download & Print Invoice",
  category: "Billing & Receipts"
}];
const loader$2 = async ({
  request
}) => {
  var _a2, _b, _c;
  const {
    admin,
    session
  } = await authenticate.admin(request);
  const shop = session.shop;
  const url = new URL(request.url);
  const initialRange = (url.searchParams.get("range") || "today").toLowerCase();
  let totalStoreOrders = 0;
  try {
    const ordersRes = await admin.graphql(`#graphql
      query getTotalOrdersCount {
        ordersCount(query: "status:open") {
          count
        }
      }`);
    const ordersJson = await ordersRes.json();
    totalStoreOrders = ((_b = (_a2 = ordersJson.data) == null ? void 0 : _a2.ordersCount) == null ? void 0 : _b.count) ?? 0;
  } catch (err) {
    console.error("[insights-loader] Error fetching orders count:", err);
  }
  const allEditedOrders = await prisma.editedOrder.findMany({
    where: {
      shop
    },
    orderBy: {
      createdAt: "desc"
    }
  });
  const uniqueOrderIds = Array.from(new Set(allEditedOrders.map((o) => o.orderId)));
  const gidsToFetch = uniqueOrderIds.map((id) => id.startsWith("gid://") ? id : `gid://shopify/Order/${id}`).slice(0, 100);
  const orderInfoMap = /* @__PURE__ */ new Map();
  if (gidsToFetch.length > 0) {
    try {
      const detailsRes = await admin.graphql(`#graphql
        query GetOrderDetailsForUpdates($ids: [ID!]!) {
          nodes(ids: $ids) {
            ... on Order {
              id
              name
              createdAt
              displayFinancialStatus
              displayFulfillmentStatus
              totalPriceSet {
                shopMoney {
                  amount
                  currencyCode
                }
              }
              customer {
                id
                displayName
                firstName
                lastName
                email
              }
            }
          }
        }`, {
        variables: {
          ids: gidsToFetch
        }
      });
      const detailsJson = await detailsRes.json();
      const nodes = ((_c = detailsJson.data) == null ? void 0 : _c.nodes) || [];
      for (const node of nodes) {
        if (node == null ? void 0 : node.id) {
          orderInfoMap.set(node.id, node);
          const numId = node.id.replace(/[^0-9]/g, "");
          if (numId) {
            orderInfoMap.set(numId, node);
          }
        }
      }
    } catch (err) {
      console.warn("[insights-loader] Error fetching batch order details:", err);
    }
  }
  const shopDomain = shop.replace(/^https?:\/\//, "");
  const shopName = shopDomain.split(".")[0];
  const enrichedEdits = allEditedOrders.map((record) => {
    var _a3, _b2, _c2, _d, _e, _f;
    const gid = record.orderId.startsWith("gid://") ? record.orderId : `gid://shopify/Order/${record.orderId}`;
    const numericId = record.orderId.replace(/[^0-9]/g, "");
    const orderInfo = orderInfoMap.get(gid) || orderInfoMap.get(numericId) || null;
    const customerName = ((_a3 = orderInfo == null ? void 0 : orderInfo.customer) == null ? void 0 : _a3.displayName) || [(_b2 = orderInfo == null ? void 0 : orderInfo.customer) == null ? void 0 : _b2.firstName, (_c2 = orderInfo == null ? void 0 : orderInfo.customer) == null ? void 0 : _c2.lastName].filter(Boolean).join(" ") || ((_d = orderInfo == null ? void 0 : orderInfo.customer) == null ? void 0 : _d.email) || "Customer";
    const orderTotal = ((_e = orderInfo == null ? void 0 : orderInfo.totalPriceSet) == null ? void 0 : _e.shopMoney) ? `${orderInfo.totalPriceSet.shopMoney.currencyCode} ${Number(orderInfo.totalPriceSet.shopMoney.amount).toFixed(2)}` : null;
    const adminOrderUrl = `https://admin.shopify.com/store/${shopName}/orders/${numericId}`;
    return {
      id: record.id,
      orderId: record.orderId,
      numericOrderId: numericId,
      orderName: (orderInfo == null ? void 0 : orderInfo.name) || `#${numericId.slice(-4) || numericId}`,
      customerName,
      customerEmail: ((_f = orderInfo == null ? void 0 : orderInfo.customer) == null ? void 0 : _f.email) || null,
      orderTotal,
      financialStatus: (orderInfo == null ? void 0 : orderInfo.displayFinancialStatus) || null,
      fulfillmentStatus: (orderInfo == null ? void 0 : orderInfo.displayFulfillmentStatus) || null,
      source: record.source,
      createdAt: record.createdAt.toISOString(),
      adminOrderUrl
    };
  });
  const now = /* @__PURE__ */ new Date();
  const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const dayOfWeek = now.getUTCDay();
  const diffToMonday = now.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const startOfWeek = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diffToMonday, 0, 0, 0, 0));
  const startOfMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  function buildPeriodStats(startDate) {
    const filtered = enrichedEdits.filter((item) => {
      if (!startDate) return true;
      return new Date(item.createdAt) >= startDate;
    });
    const uniqueOrders = new Set(filtered.map((o) => o.orderId));
    const customerAccountEditsCount = filtered.filter((o) => o.source === "customer_account_ui").length;
    const checkoutUiEditsCount = filtered.filter((o) => o.source === "checkout_ui").length;
    const totalEditsCount = filtered.length;
    const customerAccountPercent = totalEditsCount > 0 ? Math.round(customerAccountEditsCount / totalEditsCount * 100) : 0;
    const checkoutUiPercent = totalEditsCount > 0 ? Math.round(checkoutUiEditsCount / totalEditsCount * 100) : 0;
    return {
      totalEditedOrders: uniqueOrders.size,
      totalEditsCount,
      customerAccountEditsCount,
      checkoutUiEditsCount,
      customerAccountPercent,
      checkoutUiPercent,
      customerUpdates: filtered
    };
  }
  const filterStats = {
    today: buildPeriodStats(startOfToday),
    week: buildPeriodStats(startOfWeek),
    month: buildPeriodStats(startOfMonth),
    all: buildPeriodStats(null)
  };
  const serviceSettings = await prisma.serviceSettings.findMany({
    where: {
      shop
    }
  });
  const enabledMap = /* @__PURE__ */ new Map();
  serviceSettings.forEach((s) => enabledMap.set(s.id, s.enabled));
  const totalFeatures = ALL_SERVICES.length;
  const activeFeaturesCount = ALL_SERVICES.filter((s) => enabledMap.get(s.id) === true).length;
  const usageRecords = await prisma.featureUsage.findMany({
    where: {
      shop
    }
  });
  const usageMap = /* @__PURE__ */ new Map();
  usageRecords.forEach((u) => usageMap.set(u.featureId, u.usedCount));
  const featureUsageList = ALL_SERVICES.map((s) => ({
    id: s.id,
    title: s.title,
    category: s.category,
    active: enabledMap.get(s.id) ?? false,
    usageCount: usageMap.get(s.id) ?? 0
  }));
  return {
    shop,
    initialRange,
    filterStats,
    totalStoreOrders,
    activeFeaturesCount,
    totalFeatures,
    featureUsageList
  };
};
const headers$1 = (headersArgs) => {
  return boundary.headers(headersArgs);
};
function formatUpdateDate(isoString) {
  if (!isoString) return "";
  const date = new Date(isoString);
  const now = /* @__PURE__ */ new Date();
  const isToday = date.getUTCDate() === now.getUTCDate() && date.getUTCMonth() === now.getUTCMonth() && date.getUTCFullYear() === now.getUTCFullYear();
  const timeStr = date.toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit"
  });
  if (isToday) {
    return `Today at ${timeStr}`;
  }
  const dateStr = date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
  return `${dateStr} at ${timeStr}`;
}
const app_insights = UNSAFE_withComponentProps(function InsightsPage() {
  var _a2;
  const {
    initialRange,
    filterStats,
    totalStoreOrders,
    activeFeaturesCount,
    totalFeatures,
    featureUsageList
  } = useLoaderData();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlRange = (_a2 = searchParams.get("range")) == null ? void 0 : _a2.toLowerCase();
  const activeFilter = urlRange === "today" || urlRange === "week" || urlRange === "month" || urlRange === "all" ? urlRange : initialRange || "today";
  const handleFilterChange = (rangeKey) => {
    setSearchParams({
      range: rangeKey
    });
  };
  const currentData = filterStats[activeFilter] || filterStats.today;
  const timeframeLabels = {
    today: "Today",
    week: "This Week",
    month: "This Month",
    all: "All Time"
  };
  const timeframeLabel = timeframeLabels[activeFilter] || "Selected Period";
  return /* @__PURE__ */ jsxs("s-page", {
    heading: "Insights",
    children: [/* @__PURE__ */ jsx("s-section", {
      heading: "Analytics & Performance Overview",
      children: /* @__PURE__ */ jsx("s-paragraph", {
        color: "subdued",
        children: "Monitor customer-initiated order updates across your store. Filter by today, this week, or this month to track real-time edits, channel distribution, and feature usage."
      })
    }), /* @__PURE__ */ jsx("s-section", {
      heading: "Filter by Time Period",
      children: /* @__PURE__ */ jsx("s-box", {
        padding: "base",
        border: "base",
        borderRadius: "base",
        background: "subdued",
        children: /* @__PURE__ */ jsxs("s-stack", {
          direction: "inline",
          gap: "small",
          alignItems: "center",
          children: [/* @__PURE__ */ jsxs("s-button", {
            variant: activeFilter === "today" ? "primary" : "secondary",
            onClick: () => handleFilterChange("today"),
            children: ["Today (", filterStats.today.totalEditsCount, ")"]
          }), /* @__PURE__ */ jsxs("s-button", {
            variant: activeFilter === "week" ? "primary" : "secondary",
            onClick: () => handleFilterChange("week"),
            children: ["This Week (", filterStats.week.totalEditsCount, ")"]
          }), /* @__PURE__ */ jsxs("s-button", {
            variant: activeFilter === "month" ? "primary" : "secondary",
            onClick: () => handleFilterChange("month"),
            children: ["This Month (", filterStats.month.totalEditsCount, ")"]
          }), /* @__PURE__ */ jsxs("s-button", {
            variant: activeFilter === "all" ? "primary" : "secondary",
            onClick: () => handleFilterChange("all"),
            children: ["All Time (", filterStats.all.totalEditsCount, ")"]
          })]
        })
      })
    }), /* @__PURE__ */ jsx("s-section", {
      heading: `Key Metrics (${timeframeLabel})`,
      children: /* @__PURE__ */ jsxs("s-grid", {
        gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
        gap: "base",
        children: [/* @__PURE__ */ jsx("s-box", {
          padding: "large",
          border: "base",
          borderRadius: "base",
          children: /* @__PURE__ */ jsxs("s-stack", {
            direction: "block",
            gap: "small",
            children: [/* @__PURE__ */ jsxs("s-stack", {
              direction: "inline",
              justifyContent: "space-between",
              alignItems: "center",
              children: [/* @__PURE__ */ jsxs("s-text", {
                color: "subdued",
                children: ["Orders Edited (", timeframeLabel, ")"]
              }), /* @__PURE__ */ jsxs("s-badge", {
                tone: "success",
                children: [currentData.totalEditsCount, " edits"]
              })]
            }), /* @__PURE__ */ jsx("div", {
              style: {
                fontSize: "32px",
                fontWeight: "700",
                color: "#008060"
              },
              children: currentData.totalEditedOrders
            }), /* @__PURE__ */ jsxs("s-text", {
              size: "small",
              color: "subdued",
              children: ["Unique customer orders updated ", timeframeLabel.toLowerCase()]
            })]
          })
        }), /* @__PURE__ */ jsx("s-box", {
          padding: "large",
          border: "base",
          borderRadius: "base",
          children: /* @__PURE__ */ jsxs("s-stack", {
            direction: "block",
            gap: "small",
            children: [/* @__PURE__ */ jsx("s-text", {
              color: "subdued",
              children: "Total Open Orders"
            }), /* @__PURE__ */ jsx("div", {
              style: {
                fontSize: "32px",
                fontWeight: "700",
                color: "#1a1d1f"
              },
              children: totalStoreOrders
            }), /* @__PURE__ */ jsx("s-text", {
              size: "small",
              color: "subdued",
              children: "Active orders currently pending fulfillment"
            })]
          })
        }), /* @__PURE__ */ jsx("s-box", {
          padding: "large",
          border: "base",
          borderRadius: "base",
          children: /* @__PURE__ */ jsxs("s-stack", {
            direction: "block",
            gap: "small",
            children: [/* @__PURE__ */ jsx("s-text", {
              color: "subdued",
              children: "Active Features"
            }), /* @__PURE__ */ jsxs("div", {
              style: {
                fontSize: "32px",
                fontWeight: "700",
                color: "#2c6ecb"
              },
              children: [activeFeaturesCount, " ", /* @__PURE__ */ jsxs("span", {
                style: {
                  fontSize: "18px",
                  color: "#6d7175",
                  fontWeight: "400"
                },
                children: ["/ ", totalFeatures, " Enabled"]
              })]
            }), /* @__PURE__ */ jsx("s-text", {
              size: "small",
              color: "subdued",
              children: "Self-service features available to customers"
            })]
          })
        })]
      })
    }), /* @__PURE__ */ jsx("s-section", {
      heading: `Edit Location Breakdown (${timeframeLabel})`,
      children: /* @__PURE__ */ jsx("s-box", {
        padding: "large",
        border: "base",
        borderRadius: "base",
        children: /* @__PURE__ */ jsxs("s-stack", {
          direction: "block",
          gap: "large",
          children: [/* @__PURE__ */ jsxs("s-paragraph", {
            color: "subdued",
            children: ["Shows which UI interface customers used to edit their orders during ", timeframeLabel.toLowerCase(), "."]
          }), /* @__PURE__ */ jsxs("s-stack", {
            direction: "block",
            gap: "base",
            children: [/* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsxs("s-grid", {
                gridTemplateColumns: "1fr auto",
                alignItems: "center",
                children: [/* @__PURE__ */ jsx("s-text", {
                  type: "strong",
                  children: "Customer Account UI (Order Status Page)"
                }), /* @__PURE__ */ jsxs("s-text", {
                  type: "strong",
                  children: [currentData.customerAccountEditsCount, " edits (", currentData.customerAccountPercent, "%)"]
                })]
              }), /* @__PURE__ */ jsx("div", {
                style: {
                  height: "10px",
                  width: "100%",
                  backgroundColor: "#e1e3e5",
                  borderRadius: "5px",
                  overflow: "hidden"
                },
                children: /* @__PURE__ */ jsx("div", {
                  style: {
                    height: "100%",
                    width: `${currentData.customerAccountPercent}%`,
                    backgroundColor: "#008060",
                    borderRadius: "5px",
                    transition: "width 0.3s ease"
                  }
                })
              })]
            }), /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsxs("s-grid", {
                gridTemplateColumns: "1fr auto",
                alignItems: "center",
                children: [/* @__PURE__ */ jsx("s-text", {
                  type: "strong",
                  children: "Checkout UI (Thank-You Page)"
                }), /* @__PURE__ */ jsxs("s-text", {
                  type: "strong",
                  children: [currentData.checkoutUiEditsCount, " edits (", currentData.checkoutUiPercent, "%)"]
                })]
              }), /* @__PURE__ */ jsx("div", {
                style: {
                  height: "10px",
                  width: "100%",
                  backgroundColor: "#e1e3e5",
                  borderRadius: "5px",
                  overflow: "hidden"
                },
                children: /* @__PURE__ */ jsx("div", {
                  style: {
                    height: "100%",
                    width: `${currentData.checkoutUiPercent}%`,
                    backgroundColor: "#2c6ecb",
                    borderRadius: "5px",
                    transition: "width 0.3s ease"
                  }
                })
              })]
            })]
          })]
        })
      })
    }), /* @__PURE__ */ jsx("s-section", {
      heading: `Customer Order Updates (${currentData.customerUpdates.length})`,
      children: /* @__PURE__ */ jsx("s-box", {
        padding: "large",
        border: "base",
        borderRadius: "base",
        children: /* @__PURE__ */ jsxs("s-stack", {
          direction: "block",
          gap: "base",
          children: [/* @__PURE__ */ jsxs("s-stack", {
            direction: "inline",
            justifyContent: "space-between",
            alignItems: "center",
            children: [/* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsxs("s-text", {
                type: "strong",
                children: ["Recent Customer Modifications (", timeframeLabel, ")"]
              }), /* @__PURE__ */ jsxs("s-paragraph", {
                color: "subdued",
                children: ["Itemized list of customer order modifications performed ", timeframeLabel.toLowerCase(), "."]
              })]
            }), /* @__PURE__ */ jsxs("s-badge", {
              tone: currentData.customerUpdates.length > 0 ? "success" : "neutral",
              children: [currentData.customerUpdates.length, " Record", currentData.customerUpdates.length !== 1 ? "s" : ""]
            })]
          }), /* @__PURE__ */ jsx("s-divider", {}), currentData.customerUpdates.length === 0 ? /* @__PURE__ */ jsx("s-box", {
            padding: "large",
            background: "subdued",
            borderRadius: "base",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              alignItems: "center",
              children: [/* @__PURE__ */ jsxs("s-text", {
                type: "strong",
                children: ["No customer order updates for ", timeframeLabel.toLowerCase()]
              }), /* @__PURE__ */ jsx("s-text", {
                color: "subdued",
                size: "small",
                children: "When customers edit their items, addresses, or options, their update activity will be recorded and displayed here."
              })]
            })
          }) : /* @__PURE__ */ jsx("s-stack", {
            direction: "block",
            gap: "small",
            children: currentData.customerUpdates.map((update) => /* @__PURE__ */ jsx("s-box", {
              padding: "base",
              border: "base",
              borderRadius: "base",
              background: "subdued",
              children: /* @__PURE__ */ jsxs("s-grid", {
                gridTemplateColumns: "1fr auto",
                alignItems: "center",
                gap: "base",
                children: [/* @__PURE__ */ jsxs("s-stack", {
                  direction: "block",
                  gap: "small",
                  children: [/* @__PURE__ */ jsxs("s-stack", {
                    direction: "inline",
                    gap: "small",
                    alignItems: "center",
                    children: [/* @__PURE__ */ jsx("a", {
                      href: update.adminOrderUrl,
                      target: "_blank",
                      rel: "noopener noreferrer",
                      style: {
                        textDecoration: "none",
                        color: "#2c6ecb",
                        fontWeight: "700"
                      },
                      children: /* @__PURE__ */ jsx("s-text", {
                        type: "strong",
                        color: "interactive",
                        children: update.orderName
                      })
                    }), /* @__PURE__ */ jsx("s-badge", {
                      tone: "neutral",
                      children: update.customerName
                    }), update.financialStatus && /* @__PURE__ */ jsx("s-badge", {
                      tone: update.financialStatus === "PAID" ? "success" : update.financialStatus.includes("REFUND") ? "critical" : "neutral",
                      children: update.financialStatus
                    }), update.orderTotal && /* @__PURE__ */ jsxs("s-text", {
                      size: "small",
                      color: "subdued",
                      children: ["• ", update.orderTotal]
                    })]
                  }), /* @__PURE__ */ jsxs("s-stack", {
                    direction: "inline",
                    gap: "small",
                    alignItems: "center",
                    children: [update.customerEmail && /* @__PURE__ */ jsxs("s-text", {
                      size: "small",
                      color: "subdued",
                      children: [update.customerEmail, " •"]
                    }), /* @__PURE__ */ jsxs("s-text", {
                      size: "small",
                      color: "subdued",
                      children: ["Updated ", formatUpdateDate(update.createdAt)]
                    })]
                  })]
                }), /* @__PURE__ */ jsxs("s-stack", {
                  direction: "inline",
                  gap: "small",
                  alignItems: "center",
                  children: [/* @__PURE__ */ jsx("s-badge", {
                    tone: update.source === "customer_account_ui" ? "success" : "info",
                    children: update.source === "customer_account_ui" ? "Customer Account UI" : "Checkout UI"
                  }), /* @__PURE__ */ jsx("a", {
                    href: update.adminOrderUrl,
                    target: "_blank",
                    rel: "noopener noreferrer",
                    style: {
                      textDecoration: "none"
                    },
                    children: /* @__PURE__ */ jsx("s-button", {
                      variant: "secondary",
                      children: "View Order ↗"
                    })
                  })]
                })]
              })
            }, update.id))
          })]
        })
      })
    }), /* @__PURE__ */ jsx("s-section", {
      heading: "Feature Usage Frequency (All Time)",
      children: /* @__PURE__ */ jsx("s-box", {
        padding: "large",
        border: "base",
        borderRadius: "base",
        children: /* @__PURE__ */ jsx("s-stack", {
          direction: "block",
          gap: "base",
          children: featureUsageList.map((item) => /* @__PURE__ */ jsx("s-box", {
            padding: "base",
            border: "base",
            borderRadius: "base",
            background: "subdued",
            children: /* @__PURE__ */ jsxs("s-grid", {
              gridTemplateColumns: "1fr auto auto",
              alignItems: "center",
              gap: "base",
              children: [/* @__PURE__ */ jsxs("s-stack", {
                direction: "block",
                gap: "small",
                children: [/* @__PURE__ */ jsxs("s-stack", {
                  direction: "inline",
                  alignItems: "center",
                  gap: "base",
                  children: [/* @__PURE__ */ jsx("s-text", {
                    type: "strong",
                    children: item.title
                  }), /* @__PURE__ */ jsx("s-badge", {
                    tone: item.active ? "success" : "neutral",
                    children: item.active ? "Active" : "Inactive"
                  })]
                }), /* @__PURE__ */ jsx("s-text", {
                  color: "subdued",
                  children: item.category
                })]
              }), /* @__PURE__ */ jsx("div", {
                style: {
                  textAlign: "right"
                },
                children: /* @__PURE__ */ jsxs("s-badge", {
                  tone: item.usageCount > 0 ? "info" : "neutral",
                  children: [item.usageCount, " ", item.usageCount === 1 ? "use" : "uses"]
                })
              })]
            })
          }, item.id))
        })
      })
    })]
  });
});
const route29 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: app_insights,
  headers: headers$1,
  loader: loader$2
}, Symbol.toStringTag, { value: "Module" }));
const loader$1 = async ({
  request
}) => {
  await authenticate.admin(request);
  return null;
};
const app__index = UNSAFE_withComponentProps(function Index() {
  const navigate = useNavigate();
  const location = useLocation();
  useEffect(() => {
    navigate(`/app/active-services${location.search}`, {
      replace: true
    });
  }, [navigate, location.search]);
  return null;
});
const route30 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: app__index,
  loader: loader$1
}, Symbol.toStringTag, { value: "Module" }));
const loader = async ({
  request
}) => {
  await authenticate.admin(request);
  return null;
};
const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};
const app_help = UNSAFE_withComponentProps(function HelpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [activeTab, setActiveTab] = useState("overview");
  return /* @__PURE__ */ jsxs("s-page", {
    heading: "OrderEase Help & Merchant Guide",
    children: [/* @__PURE__ */ jsx("s-button", {
      slot: "primary-action",
      onClick: () => navigate(`/app/active-services${location.search}`),
      children: "Manage Active Services"
    }), /* @__PURE__ */ jsx("s-section", {
      heading: "Merchant Guide & Documentation",
      children: /* @__PURE__ */ jsx("s-paragraph", {
        color: "subdued",
        children: "Learn how OrderEase works, explore available order editing features, configure security controls, and maximize post-purchase customer satisfaction."
      })
    }), /* @__PURE__ */ jsx("s-section", {
      children: /* @__PURE__ */ jsx("s-box", {
        padding: "base",
        border: "base",
        borderRadius: "base",
        background: "subdued",
        children: /* @__PURE__ */ jsxs("s-stack", {
          direction: "inline",
          gap: "small",
          alignItems: "center",
          children: [/* @__PURE__ */ jsx("s-button", {
            variant: activeTab === "overview" ? "primary" : "secondary",
            onClick: () => setActiveTab("overview"),
            children: "Overview & How It Works"
          }), /* @__PURE__ */ jsx("s-button", {
            variant: activeTab === "features" ? "primary" : "secondary",
            onClick: () => setActiveTab("features"),
            children: "Features Catalog (11 Services)"
          }), /* @__PURE__ */ jsx("s-button", {
            variant: activeTab === "settings" ? "primary" : "secondary",
            onClick: () => setActiveTab("settings"),
            children: "Controls & Security Rules"
          }), /* @__PURE__ */ jsx("s-button", {
            variant: activeTab === "faq" ? "primary" : "secondary",
            onClick: () => setActiveTab("faq"),
            children: "FAQ & Troubleshooting"
          })]
        })
      })
    }), activeTab === "overview" && /* @__PURE__ */ jsxs("s-stack", {
      direction: "block",
      gap: "base",
      children: [/* @__PURE__ */ jsx("s-section", {
        heading: "What is OrderEase?",
        children: /* @__PURE__ */ jsx("s-box", {
          padding: "large",
          border: "base",
          borderRadius: "base",
          children: /* @__PURE__ */ jsxs("s-stack", {
            direction: "block",
            gap: "base",
            children: [/* @__PURE__ */ jsx("s-banner", {
              tone: "info",
              children: "OrderEase is an all-in-one self-serve order editing solution built for Shopify merchants. It empowers your customers to update their unfulfilled orders directly from your store without needing support assistance."
            }), /* @__PURE__ */ jsx("s-paragraph", {
              children: "By enabling customers to fix shipping addresses, change item sizes/colors, add forgotten items, or apply missed discount codes immediately after purchase, OrderEase eliminates support tickets, prevents wrong delivery shipments, and boosts customer retention."
            })]
          })
        })
      }), /* @__PURE__ */ jsx("s-section", {
        heading: "How It Works (Step-by-Step Flow)",
        children: /* @__PURE__ */ jsxs("s-grid", {
          gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          gap: "base",
          children: [/* @__PURE__ */ jsx("s-box", {
            padding: "base",
            border: "base",
            borderRadius: "base",
            background: "subdued",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsx("s-badge", {
                tone: "info",
                children: "Step 1"
              }), /* @__PURE__ */ jsx("s-text", {
                type: "strong",
                children: "Order Placement"
              }), /* @__PURE__ */ jsx("s-paragraph", {
                color: "subdued",
                children: "Customer places an order on your Shopify store. The order edit countdown timer immediately begins."
              })]
            })
          }), /* @__PURE__ */ jsx("s-box", {
            padding: "base",
            border: "base",
            borderRadius: "base",
            background: "subdued",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsx("s-badge", {
                tone: "info",
                children: "Step 2"
              }), /* @__PURE__ */ jsx("s-text", {
                type: "strong",
                children: "Customer Access"
              }), /* @__PURE__ */ jsx("s-paragraph", {
                color: "subdued",
                children: "Customer views their order status on the Checkout Thank-You page or Customer Account order details page."
              })]
            })
          }), /* @__PURE__ */ jsx("s-box", {
            padding: "base",
            border: "base",
            borderRadius: "base",
            background: "subdued",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsx("s-badge", {
                tone: "info",
                children: "Step 3"
              }), /* @__PURE__ */ jsx("s-text", {
                type: "strong",
                children: "Self-Serve Edit"
              }), /* @__PURE__ */ jsx("s-paragraph", {
                color: "subdued",
                children: "The OrderEase UI displays all active enabled capabilities (quantity change, variant swap, address update, note, PDF invoice, etc.)."
              })]
            })
          }), /* @__PURE__ */ jsx("s-box", {
            padding: "base",
            border: "base",
            borderRadius: "base",
            background: "subdued",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsx("s-badge", {
                tone: "info",
                children: "Step 4"
              }), /* @__PURE__ */ jsx("s-text", {
                type: "strong",
                children: "Real-Time Validation & Sync"
              }), /* @__PURE__ */ jsx("s-paragraph", {
                color: "subdued",
                children: "Edits are validated against time window limits, edit count limits, and inventory levels before updating Shopify Admin instantly."
              })]
            })
          })]
        })
      }), /* @__PURE__ */ jsx("s-section", {
        heading: "Key Storefront Touchpoints",
        children: /* @__PURE__ */ jsx("s-box", {
          padding: "large",
          border: "base",
          borderRadius: "base",
          children: /* @__PURE__ */ jsx("s-stack", {
            direction: "block",
            gap: "base",
            children: /* @__PURE__ */ jsxs("s-grid", {
              gridTemplateColumns: "1fr 1fr",
              gap: "large",
              children: [/* @__PURE__ */ jsxs("s-stack", {
                direction: "block",
                gap: "small",
                children: [/* @__PURE__ */ jsx("s-text", {
                  type: "strong",
                  children: "1. Checkout Thank-You Page (Checkout UI)"
                }), /* @__PURE__ */ jsx("s-paragraph", {
                  color: "subdued",
                  children: "Appears immediately after checkout confirmation. Ideal for customers who realize they picked the wrong size or typoed their address seconds after completing purchase."
                })]
              }), /* @__PURE__ */ jsxs("s-stack", {
                direction: "block",
                gap: "small",
                children: [/* @__PURE__ */ jsx("s-text", {
                  type: "strong",
                  children: "2. Customer Account (Order Status Block)"
                }), /* @__PURE__ */ jsx("s-paragraph", {
                  color: "subdued",
                  children: "Appears when customers review past or active orders in their customer account portal. Gives customers convenient post-purchase control over pending orders."
                })]
              })]
            })
          })
        })
      })]
    }), activeTab === "features" && /* @__PURE__ */ jsxs("s-stack", {
      direction: "block",
      gap: "base",
      children: [/* @__PURE__ */ jsx("s-section", {
        heading: "Comprehensive Feature Catalog (11 Services)",
        children: /* @__PURE__ */ jsx("s-paragraph", {
          color: "subdued",
          children: "OrderEase comes equipped with 11 specialized self-serve order editing modules. You can independently enable or disable any module on the Active Services page."
        })
      }), /* @__PURE__ */ jsx("s-section", {
        heading: "Item Management",
        children: /* @__PURE__ */ jsxs("s-grid", {
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "base",
          children: [/* @__PURE__ */ jsx("s-box", {
            padding: "base",
            border: "base",
            borderRadius: "base",
            background: "subdued",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsxs("s-stack", {
                direction: "inline",
                alignItems: "center",
                gap: "small",
                children: [/* @__PURE__ */ jsx("s-text", {
                  type: "strong",
                  children: "Add Product to Order"
                }), /* @__PURE__ */ jsx("s-badge", {
                  tone: "success",
                  children: "Active Service"
                })]
              }), /* @__PURE__ */ jsx("s-paragraph", {
                color: "subdued",
                children: "Allows customers to browse store products and add extra items directly to their unfulfilled order without placing a second separate order."
              })]
            })
          }), /* @__PURE__ */ jsx("s-box", {
            padding: "base",
            border: "base",
            borderRadius: "base",
            background: "subdued",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsxs("s-stack", {
                direction: "inline",
                alignItems: "center",
                gap: "small",
                children: [/* @__PURE__ */ jsx("s-text", {
                  type: "strong",
                  children: "Edit Product Quantity"
                }), /* @__PURE__ */ jsx("s-badge", {
                  tone: "success",
                  children: "Active Service"
                })]
              }), /* @__PURE__ */ jsx("s-paragraph", {
                color: "subdued",
                children: "Enables customers to increase or decrease quantities of line items in existing orders with real-time stock validation and automatic inventory release."
              })]
            })
          }), /* @__PURE__ */ jsx("s-box", {
            padding: "base",
            border: "base",
            borderRadius: "base",
            background: "subdued",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsxs("s-stack", {
                direction: "inline",
                alignItems: "center",
                gap: "small",
                children: [/* @__PURE__ */ jsx("s-text", {
                  type: "strong",
                  children: "Swap Product Variant"
                }), /* @__PURE__ */ jsx("s-badge", {
                  tone: "success",
                  children: "Active Service"
                })]
              }), /* @__PURE__ */ jsx("s-paragraph", {
                color: "subdued",
                children: "Lets customers switch options like shirt size (e.g. Medium to Large) or color variants seamlessly without canceling the whole order."
              })]
            })
          })]
        })
      }), /* @__PURE__ */ jsx("s-section", {
        heading: "Revenue & Upsells",
        children: /* @__PURE__ */ jsx("s-grid", {
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "base",
          children: /* @__PURE__ */ jsx("s-box", {
            padding: "base",
            border: "base",
            borderRadius: "base",
            background: "subdued",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsxs("s-stack", {
                direction: "inline",
                alignItems: "center",
                gap: "small",
                children: [/* @__PURE__ */ jsx("s-text", {
                  type: "strong",
                  children: "Product Upsell & Recommendations"
                }), /* @__PURE__ */ jsx("s-badge", {
                  tone: "success",
                  children: "Revenue & Growth"
                })]
              }), /* @__PURE__ */ jsx("s-paragraph", {
                color: "subdued",
                children: "Displays smart product recommendations directly inside the order edit module. Recommendation rules are driven by tag pairing: items tagged with [tag] suggest catalog products tagged with [tag]-upshell."
              })]
            })
          })
        })
      }), /* @__PURE__ */ jsx("s-section", {
        heading: "Shipping & Delivery",
        children: /* @__PURE__ */ jsxs("s-grid", {
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "base",
          children: [/* @__PURE__ */ jsx("s-box", {
            padding: "base",
            border: "base",
            borderRadius: "base",
            background: "subdued",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsxs("s-stack", {
                direction: "inline",
                alignItems: "center",
                gap: "small",
                children: [/* @__PURE__ */ jsx("s-text", {
                  type: "strong",
                  children: "Change Shipping Address"
                }), /* @__PURE__ */ jsx("s-badge", {
                  tone: "info",
                  children: "Shipping"
                })]
              }), /* @__PURE__ */ jsx("s-paragraph", {
                color: "subdued",
                children: "Allows customers to update street address, apartment, city, zip code, or country before dispatch to prevent delivery failures."
              })]
            })
          }), /* @__PURE__ */ jsx("s-box", {
            padding: "base",
            border: "base",
            borderRadius: "base",
            background: "subdued",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsxs("s-stack", {
                direction: "inline",
                alignItems: "center",
                gap: "small",
                children: [/* @__PURE__ */ jsx("s-text", {
                  type: "strong",
                  children: "Change Shipping Method"
                }), /* @__PURE__ */ jsx("s-badge", {
                  tone: "info",
                  children: "Shipping"
                })]
              }), /* @__PURE__ */ jsx("s-paragraph", {
                color: "subdued",
                children: "Lets customers switch or upgrade their shipping rate (e.g. from Standard Shipping to Express Delivery)."
              })]
            })
          })]
        })
      }), /* @__PURE__ */ jsx("s-section", {
        heading: "Communication & Contact",
        children: /* @__PURE__ */ jsxs("s-grid", {
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "base",
          children: [/* @__PURE__ */ jsx("s-box", {
            padding: "base",
            border: "base",
            borderRadius: "base",
            background: "subdued",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsxs("s-stack", {
                direction: "inline",
                alignItems: "center",
                gap: "small",
                children: [/* @__PURE__ */ jsx("s-text", {
                  type: "strong",
                  children: "Add / Edit Order Note"
                }), /* @__PURE__ */ jsx("s-badge", {
                  tone: "neutral",
                  children: "Communication"
                })]
              }), /* @__PURE__ */ jsx("s-paragraph", {
                color: "subdued",
                children: "Permits customers to append gift instructions, gate access codes, or custom order notes for your fulfillment team."
              })]
            })
          }), /* @__PURE__ */ jsx("s-box", {
            padding: "base",
            border: "base",
            borderRadius: "base",
            background: "subdued",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsxs("s-stack", {
                direction: "inline",
                alignItems: "center",
                gap: "small",
                children: [/* @__PURE__ */ jsx("s-text", {
                  type: "strong",
                  children: "Update Contact Information"
                }), /* @__PURE__ */ jsx("s-badge", {
                  tone: "neutral",
                  children: "Account"
                })]
              }), /* @__PURE__ */ jsx("s-paragraph", {
                color: "subdued",
                children: "Enables updating email address or phone number on pending orders so tracking updates reach the customer properly."
              })]
            })
          })]
        })
      }), /* @__PURE__ */ jsx("s-section", {
        heading: "Discounts, Invoices & Cancellation",
        children: /* @__PURE__ */ jsxs("s-grid", {
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: "base",
          children: [/* @__PURE__ */ jsx("s-box", {
            padding: "base",
            border: "base",
            borderRadius: "base",
            background: "subdued",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsxs("s-stack", {
                direction: "inline",
                alignItems: "center",
                gap: "small",
                children: [/* @__PURE__ */ jsx("s-text", {
                  type: "strong",
                  children: "Apply Discount Code"
                }), /* @__PURE__ */ jsx("s-badge", {
                  tone: "warning",
                  children: "Promotions"
                })]
              }), /* @__PURE__ */ jsx("s-paragraph", {
                color: "subdued",
                children: "Allows customers to apply valid promo codes or coupon discounts to active line items post-checkout."
              })]
            })
          }), /* @__PURE__ */ jsx("s-box", {
            padding: "base",
            border: "base",
            borderRadius: "base",
            background: "subdued",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsxs("s-stack", {
                direction: "inline",
                alignItems: "center",
                gap: "small",
                children: [/* @__PURE__ */ jsx("s-text", {
                  type: "strong",
                  children: "Download & Print Invoice"
                }), /* @__PURE__ */ jsx("s-badge", {
                  tone: "success",
                  children: "PDF Billing"
                })]
              }), /* @__PURE__ */ jsx("s-paragraph", {
                color: "subdued",
                children: "Generates clean, branded PDF invoices reflecting itemized totals, active applied discounts, shipping costs, and tax breakdowns."
              })]
            })
          }), /* @__PURE__ */ jsx("s-box", {
            padding: "base",
            border: "base",
            borderRadius: "base",
            background: "subdued",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsxs("s-stack", {
                direction: "inline",
                alignItems: "center",
                gap: "small",
                children: [/* @__PURE__ */ jsx("s-text", {
                  type: "strong",
                  children: "Cancel Order"
                }), /* @__PURE__ */ jsx("s-badge", {
                  tone: "critical",
                  children: "Order Management"
                })]
              }), /* @__PURE__ */ jsx("s-paragraph", {
                color: "subdued",
                children: "Provides self-service order cancellation within your designated time window, automatically restocking inventory back to your store."
              })]
            })
          })]
        })
      })]
    }), activeTab === "settings" && /* @__PURE__ */ jsxs("s-stack", {
      direction: "block",
      gap: "base",
      children: [/* @__PURE__ */ jsx("s-section", {
        heading: "Merchant Control & Security Rules",
        children: /* @__PURE__ */ jsx("s-paragraph", {
          color: "subdued",
          children: "OrderEase provides store owners with full control over when and how order modifications can be made, preventing fulfillment conflicts and protecting inventory."
        })
      }), /* @__PURE__ */ jsx("s-section", {
        heading: "1. Order Edit Time Window Limit",
        children: /* @__PURE__ */ jsx("s-box", {
          padding: "large",
          border: "base",
          borderRadius: "base",
          children: /* @__PURE__ */ jsxs("s-stack", {
            direction: "block",
            gap: "base",
            children: [/* @__PURE__ */ jsx("s-text", {
              type: "strong",
              children: "Restricting Edits Before Fulfillment"
            }), /* @__PURE__ */ jsx("s-paragraph", {
              color: "subdued",
              children: "Set a maximum elapsed time after order placement (e.g. 30 minutes, 1 hour, 2 hours, 1 day, or custom duration). Once this time limit expires, all self-serve edit buttons are disabled automatically to ensure your fulfillment warehouse can pack and ship orders without mid-process changes."
            }), /* @__PURE__ */ jsx("s-banner", {
              tone: "info",
              children: "Configurable on the Active Services tab."
            })]
          })
        })
      }), /* @__PURE__ */ jsx("s-section", {
        heading: "2. Maximum Order Edits Limit",
        children: /* @__PURE__ */ jsx("s-box", {
          padding: "large",
          border: "base",
          borderRadius: "base",
          children: /* @__PURE__ */ jsxs("s-stack", {
            direction: "block",
            gap: "base",
            children: [/* @__PURE__ */ jsx("s-text", {
              type: "strong",
              children: "Preventing Excessive Modification Loops"
            }), /* @__PURE__ */ jsx("s-paragraph", {
              color: "subdued",
              children: "Limit the total number of edit actions allowed per order (e.g., maximum 3 edit events). When an order reaches the set edit limit, an Edit Limit Reached banner informs the customer."
            }), /* @__PURE__ */ jsx("s-banner", {
              tone: "success",
              children: "PDF Invoice downloads always remain available to customers even after the edit limit is reached."
            })]
          })
        })
      }), /* @__PURE__ */ jsx("s-section", {
        heading: "3. Granular Service Toggles & Inventory Protection",
        children: /* @__PURE__ */ jsx("s-box", {
          padding: "large",
          border: "base",
          borderRadius: "base",
          children: /* @__PURE__ */ jsx("s-stack", {
            direction: "block",
            gap: "base",
            children: /* @__PURE__ */ jsxs("s-grid", {
              gridTemplateColumns: "1fr 1fr",
              gap: "large",
              children: [/* @__PURE__ */ jsxs("s-stack", {
                direction: "block",
                gap: "small",
                children: [/* @__PURE__ */ jsx("s-text", {
                  type: "strong",
                  children: "One-Click Feature Toggles"
                }), /* @__PURE__ */ jsx("s-paragraph", {
                  color: "subdued",
                  children: "Every feature can be toggled ON or OFF independently on the Active Services page. Disabled features are instantly hidden from storefront UI extensions."
                })]
              }), /* @__PURE__ */ jsxs("s-stack", {
                direction: "block",
                gap: "small",
                children: [/* @__PURE__ */ jsx("s-text", {
                  type: "strong",
                  children: "Automatic Inventory Restocking"
                }), /* @__PURE__ */ jsx("s-paragraph", {
                  color: "subdued",
                  children: "When items are removed, quantity is decreased, or an order is canceled, released stock is automatically returned to your store inventory via Shopify Admin GraphQL APIs."
                })]
              })]
            })
          })
        })
      }), /* @__PURE__ */ jsx("s-section", {
        heading: "4. Google Places & Location Autocomplete Configuration",
        children: /* @__PURE__ */ jsx("s-box", {
          padding: "large",
          border: "base",
          borderRadius: "base",
          children: /* @__PURE__ */ jsxs("s-stack", {
            direction: "block",
            gap: "base",
            children: [/* @__PURE__ */ jsx("s-text", {
              type: "strong",
              children: "Enabling Address Autocomplete for Storefront Customers"
            }), /* @__PURE__ */ jsx("s-paragraph", {
              color: "subdued",
              children: "OrderEase allows merchants to connect their own Google Places API Key on the Active Services page. Once configured, customers editing their shipping address will get real-time address suggestions and auto-complete dropdowns."
            }), /* @__PURE__ */ jsxs("s-grid", {
              gridTemplateColumns: "1fr 1fr",
              gap: "large",
              children: [/* @__PURE__ */ jsxs("s-stack", {
                direction: "block",
                gap: "small",
                children: [/* @__PURE__ */ jsx("s-text", {
                  type: "strong",
                  children: "Active API Key Setup"
                }), /* @__PURE__ */ jsxs("s-paragraph", {
                  color: "subdued",
                  children: ["Enter your Google API Key under the ", /* @__PURE__ */ jsx("strong", {
                    children: "Google Places & Location Suggestions"
                  }), " section on the Active Services page and click ", /* @__PURE__ */ jsx("strong", {
                    children: "Save Key"
                  }), ". The key is securely stored per shop."]
                })]
              }), /* @__PURE__ */ jsxs("s-stack", {
                direction: "block",
                gap: "small",
                children: [/* @__PURE__ */ jsx("s-text", {
                  type: "strong",
                  children: "Removing or Clearing Key"
                }), /* @__PURE__ */ jsxs("s-paragraph", {
                  color: "subdued",
                  children: ["To disable autocomplete, click the red ", /* @__PURE__ */ jsx("strong", {
                    children: "Delete Key"
                  }), " button. The key will be deleted from your database, and storefront forms will automatically hide location suggestions without causing errors."]
                })]
              })]
            }), /* @__PURE__ */ jsxs("s-banner", {
              tone: "info",
              children: [/* @__PURE__ */ jsx("strong", {
                children: "Google Cloud Setup Requirement:"
              }), " Ensure both ", /* @__PURE__ */ jsx("strong", {
                children: "Places API"
              }), " (or Places API New) and ", /* @__PURE__ */ jsx("strong", {
                children: "Geocoding API"
              }), " are enabled in your Google Cloud Console project, and that key restrictions permit these services."]
            })]
          })
        })
      }), /* @__PURE__ */ jsx("s-section", {
        heading: "5. Product Tags & Upsell Management Configuration",
        children: /* @__PURE__ */ jsx("s-box", {
          padding: "large",
          border: "base",
          borderRadius: "base",
          children: /* @__PURE__ */ jsxs("s-stack", {
            direction: "block",
            gap: "base",
            children: [/* @__PURE__ */ jsx("s-text", {
              type: "strong",
              children: "Configuring Tag-Based Product Recommendations"
            }), /* @__PURE__ */ jsxs("s-paragraph", {
              color: "subdued",
              children: ["OrderEase features an automated tag-based recommendation engine. Items in a customer's order tagged with ", /* @__PURE__ */ jsx("strong", {
                children: "[tag]"
              }), " (e.g. ", /* @__PURE__ */ jsx("code", {
                children: "Summer"
              }), ") will trigger smart upsell recommendations for store products tagged with ", /* @__PURE__ */ jsx("strong", {
                children: "[tag]-upshell"
              }), " (e.g. ", /* @__PURE__ */ jsx("code", {
                children: "Summer-upshell"
              }), ")."]
            }), /* @__PURE__ */ jsxs("s-grid", {
              gridTemplateColumns: "1fr 1fr",
              gap: "large",
              children: [/* @__PURE__ */ jsxs("s-stack", {
                direction: "block",
                gap: "small",
                children: [/* @__PURE__ */ jsx("s-text", {
                  type: "strong",
                  children: "Searching & Viewing Product Tags"
                }), /* @__PURE__ */ jsxs("s-paragraph", {
                  color: "subdued",
                  children: ["On the ", /* @__PURE__ */ jsx("strong", {
                    children: "Active Services"
                  }), " page, scroll to ", /* @__PURE__ */ jsx("strong", {
                    children: "Product Tags & Upsell Management"
                  }), ". Use the search input to find products by title or tag. Active ", /* @__PURE__ */ jsx("code", {
                    children: "-upshell"
                  }), " tags are highlighted with a green badge and ⚡ icon."]
                })]
              }), /* @__PURE__ */ jsxs("s-stack", {
                direction: "block",
                gap: "small",
                children: [/* @__PURE__ */ jsx("s-text", {
                  type: "strong",
                  children: "Adding & Removing Tags"
                }), /* @__PURE__ */ jsxs("s-paragraph", {
                  color: "subdued",
                  children: ["Type any tag into the product input field and click ", /* @__PURE__ */ jsx("strong", {
                    children: "+ Tag"
                  }), ", or use the ", /* @__PURE__ */ jsx("strong", {
                    children: "+ Quick Add [tag]-upshell"
                  }), " shortcut. Click the ", /* @__PURE__ */ jsx("strong", {
                    children: "×"
                  }), " on any tag badge to instantly remove it."]
                })]
              })]
            }), /* @__PURE__ */ jsx("s-banner", {
              tone: "success",
              children: "Product tags are updated in real-time directly on your store's Shopify Admin catalog."
            })]
          })
        })
      })]
    }), activeTab === "faq" && /* @__PURE__ */ jsx("s-stack", {
      direction: "block",
      gap: "base",
      children: /* @__PURE__ */ jsx("s-section", {
        heading: "Frequently Asked Questions (FAQ)",
        children: /* @__PURE__ */ jsxs("s-stack", {
          direction: "block",
          gap: "base",
          children: [/* @__PURE__ */ jsx("s-box", {
            padding: "large",
            border: "base",
            borderRadius: "base",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsx("s-text", {
                type: "strong",
                children: "Q: How does the Product Upsell tag pairing system work?"
              }), /* @__PURE__ */ jsxs("s-paragraph", {
                color: "subdued",
                children: ["OrderEase checks the product tags of active items in a customer's order. For each tag ", /* @__PURE__ */ jsx("strong", {
                  children: "X"
                }), " on an ordered item, the app searches your catalog for products tagged with ", /* @__PURE__ */ jsx("strong", {
                  children: "X-upshell"
                }), " and presents them as recommended additions in the order status / edit screen."]
              })]
            })
          }), /* @__PURE__ */ jsx("s-box", {
            padding: "large",
            border: "base",
            borderRadius: "base",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsx("s-text", {
                type: "strong",
                children: "Q: How do I manage upsell tags for my products?"
              }), /* @__PURE__ */ jsxs("s-paragraph", {
                color: "subdued",
                children: ["1. Navigate to ", /* @__PURE__ */ jsx("strong", {
                  children: "Active Services"
                }), " and scroll down to ", /* @__PURE__ */ jsx("strong", {
                  children: "Product Tags & Upsell Management"
                }), ".", /* @__PURE__ */ jsx("br", {}), "2. Search for any product by title or tag.", /* @__PURE__ */ jsx("br", {}), "3. Type a tag into the product's tag field and click ", /* @__PURE__ */ jsx("strong", {
                  children: "+ Tag"
                }), " or ", /* @__PURE__ */ jsx("strong", {
                  children: "+ Quick Add [tag]-upshell"
                }), ".", /* @__PURE__ */ jsx("br", {}), "4. To remove a tag, click the ", /* @__PURE__ */ jsx("strong", {
                  children: "×"
                }), " button on the tag badge."]
              })]
            })
          }), /* @__PURE__ */ jsx("s-box", {
            padding: "large",
            border: "base",
            borderRadius: "base",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsx("s-text", {
                type: "strong",
                children: "Q: How do I set up Google Places Location Suggestions for customer address edits?"
              }), /* @__PURE__ */ jsxs("s-paragraph", {
                color: "subdued",
                children: ["1. Go to the Active Services page and scroll to ", /* @__PURE__ */ jsx("strong", {
                  children: "Google Places & Location Suggestions"
                }), ".", /* @__PURE__ */ jsx("br", {}), "2. Paste your Google Places API Key into the field and click ", /* @__PURE__ */ jsx("strong", {
                  children: "Save Key"
                }), ".", /* @__PURE__ */ jsx("br", {}), "3. Make sure in your Google Cloud Console that ", /* @__PURE__ */ jsx("strong", {
                  children: "Places API"
                }), " (or Places API New) and ", /* @__PURE__ */ jsx("strong", {
                  children: "Geocoding API"
                }), " are enabled for your project.", /* @__PURE__ */ jsx("br", {}), "4. Once saved, customers editing shipping addresses on Checkout or Customer Account pages will get instant location autocomplete suggestions."]
              })]
            })
          }), /* @__PURE__ */ jsx("s-box", {
            padding: "large",
            border: "base",
            borderRadius: "base",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsx("s-text", {
                type: "strong",
                children: "Q: Why are location suggestions returning errors or REQUEST_DENIED?"
              }), /* @__PURE__ */ jsxs("s-paragraph", {
                color: "subdued",
                children: ["If location suggestions do not appear, check the following in your Google Cloud Console:", /* @__PURE__ */ jsx("br", {}), "• ", /* @__PURE__ */ jsx("strong", {
                  children: "API Enablement:"
                }), " Verify that ", /* @__PURE__ */ jsx("em", {
                  children: "Places API"
                }), " (or ", /* @__PURE__ */ jsx("em", {
                  children: "Places API New"
                }), ") is turned ON under Google Cloud -> APIs & Services -> Library.", /* @__PURE__ */ jsx("br", {}), "• ", /* @__PURE__ */ jsx("strong", {
                  children: "API Key Restrictions:"
                }), " Under APIs & Services -> Credentials, check your API Key. Set API restrictions to ", /* @__PURE__ */ jsx("em", {
                  children: "Don't restrict key"
                }), " or ensure ", /* @__PURE__ */ jsx("em", {
                  children: "Places API"
                }), " is explicitly selected.", /* @__PURE__ */ jsx("br", {}), "• ", /* @__PURE__ */ jsx("strong", {
                  children: "Billing Account:"
                }), " Ensure your Google Cloud project has an active billing account linked."]
              })]
            })
          }), /* @__PURE__ */ jsx("s-box", {
            padding: "large",
            border: "base",
            borderRadius: "base",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsx("s-text", {
                type: "strong",
                children: "Q: How do I remove my Google Places API Key?"
              }), /* @__PURE__ */ jsxs("s-paragraph", {
                color: "subdued",
                children: ["Go to the Active Services page under ", /* @__PURE__ */ jsx("strong", {
                  children: "Google Places & Location Suggestions"
                }), " and click the red ", /* @__PURE__ */ jsx("strong", {
                  children: "Delete Key"
                }), " button. This clears your API key from the database. When no key exists, location suggestions are safely hidden on customer address forms."]
              })]
            })
          }), /* @__PURE__ */ jsx("s-box", {
            padding: "large",
            border: "base",
            borderRadius: "base",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsx("s-text", {
                type: "strong",
                children: "Q: What happens when an order is partially or fully fulfilled?"
              }), /* @__PURE__ */ jsx("s-paragraph", {
                color: "subdued",
                children: "Once an order status changes to partially fulfilled or fulfilled in Shopify Admin, OrderEase automatically locks order modifications to avoid shipping discrepancies."
              })]
            })
          }), /* @__PURE__ */ jsx("s-box", {
            padding: "large",
            border: "base",
            borderRadius: "base",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsx("s-text", {
                type: "strong",
                children: "Q: Does downloading a PDF invoice count as an edit action?"
              }), /* @__PURE__ */ jsx("s-paragraph", {
                color: "subdued",
                children: "No. Downloading or printing a PDF invoice is a read-only operation and does not count towards the merchant-defined maximum edit count limit."
              })]
            })
          }), /* @__PURE__ */ jsx("s-box", {
            padding: "large",
            border: "base",
            borderRadius: "base",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsx("s-text", {
                type: "strong",
                children: "Q: How are out-of-stock items handled when swapping or adding products?"
              }), /* @__PURE__ */ jsx("s-paragraph", {
                color: "subdued",
                children: "OrderEase verifies real-time product variant inventory before allowing customers to select or commit changes. Out-of-stock options are disabled with clear stock warnings."
              })]
            })
          }), /* @__PURE__ */ jsx("s-box", {
            padding: "large",
            border: "base",
            borderRadius: "base",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsx("s-text", {
                type: "strong",
                children: "Q: Where can I view analytics on how many orders have been edited?"
              }), /* @__PURE__ */ jsx("s-paragraph", {
                color: "subdued",
                children: "Navigate to the Insights page from the top navigation bar. There you can review total open orders, total edited orders, channel breakdown (Customer Account UI vs Checkout UI), and individual feature usage frequency."
              })]
            })
          }), /* @__PURE__ */ jsx("s-box", {
            padding: "large",
            border: "base",
            borderRadius: "base",
            children: /* @__PURE__ */ jsxs("s-stack", {
              direction: "block",
              gap: "small",
              children: [/* @__PURE__ */ jsx("s-text", {
                type: "strong",
                children: "Q: How do I change the time limit or max edit limit?"
              }), /* @__PURE__ */ jsx("s-paragraph", {
                color: "subdued",
                children: "Go to the Active Services page. At the top of the page, you will find configuration blocks for setting Maximum Order Edits Limit (e.g 1, 2, 3, 5, unlimited, or custom) and Order Edit Time Limit (e.g 30m, 1h, 2h, 1d, 2d, or custom duration)."
              })]
            })
          })]
        })
      })
    })]
  });
});
const route31 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: app_help,
  headers,
  loader
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-D_SMyjUh.js", "imports": ["/assets/jsx-runtime-Bvlwkg9p.js", "/assets/chunk-62JRHF6Z-DhhUG5kk.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/root-BnzjYjt2.js", "imports": ["/assets/jsx-runtime-Bvlwkg9p.js", "/assets/chunk-62JRHF6Z-DhhUG5kk.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.order-edit.update-quantity": { "id": "routes/api.order-edit.update-quantity", "parentId": "root", "path": "api/order-edit/update-quantity", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.order-edit.update-quantity-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.order-edit.change-variant": { "id": "routes/api.order-edit.change-variant", "parentId": "root", "path": "api/order-edit/change-variant", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.order-edit.change-variant-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.order-edit.variant-stock": { "id": "routes/api.order-edit.variant-stock", "parentId": "root", "path": "api/order-edit/variant-stock", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.order-edit.variant-stock-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.order-edit.add-product": { "id": "routes/api.order-edit.add-product", "parentId": "root", "path": "api/order-edit/add-product", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.order-edit.add-product-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.order-edit.bulk-update": { "id": "routes/api.order-edit.bulk-update", "parentId": "root", "path": "api/order-edit/bulk-update", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.order-edit.bulk-update-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.app.scopes_update": { "id": "routes/webhooks.app.scopes_update", "parentId": "root", "path": "webhooks/app/scopes_update", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.scopes_update-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.order-edit.sample-csv": { "id": "routes/api.order-edit.sample-csv", "parentId": "root", "path": "api/order-edit/sample-csv", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.order-edit.sample-csv-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.location-suggestions": { "id": "routes/api.location-suggestions", "parentId": "root", "path": "api/location-suggestions", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.location-suggestions-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.order-edit.get-order": { "id": "routes/api.order-edit.get-order", "parentId": "root", "path": "api/order-edit/get-order", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.order-edit.get-order-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.app.uninstalled": { "id": "routes/webhooks.app.uninstalled", "parentId": "root", "path": "webhooks/app/uninstalled", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/webhooks.app.uninstalled-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.order.upsell-tags": { "id": "routes/api.order.upsell-tags", "parentId": "root", "path": "api/order/upsell-tags", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.order.upsell-tags-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.service-settings": { "id": "routes/api.service-settings", "parentId": "root", "path": "api/service-settings", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.service-settings-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.orders.paid": { "id": "routes/webhooks.orders.paid", "parentId": "root", "path": "webhooks/orders/paid", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/webhooks.orders.paid-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.order.discount8": { "id": "routes/api.order.discount8", "parentId": "root", "path": "api/order/discount8", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.order.discount8-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/public.invoice-link": { "id": "routes/public.invoice-link", "parentId": "root", "path": "public/invoice-link", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/public.invoice-link-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/webhooks.compliance": { "id": "routes/webhooks.compliance", "parentId": "root", "path": "webhooks/compliance", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/webhooks.compliance-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.order.shipping": { "id": "routes/api.order.shipping", "parentId": "root", "path": "api/order/shipping", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.order.shipping-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.order.address": { "id": "routes/api.order.address", "parentId": "root", "path": "api/order/address", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.order.address-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.order.contact": { "id": "routes/api.order.contact", "parentId": "root", "path": "api/order/contact", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.order.contact-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.order.invoice": { "id": "routes/api.order.invoice", "parentId": "root", "path": "api/order/invoice", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.order.invoice-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.order.cancel": { "id": "routes/api.order.cancel", "parentId": "root", "path": "api/order/cancel", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.order.cancel-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/api.order.note": { "id": "routes/api.order.note", "parentId": "root", "path": "api/order/note", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/api.order.note-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/auth.login": { "id": "routes/auth.login", "parentId": "root", "path": "auth/login", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/route-DZ80wcFk.js", "imports": ["/assets/chunk-62JRHF6Z-DhhUG5kk.js", "/assets/jsx-runtime-Bvlwkg9p.js", "/assets/AppProxyLink-BOj7VP4o.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/_index": { "id": "routes/_index", "parentId": "root", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/route-DOL2-fDy.js", "imports": ["/assets/chunk-62JRHF6Z-DhhUG5kk.js", "/assets/jsx-runtime-Bvlwkg9p.js"], "css": ["/assets/route-BuT_mVdb.css"], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/auth.$": { "id": "routes/auth.$", "parentId": "root", "path": "auth/*", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": false, "hasErrorBoundary": false, "module": "/assets/auth._-l0sNRNKZ.js", "imports": [], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app": { "id": "routes/app", "parentId": "root", "path": "app", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": true, "module": "/assets/app-ClWiU-Mw.js", "imports": ["/assets/chunk-62JRHF6Z-DhhUG5kk.js", "/assets/jsx-runtime-Bvlwkg9p.js", "/assets/AppProxyLink-BOj7VP4o.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.active-services": { "id": "routes/app.active-services", "parentId": "routes/app", "path": "active-services", "index": void 0, "caseSensitive": void 0, "hasAction": true, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.active-services-CyKklafW.js", "imports": ["/assets/chunk-62JRHF6Z-DhhUG5kk.js", "/assets/jsx-runtime-Bvlwkg9p.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.additional": { "id": "routes/app.additional", "parentId": "routes/app", "path": "additional", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.additional-C26EtW3I.js", "imports": ["/assets/chunk-62JRHF6Z-DhhUG5kk.js", "/assets/jsx-runtime-Bvlwkg9p.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.insights": { "id": "routes/app.insights", "parentId": "routes/app", "path": "insights", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.insights-D7NAzqqn.js", "imports": ["/assets/chunk-62JRHF6Z-DhhUG5kk.js", "/assets/jsx-runtime-Bvlwkg9p.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app._index": { "id": "routes/app._index", "parentId": "routes/app", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app._index-D51Vph1h.js", "imports": ["/assets/chunk-62JRHF6Z-DhhUG5kk.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/app.help": { "id": "routes/app.help", "parentId": "routes/app", "path": "help", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": true, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasDefaultExport": true, "hasErrorBoundary": false, "module": "/assets/app.help-DNBJRTX2.js", "imports": ["/assets/chunk-62JRHF6Z-DhhUG5kk.js", "/assets/jsx-runtime-Bvlwkg9p.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 } }, "url": "/assets/manifest-058ef036.js", "version": "058ef036", "sri": void 0 };
const assetsBuildDirectory = "build/client";
const basename = "/";
const future = { "unstable_optimizeDeps": false, "v8_passThroughRequests": false, "v8_trailingSlashAwareDataRequests": false, "unstable_previewServerPrerendering": false, "v8_middleware": false, "v8_splitRouteModules": false, "v8_viteEnvironmentApi": false };
const ssr = true;
const isSpaMode = false;
const prerender = [];
const routeDiscovery = { "mode": "lazy", "manifestPath": "/__manifest" };
const publicPath = "/";
const entry = { module: entryServer };
const routes = {
  "root": {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: route0
  },
  "routes/api.order-edit.update-quantity": {
    id: "routes/api.order-edit.update-quantity",
    parentId: "root",
    path: "api/order-edit/update-quantity",
    index: void 0,
    caseSensitive: void 0,
    module: route1
  },
  "routes/api.order-edit.change-variant": {
    id: "routes/api.order-edit.change-variant",
    parentId: "root",
    path: "api/order-edit/change-variant",
    index: void 0,
    caseSensitive: void 0,
    module: route2
  },
  "routes/api.order-edit.variant-stock": {
    id: "routes/api.order-edit.variant-stock",
    parentId: "root",
    path: "api/order-edit/variant-stock",
    index: void 0,
    caseSensitive: void 0,
    module: route3
  },
  "routes/api.order-edit.add-product": {
    id: "routes/api.order-edit.add-product",
    parentId: "root",
    path: "api/order-edit/add-product",
    index: void 0,
    caseSensitive: void 0,
    module: route4
  },
  "routes/api.order-edit.bulk-update": {
    id: "routes/api.order-edit.bulk-update",
    parentId: "root",
    path: "api/order-edit/bulk-update",
    index: void 0,
    caseSensitive: void 0,
    module: route5
  },
  "routes/webhooks.app.scopes_update": {
    id: "routes/webhooks.app.scopes_update",
    parentId: "root",
    path: "webhooks/app/scopes_update",
    index: void 0,
    caseSensitive: void 0,
    module: route6
  },
  "routes/api.order-edit.sample-csv": {
    id: "routes/api.order-edit.sample-csv",
    parentId: "root",
    path: "api/order-edit/sample-csv",
    index: void 0,
    caseSensitive: void 0,
    module: route7
  },
  "routes/api.location-suggestions": {
    id: "routes/api.location-suggestions",
    parentId: "root",
    path: "api/location-suggestions",
    index: void 0,
    caseSensitive: void 0,
    module: route8
  },
  "routes/api.order-edit.get-order": {
    id: "routes/api.order-edit.get-order",
    parentId: "root",
    path: "api/order-edit/get-order",
    index: void 0,
    caseSensitive: void 0,
    module: route9
  },
  "routes/webhooks.app.uninstalled": {
    id: "routes/webhooks.app.uninstalled",
    parentId: "root",
    path: "webhooks/app/uninstalled",
    index: void 0,
    caseSensitive: void 0,
    module: route10
  },
  "routes/api.order.upsell-tags": {
    id: "routes/api.order.upsell-tags",
    parentId: "root",
    path: "api/order/upsell-tags",
    index: void 0,
    caseSensitive: void 0,
    module: route11
  },
  "routes/api.service-settings": {
    id: "routes/api.service-settings",
    parentId: "root",
    path: "api/service-settings",
    index: void 0,
    caseSensitive: void 0,
    module: route12
  },
  "routes/webhooks.orders.paid": {
    id: "routes/webhooks.orders.paid",
    parentId: "root",
    path: "webhooks/orders/paid",
    index: void 0,
    caseSensitive: void 0,
    module: route13
  },
  "routes/api.order.discount8": {
    id: "routes/api.order.discount8",
    parentId: "root",
    path: "api/order/discount8",
    index: void 0,
    caseSensitive: void 0,
    module: route14
  },
  "routes/public.invoice-link": {
    id: "routes/public.invoice-link",
    parentId: "root",
    path: "public/invoice-link",
    index: void 0,
    caseSensitive: void 0,
    module: route15
  },
  "routes/webhooks.compliance": {
    id: "routes/webhooks.compliance",
    parentId: "root",
    path: "webhooks/compliance",
    index: void 0,
    caseSensitive: void 0,
    module: route16
  },
  "routes/api.order.shipping": {
    id: "routes/api.order.shipping",
    parentId: "root",
    path: "api/order/shipping",
    index: void 0,
    caseSensitive: void 0,
    module: route17
  },
  "routes/api.order.address": {
    id: "routes/api.order.address",
    parentId: "root",
    path: "api/order/address",
    index: void 0,
    caseSensitive: void 0,
    module: route18
  },
  "routes/api.order.contact": {
    id: "routes/api.order.contact",
    parentId: "root",
    path: "api/order/contact",
    index: void 0,
    caseSensitive: void 0,
    module: route19
  },
  "routes/api.order.invoice": {
    id: "routes/api.order.invoice",
    parentId: "root",
    path: "api/order/invoice",
    index: void 0,
    caseSensitive: void 0,
    module: route20
  },
  "routes/api.order.cancel": {
    id: "routes/api.order.cancel",
    parentId: "root",
    path: "api/order/cancel",
    index: void 0,
    caseSensitive: void 0,
    module: route21
  },
  "routes/api.order.note": {
    id: "routes/api.order.note",
    parentId: "root",
    path: "api/order/note",
    index: void 0,
    caseSensitive: void 0,
    module: route22
  },
  "routes/auth.login": {
    id: "routes/auth.login",
    parentId: "root",
    path: "auth/login",
    index: void 0,
    caseSensitive: void 0,
    module: route23
  },
  "routes/_index": {
    id: "routes/_index",
    parentId: "root",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route24
  },
  "routes/auth.$": {
    id: "routes/auth.$",
    parentId: "root",
    path: "auth/*",
    index: void 0,
    caseSensitive: void 0,
    module: route25
  },
  "routes/app": {
    id: "routes/app",
    parentId: "root",
    path: "app",
    index: void 0,
    caseSensitive: void 0,
    module: route26
  },
  "routes/app.active-services": {
    id: "routes/app.active-services",
    parentId: "routes/app",
    path: "active-services",
    index: void 0,
    caseSensitive: void 0,
    module: route27
  },
  "routes/app.additional": {
    id: "routes/app.additional",
    parentId: "routes/app",
    path: "additional",
    index: void 0,
    caseSensitive: void 0,
    module: route28
  },
  "routes/app.insights": {
    id: "routes/app.insights",
    parentId: "routes/app",
    path: "insights",
    index: void 0,
    caseSensitive: void 0,
    module: route29
  },
  "routes/app._index": {
    id: "routes/app._index",
    parentId: "routes/app",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route30
  },
  "routes/app.help": {
    id: "routes/app.help",
    parentId: "routes/app",
    path: "help",
    index: void 0,
    caseSensitive: void 0,
    module: route31
  }
};
const allowedActionOrigins = false;
export {
  allowedActionOrigins,
  serverManifest as assets,
  assetsBuildDirectory,
  basename,
  entry,
  future,
  isSpaMode,
  prerender,
  publicPath,
  routeDiscovery,
  routes,
  ssr
};
