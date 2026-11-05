import { useState } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useLoaderData, useSearchParams } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";

// Static metadata list matching app.active-services.tsx
const ALL_SERVICES = [
  { id: "add-product", title: "Add Product to Order", category: "Item Management" },
  { id: "product-upsell", title: "Product Upsell & Recommendations", category: "Revenue & Growth" },
  { id: "edit-quantity", title: "Edit Product Quantity", category: "Item Management" },
  { id: "swap-variant", title: "Swap Product Variant", category: "Item Management" },
  { id: "bulk-update", title: "Bulk Update Order Items", category: "Item Management" },
  { id: "change-address", title: "Change Shipping Address", category: "Shipping & Delivery" },
  { id: "change-shipping-method", title: "Change Shipping Method", category: "Shipping & Delivery" },
  { id: "order-note", title: "Add / Edit Order Note", category: "Communication" },
  { id: "contact-info", title: "Update Contact Information", category: "Account & Contact" },
  { id: "apply-discount", title: "Apply Discount Code", category: "Promotions" },
  { id: "cancel-order", title: "Cancel Order", category: "Order Management" },
  { id: "download-invoice", title: "Download & Print Invoice", category: "Billing & Receipts" },
] as const;

export interface CustomerUpdateItem {
  id: string;
  orderId: string;
  numericOrderId: string;
  orderName: string;
  customerName: string;
  customerEmail: string | null;
  orderTotal: string | null;
  financialStatus: string | null;
  fulfillmentStatus: string | null;
  source: string;
  createdAt: string;
  adminOrderUrl: string;
}

export interface PeriodStats {
  totalEditedOrders: number;
  totalEditsCount: number;
  customerAccountEditsCount: number;
  checkoutUiEditsCount: number;
  customerAccountPercent: number;
  checkoutUiPercent: number;
  customerUpdates: CustomerUpdateItem[];
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop;

  const url = new URL(request.url);
  const initialRange = (url.searchParams.get("range") || "today").toLowerCase();

  // 1. Fetch total open orders count from Shopify Admin GraphQL API
  let totalStoreOrders = 0;
  try {
    const ordersRes = await admin.graphql(
      `#graphql
      query getTotalOrdersCount {
        ordersCount(query: "status:open") {
          count
        }
      }`
    );
    const ordersJson = await ordersRes.json();
    totalStoreOrders = ordersJson.data?.ordersCount?.count ?? 0;
  } catch (err) {
    console.error("[insights-loader] Error fetching orders count:", err);
  }

  // 2. Fetch all edited order records from SQLite (EditedOrder)
  const allEditedOrders = await db.editedOrder.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });

  // 3. Batch fetch order details from Shopify Admin GraphQL
  const uniqueOrderIds = Array.from(new Set(allEditedOrders.map((o) => o.orderId)));
  const gidsToFetch = uniqueOrderIds
    .map((id) => (id.startsWith("gid://") ? id : `gid://shopify/Order/${id}`))
    .slice(0, 100);

  const orderInfoMap = new Map<string, any>();
  if (gidsToFetch.length > 0) {
    try {
      const detailsRes = await admin.graphql(
        `#graphql
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
        }`,
        { variables: { ids: gidsToFetch } }
      );
      const detailsJson = await detailsRes.json();
      const nodes = detailsJson.data?.nodes || [];
      for (const node of nodes) {
        if (node?.id) {
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

  // 4. Enrich each edit record with customer and order data
  const shopDomain = shop.replace(/^https?:\/\//, "");
  const shopName = shopDomain.split(".")[0];

  const enrichedEdits: CustomerUpdateItem[] = allEditedOrders.map((record) => {
    const gid = record.orderId.startsWith("gid://")
      ? record.orderId
      : `gid://shopify/Order/${record.orderId}`;
    const numericId = record.orderId.replace(/[^0-9]/g, "");
    const orderInfo = orderInfoMap.get(gid) || orderInfoMap.get(numericId) || null;

    const customerName =
      orderInfo?.customer?.displayName ||
      [orderInfo?.customer?.firstName, orderInfo?.customer?.lastName]
        .filter(Boolean)
        .join(" ") ||
      orderInfo?.customer?.email ||
      "Customer";

    const orderTotal = orderInfo?.totalPriceSet?.shopMoney
      ? `${orderInfo.totalPriceSet.shopMoney.currencyCode} ${Number(
          orderInfo.totalPriceSet.shopMoney.amount
        ).toFixed(2)}`
      : null;

    const adminOrderUrl = `https://admin.shopify.com/store/${shopName}/orders/${numericId}`;

    return {
      id: record.id,
      orderId: record.orderId,
      numericOrderId: numericId,
      orderName: orderInfo?.name || `#${numericId.slice(-4) || numericId}`,
      customerName,
      customerEmail: orderInfo?.customer?.email || null,
      orderTotal,
      financialStatus: orderInfo?.displayFinancialStatus || null,
      fulfillmentStatus: orderInfo?.displayFulfillmentStatus || null,
      source: record.source,
      createdAt: record.createdAt.toISOString(),
      adminOrderUrl,
    };
  });

  // 5. Compute time range boundaries (UTC-aligned)
  const now = new Date();
  const startOfToday = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0)
  );

  const dayOfWeek = now.getUTCDay();
  const diffToMonday = now.getUTCDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
  const startOfWeek = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), diffToMonday, 0, 0, 0, 0)
  );

  const startOfMonth = new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0)
  );

  function buildPeriodStats(startDate: Date | null): PeriodStats {
    const filtered = enrichedEdits.filter((item) => {
      if (!startDate) return true;
      return new Date(item.createdAt) >= startDate;
    });

    const uniqueOrders = new Set(filtered.map((o) => o.orderId));
    const customerAccountEditsCount = filtered.filter(
      (o) => o.source === "customer_account_ui"
    ).length;
    const checkoutUiEditsCount = filtered.filter(
      (o) => o.source === "checkout_ui"
    ).length;
    const totalEditsCount = filtered.length;

    const customerAccountPercent =
      totalEditsCount > 0
        ? Math.round((customerAccountEditsCount / totalEditsCount) * 100)
        : 0;
    const checkoutUiPercent =
      totalEditsCount > 0
        ? Math.round((checkoutUiEditsCount / totalEditsCount) * 100)
        : 0;

    return {
      totalEditedOrders: uniqueOrders.size,
      totalEditsCount,
      customerAccountEditsCount,
      checkoutUiEditsCount,
      customerAccountPercent,
      checkoutUiPercent,
      customerUpdates: filtered,
    };
  }

  const filterStats = {
    today: buildPeriodStats(startOfToday),
    week: buildPeriodStats(startOfWeek),
    month: buildPeriodStats(startOfMonth),
    all: buildPeriodStats(null),
  };

  // 6. Fetch active features count from ServiceSettings
  const serviceSettings = await db.serviceSettings.findMany({
    where: { shop },
  });

  const enabledMap = new Map<string, boolean>();
  serviceSettings.forEach((s) => enabledMap.set(s.id, s.enabled));

  const totalFeatures = ALL_SERVICES.length;
  const activeFeaturesCount = ALL_SERVICES.filter(
    (s) => enabledMap.get(s.id) === true
  ).length;

  // 7. Fetch feature usage frequency from FeatureUsage
  const usageRecords = await db.featureUsage.findMany({
    where: { shop },
  });

  const usageMap = new Map<string, number>();
  usageRecords.forEach((u) => usageMap.set(u.featureId, u.usedCount));

  const featureUsageList = ALL_SERVICES.map((s) => ({
    id: s.id,
    title: s.title,
    category: s.category,
    active: enabledMap.get(s.id) ?? false,
    usageCount: usageMap.get(s.id) ?? 0,
  }));

  return {
    shop,
    initialRange: initialRange as "today" | "week" | "month" | "all",
    filterStats,
    totalStoreOrders,
    activeFeaturesCount,
    totalFeatures,
    featureUsageList,
  };
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

function formatUpdateDate(isoString: string) {
  if (!isoString) return "";
  const date = new Date(isoString);
  const now = new Date();
  const isToday =
    date.getUTCDate() === now.getUTCDate() &&
    date.getUTCMonth() === now.getUTCMonth() &&
    date.getUTCFullYear() === now.getUTCFullYear();

  const timeStr = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) {
    return `Today at ${timeStr}`;
  }
  const dateStr = date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${dateStr} at ${timeStr}`;
}

export default function InsightsPage(): JSX.Element {
  const {
    initialRange,
    filterStats,
    totalStoreOrders,
    activeFeaturesCount,
    totalFeatures,
    featureUsageList,
  } = useLoaderData<typeof loader>();

  const [searchParams, setSearchParams] = useSearchParams();
  const urlRange = searchParams.get("range")?.toLowerCase();
  const activeFilter: "today" | "week" | "month" | "all" =
    urlRange === "today" ||
    urlRange === "week" ||
    urlRange === "month" ||
    urlRange === "all"
      ? urlRange
      : initialRange || "today";

  const handleFilterChange = (rangeKey: "today" | "week" | "month" | "all") => {
    setSearchParams({ range: rangeKey });
  };

  const currentData: PeriodStats = filterStats[activeFilter] || filterStats.today;

  const timeframeLabels: Record<string, string> = {
    today: "Today",
    week: "This Week",
    month: "This Month",
    all: "All Time",
  };
  const timeframeLabel = timeframeLabels[activeFilter] || "Selected Period";

  return (
    <s-page heading="Insights">
      {/* ── Intro Section ── */}
      <s-section heading="Analytics & Performance Overview">
        <s-paragraph color="subdued">
          Monitor customer-initiated order updates across your store. Filter by today, this week, or this month to track real-time edits, channel distribution, and feature usage.
        </s-paragraph>
      </s-section>

      {/* ── Time Period Filter Tabs ── */}
      <s-section heading="Filter by Time Period">
        <s-box padding="base" border="base" borderRadius="base" background="subdued">
          <s-stack direction="inline" gap="small" alignItems="center">
            <s-button
              variant={activeFilter === "today" ? "primary" : "secondary"}
              onClick={() => handleFilterChange("today")}
            >
              Today ({filterStats.today.totalEditsCount})
            </s-button>
            <s-button
              variant={activeFilter === "week" ? "primary" : "secondary"}
              onClick={() => handleFilterChange("week")}
            >
              This Week ({filterStats.week.totalEditsCount})
            </s-button>
            <s-button
              variant={activeFilter === "month" ? "primary" : "secondary"}
              onClick={() => handleFilterChange("month")}
            >
              This Month ({filterStats.month.totalEditsCount})
            </s-button>
            <s-button
              variant={activeFilter === "all" ? "primary" : "secondary"}
              onClick={() => handleFilterChange("all")}
            >
              All Time ({filterStats.all.totalEditsCount})
            </s-button>
          </s-stack>
        </s-box>
      </s-section>

      {/* ── Metric Stat Cards (Period-Filtered) ── */}
      <s-section heading={`Key Metrics (${timeframeLabel})`}>
        <s-grid gridTemplateColumns="repeat(auto-fit, minmax(220px, 1fr))" gap="base">
          {/* Orders Edited Card */}
          <s-box padding="large" border="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                <s-text color="subdued">Orders Edited ({timeframeLabel})</s-text>
                <s-badge tone="success">{currentData.totalEditsCount} edits</s-badge>
              </s-stack>
              <div style={{ fontSize: "32px", fontWeight: "700", color: "#008060" }}>
                {currentData.totalEditedOrders}
              </div>
              <s-text size="small" color="subdued">
                Unique customer orders updated {timeframeLabel.toLowerCase()}
              </s-text>
            </s-stack>
          </s-box>

          {/* Total Open Orders */}
          <s-box padding="large" border="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-text color="subdued">Total Open Orders</s-text>
              <div style={{ fontSize: "32px", fontWeight: "700", color: "#1a1d1f" }}>
                {totalStoreOrders}
              </div>
              <s-text size="small" color="subdued">
                Active orders currently pending fulfillment
              </s-text>
            </s-stack>
          </s-box>

          {/* Active Features */}
          <s-box padding="large" border="base" borderRadius="base">
            <s-stack direction="block" gap="small">
              <s-text color="subdued">Active Features</s-text>
              <div style={{ fontSize: "32px", fontWeight: "700", color: "#2c6ecb" }}>
                {activeFeaturesCount}{" "}
                <span style={{ fontSize: "18px", color: "#6d7175", fontWeight: "400" }}>
                  / {totalFeatures} Enabled
                </span>
              </div>
              <s-text size="small" color="subdued">
                Self-service features available to customers
              </s-text>
            </s-stack>
          </s-box>
        </s-grid>
      </s-section>

      {/* ── Edit Location Source Breakdown (Period-Filtered) ── */}
      <s-section heading={`Edit Location Breakdown (${timeframeLabel})`}>
        <s-box padding="large" border="base" borderRadius="base">
          <s-stack direction="block" gap="large">
            <s-paragraph color="subdued">
              Shows which UI interface customers used to edit their orders during {timeframeLabel.toLowerCase()}.
            </s-paragraph>

            <s-stack direction="block" gap="base">
              {/* Customer Account UI Item */}
              <s-stack direction="block" gap="small">
                <s-grid gridTemplateColumns="1fr auto" alignItems="center">
                  <s-text type="strong">Customer Account UI (Order Status Page)</s-text>
                  <s-text type="strong">
                    {currentData.customerAccountEditsCount} edits ({currentData.customerAccountPercent}%)
                  </s-text>
                </s-grid>
                <div
                  style={{
                    height: "10px",
                    width: "100%",
                    backgroundColor: "#e1e3e5",
                    borderRadius: "5px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${currentData.customerAccountPercent}%`,
                      backgroundColor: "#008060",
                      borderRadius: "5px",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </s-stack>

              {/* Checkout UI Item */}
              <s-stack direction="block" gap="small">
                <s-grid gridTemplateColumns="1fr auto" alignItems="center">
                  <s-text type="strong">Checkout UI (Thank-You Page)</s-text>
                  <s-text type="strong">
                    {currentData.checkoutUiEditsCount} edits ({currentData.checkoutUiPercent}%)
                  </s-text>
                </s-grid>
                <div
                  style={{
                    height: "10px",
                    width: "100%",
                    backgroundColor: "#e1e3e5",
                    borderRadius: "5px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${currentData.checkoutUiPercent}%`,
                      backgroundColor: "#2c6ecb",
                      borderRadius: "5px",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </s-stack>
            </s-stack>
          </s-stack>
        </s-box>
      </s-section>

      {/* ── Customer Order Updates List (Period-Filtered) ── */}
      <s-section heading={`Customer Order Updates (${currentData.customerUpdates.length})`}>
        <s-box padding="large" border="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" justifyContent="space-between" alignItems="center">
              <s-stack direction="block" gap="small">
                <s-text type="strong">Recent Customer Modifications ({timeframeLabel})</s-text>
                <s-paragraph color="subdued">
                  Itemized list of customer order modifications performed {timeframeLabel.toLowerCase()}.
                </s-paragraph>
              </s-stack>

              <s-badge tone={currentData.customerUpdates.length > 0 ? "success" : "neutral"}>
                {currentData.customerUpdates.length} Record{currentData.customerUpdates.length !== 1 ? "s" : ""}
              </s-badge>
            </s-stack>

            <s-divider />

            {currentData.customerUpdates.length === 0 ? (
              <s-box padding="large" background="subdued" borderRadius="base">
                <s-stack direction="block" gap="small" alignItems="center">
                  <s-text type="strong">No customer order updates for {timeframeLabel.toLowerCase()}</s-text>
                  <s-text color="subdued" size="small">
                    When customers edit their items, addresses, or options, their update activity will be recorded and displayed here.
                  </s-text>
                </s-stack>
              </s-box>
            ) : (
              <s-stack direction="block" gap="small">
                {currentData.customerUpdates.map((update) => (
                  <s-box
                    key={update.id}
                    padding="base"
                    border="base"
                    borderRadius="base"
                    background="subdued"
                  >
                    <s-grid gridTemplateColumns="1fr auto" alignItems="center" gap="base">
                      {/* Left: Order, customer & timestamp */}
                      <s-stack direction="block" gap="small">
                        <s-stack direction="inline" gap="small" alignItems="center">
                          <a
                            href={update.adminOrderUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ textDecoration: "none", color: "#2c6ecb", fontWeight: "700" }}
                          >
                            <s-text type="strong" color="interactive">
                              {update.orderName}
                            </s-text>
                          </a>
                          <s-badge tone="neutral">{update.customerName}</s-badge>
                          {update.financialStatus && (
                            <s-badge
                              tone={
                                update.financialStatus === "PAID"
                                  ? "success"
                                  : update.financialStatus.includes("REFUND")
                                  ? "critical"
                                  : "neutral"
                              }
                            >
                              {update.financialStatus}
                            </s-badge>
                          )}
                          {update.orderTotal && (
                            <s-text size="small" color="subdued">
                              • {update.orderTotal}
                            </s-text>
                          )}
                        </s-stack>

                        <s-stack direction="inline" gap="small" alignItems="center">
                          {update.customerEmail && (
                            <s-text size="small" color="subdued">
                              {update.customerEmail} •
                            </s-text>
                          )}
                          <s-text size="small" color="subdued">
                            Updated {formatUpdateDate(update.createdAt)}
                          </s-text>
                        </s-stack>
                      </s-stack>

                      {/* Right: Channel badge & direct admin order link */}
                      <s-stack direction="inline" gap="small" alignItems="center">
                        <s-badge
                          tone={
                            update.source === "customer_account_ui"
                              ? "success"
                              : "info"
                          }
                        >
                          {update.source === "customer_account_ui"
                            ? "Customer Account UI"
                            : "Checkout UI"}
                        </s-badge>

                        <a
                          href={update.adminOrderUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{ textDecoration: "none" }}
                        >
                          <s-button variant="secondary">
                            View Order ↗
                          </s-button>
                        </a>
                      </s-stack>
                    </s-grid>
                  </s-box>
                ))}
              </s-stack>
            )}
          </s-stack>
        </s-box>
      </s-section>

      {/* ── Feature Usage Frequency Table ── */}
      <s-section heading="Feature Usage Frequency (All Time)">
        <s-box padding="large" border="base" borderRadius="base">
          <s-stack direction="block" gap="base">
            {featureUsageList.map((item) => (
              <s-box
                key={item.id}
                padding="base"
                border="base"
                borderRadius="base"
                background="subdued"
              >
                <s-grid gridTemplateColumns="1fr auto auto" alignItems="center" gap="base">
                  <s-stack direction="block" gap="small">
                    <s-stack direction="inline" alignItems="center" gap="base">
                      <s-text type="strong">{item.title}</s-text>
                      <s-badge tone={item.active ? "success" : "neutral"}>
                        {item.active ? "Active" : "Inactive"}
                      </s-badge>
                    </s-stack>
                    <s-text color="subdued">{item.category}</s-text>
                  </s-stack>

                  <div style={{ textAlign: "right" }}>
                    <s-badge tone={item.usageCount > 0 ? "info" : "neutral"}>
                      {item.usageCount} {item.usageCount === 1 ? "use" : "uses"}
                    </s-badge>
                  </div>
                </s-grid>
              </s-box>
            ))}
          </s-stack>
        </s-box>
      </s-section>
    </s-page>
  );
}
