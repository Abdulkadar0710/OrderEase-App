import { useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate, PLAN_NAMES } from "../shopify.server";
import db from "../db.server";
import { PLANS, getPlan } from "../config/plans";

async function isTestBilling(admin: any, shop: string): Promise<boolean> {
  if (process.env.BILLING_TEST_MODE === "true" || process.env.SHOPIFY_BILLING_TEST === "true") {
    return true;
  }
  if (process.env.BILLING_TEST_MODE === "false") {
    return false;
  }
  if (process.env.NODE_ENV !== "production") {
    return true;
  }

  // Auto-detect partner development / test stores via Shopify Admin GraphQL
  try {
    const res = await admin.graphql(`#graphql
      query getShopPlan {
        shop {
          plan {
            partnerDevelopment
          }
        }
      }
    `);
    const json: any = await res.json();
    if (json.data?.shop?.plan?.partnerDevelopment) {
      return true;
    }
  } catch (e) {
    console.warn("[app.pricing] Failed to query shop plan:", e);
  }

  // Fallback domain check for dev / test stores
  if (shop.includes("test") || shop.includes("dev")) {
    return true;
  }

  return false;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, billing, admin } = await authenticate.admin(request);
  const shop = session.shop
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase()
    .trim();

  // 1. Check with Shopify Billing for any active paid plan
  let activePaidPlanId: "starter" | "growth" | "pro" | null = null;
  let activeBillingCycle: "monthly" | "yearly" = "monthly";

  try {
    const isTest = await isTestBilling(admin, shop);
    let billingCheck = await billing.check({
      plans: Object.values(PLAN_NAMES),
      isTest,
    });

    if (!billingCheck.hasActivePayment) {
      try {
        const fallbackCheck = await billing.check({
          plans: Object.values(PLAN_NAMES),
          isTest: !isTest,
        });
        if (fallbackCheck.hasActivePayment) {
          billingCheck = fallbackCheck;
        }
      } catch (_) {}
    }

    if (billingCheck.hasActivePayment && billingCheck.appSubscriptions?.length > 0) {
      const activeSub = billingCheck.appSubscriptions[0];
      const match = Object.entries(PLAN_NAMES).find(([_, name]) => name === activeSub.name);
      if (match) {
        const [planKey] = match;
        const [pId, cycle] = planKey.split("_") as [
          "starter" | "growth" | "pro",
          "monthly" | "yearly",
        ];
        activePaidPlanId = pId;
        activeBillingCycle = cycle;
      }
    }
  } catch (err) {
    console.warn("[app.pricing] Error checking Shopify billing:", err);
  }

  // 2. Fetch or sync current subscription in database
  let subscription = await db.merchantSubscription.findUnique({
    where: { shop },
  });

  const verifiedPlanId = activePaidPlanId || "free";
  const verifiedBillingCycle = activePaidPlanId
    ? activeBillingCycle
    : subscription?.billingCycle || "monthly";

  if (!subscription) {
    subscription = await db.merchantSubscription.create({
      data: {
        shop,
        planId: verifiedPlanId,
        billingCycle: verifiedBillingCycle,
      },
    });
  } else if (
    subscription.planId !== verifiedPlanId ||
    (activePaidPlanId && subscription.billingCycle !== verifiedBillingCycle)
  ) {
    subscription = await db.merchantSubscription.update({
      where: { shop },
      data: {
        planId: verifiedPlanId,
        billingCycle: verifiedBillingCycle,
      },
    });
  }

  // 3. Count edited orders for current month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const editedOrdersCount = await db.editedOrder.count({
    where: {
      shop,
      createdAt: { gte: startOfMonth },
    },
  });

  return {
    shop,
    subscription,
    editedOrdersCount,
    plans: Object.values(PLANS),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, billing, admin } = await authenticate.admin(request);
  const shop = session.shop
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase()
    .trim();

  const formData = await request.formData();
  const intent = formData.get("intent") as string;
  const targetPlanId = formData.get("planId") as string;
  const billingCycle = (formData.get("billingCycle") as string) || "monthly";

  if (intent === "selectPlan" && targetPlanId && PLANS[targetPlanId]) {
    const isTest = await isTestBilling(admin, shop);

    // 1. If merchant selects the Free plan, cancel any active paid Shopify subscriptions
    if (targetPlanId === "free") {
      try {
        let billingCheck = await billing.check({
          plans: Object.values(PLAN_NAMES),
          isTest,
        });
        if (!billingCheck.hasActivePayment) {
          try {
            const fallbackCheck = await billing.check({
              plans: Object.values(PLAN_NAMES),
              isTest: !isTest,
            });
            if (fallbackCheck.hasActivePayment) {
              billingCheck = fallbackCheck;
            }
          } catch (_) {}
        }
        if (billingCheck.hasActivePayment && billingCheck.appSubscriptions?.length > 0) {
          for (const sub of billingCheck.appSubscriptions) {
            await billing.cancel({
              subscriptionId: sub.id,
              isTest: sub.test ?? isTest,
            });
          }
        }
      } catch (err) {
        console.warn("[app.pricing] Error cancelling existing subscriptions:", err);
      }

      const updated = await db.merchantSubscription.upsert({
        where: { shop },
        create: {
          shop,
          planId: "free",
          billingCycle,
        },
        update: {
          planId: "free",
          billingCycle,
        },
      });

      const targetPlan = PLANS.free;
      const allServices = await db.serviceSettings.findMany({ where: { shop } });
      const disallowed = allServices.filter(
        (s) => s.enabled && !targetPlan.allowedServices.includes(s.id),
      );
      if (disallowed.length > 0) {
        await db.serviceSettings.updateMany({
          where: {
            shop,
            id: { in: disallowed.map((d) => d.id) },
          },
          data: { enabled: false },
        });
      }

      await db.orderEditTimeLimit.upsert({
        where: { shop },
        create: { shop, timeLimit: "1h", maxEdits: 3 },
        update: { timeLimit: "1h", maxEdits: 3 },
      });

      return { ok: true, subscription: updated };
    }

    // 2. Paid plans (starter, growth, pro):
    // Do NOT directly update db.merchantSubscription!
    // Request billing from Shopify. When approved, Shopify redirects back to the app,
    // and loader verifies the active subscription before updating the DB.
    const planKey = `${targetPlanId}_${
      billingCycle === "yearly" ? "yearly" : "monthly"
    }` as keyof typeof PLAN_NAMES;
    const planName = PLAN_NAMES[planKey];

    if (!planName) {
      return { ok: false, error: "Invalid plan or billing cycle" };
    }

    const host = new URL(request.url).searchParams.get("host") || "";
    const returnUrl = `https://${shop}/admin/apps/${process.env.SHOPIFY_API_KEY}/app/pricing${
      host ? `?host=${encodeURIComponent(host)}` : ""
    }`;

    console.log(
      `[app.pricing] Requesting subscription "${planName}" for shop "${shop}" (isTest: ${isTest})`,
    );

    return await billing.request({
      plan: planName,
      isTest,
      returnUrl,
    });
  }

  return { ok: false, error: "Invalid action" };
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

export default function PricingPage(): JSX.Element {
  const { subscription, editedOrdersCount, plans } = useLoaderData<typeof loader>();
  const fetcher = useFetcher();

  const [billingCycle, setBillingCycle] = useState<"monthly" | "yearly">(
    (subscription.billingCycle as "monthly" | "yearly") || "monthly"
  );

  const activePlanId = fetcher.data?.subscription?.planId || subscription.planId;
  const activePlan = getPlan(activePlanId);

  const isYearly = billingCycle === "yearly";

  const handleSelectPlan = (planId: string) => {
    fetcher.submit(
      {
        intent: "selectPlan",
        planId,
        billingCycle,
      },
      { method: "post" }
    );
  };

  return (
    <s-page heading="Plans & Pricing">
      {/* ── Top Summary & Usage Banner ── */}
      <s-section>
        <s-box padding="large" border="base" borderRadius="base" background="subdued">
          <s-stack direction="block" gap="small">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "12px" }}>
              <div>
                <div style={{ fontSize: "16px" }}>
                  <s-text type="strong">
                    Current Plan: <span style={{ textTransform: "capitalize", color: "#008060" }}>{activePlan.name}</span>
                  </s-text>
                </div>
                <div style={{ marginTop: "4px" }}>
                  <s-paragraph color="subdued">
                    {activePlan.monthlyOrderLimit === null
                      ? `Unlimited monthly edited orders (${editedOrdersCount} edits this month)`
                      : `${editedOrdersCount} of ${activePlan.monthlyOrderLimit} monthly edited orders used`}
                  </s-paragraph>
                </div>
              </div>

              {/* Billing Toggle (Monthly vs Yearly) */}
              <div
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  backgroundColor: "#ffffff",
                  padding: "4px",
                  borderRadius: "8px",
                  border: "1px solid #c9cccf",
                  gap: "4px",
                }}
              >
                <button
                  type="button"
                  onClick={() => setBillingCycle("monthly")}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "none",
                    fontWeight: !isYearly ? "600" : "400",
                    backgroundColor: !isYearly ? "#008060" : "transparent",
                    color: !isYearly ? "#ffffff" : "#202223",
                    cursor: "pointer",
                    fontSize: "13px",
                    transition: "all 0.15s ease",
                  }}
                >
                  Monthly Billing
                </button>
                <button
                  type="button"
                  onClick={() => setBillingCycle("yearly")}
                  style={{
                    padding: "6px 14px",
                    borderRadius: "6px",
                    border: "none",
                    fontWeight: isYearly ? "600" : "400",
                    backgroundColor: isYearly ? "#008060" : "transparent",
                    color: isYearly ? "#ffffff" : "#202223",
                    cursor: "pointer",
                    fontSize: "13px",
                    transition: "all 0.15s ease",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <span>Yearly Billing</span>
                  <span
                    style={{
                      fontSize: "11px",
                      backgroundColor: isYearly ? "#ffffff" : "#e4f7eb",
                      color: isYearly ? "#008060" : "#007a5c",
                      padding: "2px 6px",
                      borderRadius: "10px",
                      fontWeight: "700",
                    }}
                  >
                    Save 20%
                  </span>
                </button>
              </div>
            </div>

            {/* Usage Progress Bar */}
            {activePlan.monthlyOrderLimit !== null && (
              <div style={{ marginTop: "12px" }}>
                <div
                  style={{
                    height: "8px",
                    width: "100%",
                    backgroundColor: "#e1e3e5",
                    borderRadius: "4px",
                    overflow: "hidden",
                  }}
                >
                  <div
                    style={{
                      height: "100%",
                      width: `${Math.min(100, Math.round((editedOrdersCount / activePlan.monthlyOrderLimit) * 100))}%`,
                      backgroundColor:
                        editedOrdersCount >= activePlan.monthlyOrderLimit ? "#d82c0d" : "#008060",
                      borderRadius: "4px",
                      transition: "width 0.3s ease",
                    }}
                  />
                </div>
              </div>
            )}
          </s-stack>
        </s-box>
      </s-section>

      {/* ── Pricing Cards Grid ── */}
      <s-section heading="Available Plans">
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: "16px",
            alignItems: "stretch",
          }}
        >
          {plans.map((plan) => {
            const isCurrent = activePlanId === plan.id;
            const priceDisplay =
              plan.monthlyPrice === 0
                ? "$0"
                : isYearly
                ? `$${plan.yearlyMonthlyEquivalent.toFixed(plan.yearlyMonthlyEquivalent % 1 === 0 ? 0 : 2)}`
                : `$${plan.monthlyPrice}`;

            const periodLabel = plan.monthlyPrice === 0 ? "Free Forever" : isYearly ? "/month (billed yearly)" : "/month";

            return (
              <div
                key={plan.id}
                style={{
                  border: isCurrent ? "2px solid #008060" : plan.highlight ? "2px solid #5c6ac4" : "1px solid #d2d5d8",
                  borderRadius: "12px",
                  padding: "20px",
                  backgroundColor: "#ffffff",
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "space-between",
                  position: "relative",
                  boxShadow: plan.highlight ? "0 4px 12px rgba(92,106,196,0.12)" : "none",
                }}
              >
                {/* Badge */}
                {plan.badge && (
                  <div
                    style={{
                      position: "absolute",
                      top: "-11px",
                      right: "20px",
                      backgroundColor: "#5c6ac4",
                      color: "#ffffff",
                      fontSize: "11px",
                      fontWeight: "700",
                      padding: "3px 10px",
                      borderRadius: "12px",
                      textTransform: "uppercase",
                      letterSpacing: "0.5px",
                    }}
                  >
                    {plan.badge}
                  </div>
                )}

                <div>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <h2 style={{ fontSize: "20px", fontWeight: "700", margin: "0 0 6px 0", color: "#202223" }}>
                      {plan.name}
                    </h2>
                    {isCurrent && (
                      <span
                        style={{
                          fontSize: "11px",
                          backgroundColor: "#e4f7eb",
                          color: "#007a5c",
                          fontWeight: "700",
                          padding: "3px 8px",
                          borderRadius: "6px",
                        }}
                      >
                        Active Plan
                      </span>
                    )}
                  </div>

                  {/* Price */}
                  <div style={{ margin: "14px 0 8px 0" }}>
                    <span style={{ fontSize: "32px", fontWeight: "800", color: "#202223" }}>{priceDisplay}</span>
                    <span style={{ fontSize: "13px", color: "#6d7175", marginLeft: "4px" }}>{periodLabel}</span>
                  </div>

                  {/* Yearly Billing Total or Trial Info */}
                  <div style={{ minHeight: "22px", marginBottom: "16px" }}>
                    {plan.monthlyPrice > 0 && isYearly && (
                      <span style={{ fontSize: "12px", color: "#008060", fontWeight: "600" }}>
                        ${plan.yearlyAnnualTotal}/year (includes 14-day trial)
                      </span>
                    )}
                    {plan.monthlyPrice > 0 && !isYearly && (
                      <span style={{ fontSize: "12px", color: "#6d7175" }}>Includes 14-day free trial</span>
                    )}
                    {plan.monthlyPrice === 0 && (
                      <span style={{ fontSize: "12px", color: "#6d7175" }}>No credit card required</span>
                    )}
                  </div>

                  <hr style={{ border: "none", borderTop: "1px solid #f1f2f3", margin: "14px 0" }} />

                  {/* Features List */}
                  <ul style={{ listStyle: "none", padding: 0, margin: "0 0 20px 0" }}>
                    {plan.features.map((feat, idx) => (
                      <li
                        key={idx}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          fontSize: "13px",
                          color: "#303030",
                          lineHeight: "1.4",
                          marginBottom: "10px",
                        }}
                      >
                        <span style={{ color: "#008060", fontWeight: "bold", marginRight: "8px", flexShrink: 0 }}>
                          ✓
                        </span>
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Plan Action Button */}
                <button
                  type="button"
                  disabled={isCurrent || fetcher.state === "submitting"}
                  onClick={() => handleSelectPlan(plan.id)}
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    fontWeight: "600",
                    fontSize: "14px",
                    cursor: isCurrent ? "default" : "pointer",
                    border: isCurrent ? "1px solid #c9cccf" : "none",
                    backgroundColor: isCurrent
                      ? "#f6f6f7"
                      : plan.highlight
                      ? "#5c6ac4"
                      : "#008060",
                    color: isCurrent ? "#8c9196" : "#ffffff",
                    transition: "all 0.15s ease",
                  }}
                >
                  {isCurrent ? "Current Plan" : "Choose Plan"}
                </button>
              </div>
            );
          })}
        </div>
      </s-section>

      {/* ── Feature Comparison Matrix ── */}
      <s-section heading="Full Feature Comparison">
        <s-box padding="large" border="base" borderRadius="base" background="subdued">
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
              <thead>
                <tr style={{ borderBottom: "2px solid #c9cccf", textAlign: "left" }}>
                  <th style={{ padding: "12px", width: "36%" }}>Feature / Capability</th>
                  <th style={{ padding: "12px", textAlign: "center", width: "16%" }}>Free ($0)</th>
                  <th style={{ padding: "12px", textAlign: "center", width: "16%" }}>Starter ($10)</th>
                  <th style={{ padding: "12px", textAlign: "center", width: "16%" }}>Growth ($29)</th>
                  <th style={{ padding: "12px", textAlign: "center", width: "16%" }}>Pro ($60)</th>
                </tr>
              </thead>
              <tbody>
                <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                  <td style={{ padding: "10px 12px", fontWeight: "600" }}>Monthly Edited Orders</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>25</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>150</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>750</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: "700", color: "#008060" }}>
                    Unlimited
                  </td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                  <td style={{ padding: "10px 12px" }}>Customer Accounts & Checkout UI Portals</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                  <td style={{ padding: "10px 12px" }}>Address, Notes, Email & Phone Edits</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                  <td style={{ padding: "10px 12px" }}>Quantity Adjustments</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                  <td style={{ padding: "10px 12px" }}>Instant PDF Invoice Download</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                  <td style={{ padding: "10px 12px" }}>Edit Time Windows</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>1 Hour (Fixed)</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>Configurable Presets</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>Configurable Presets</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: "600" }}>Custom (Exact Mins/Hours)</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                  <td style={{ padding: "10px 12px" }}>Allowed Edits Per Order</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>3 Edits Max</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>Configurable</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>Configurable</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>Configurable</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                  <td style={{ padding: "10px 12px" }}>Variant Swaps & Item Exchanges</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#8c9196" }}>—</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                  <td style={{ padding: "10px 12px" }}>Self-Serve Order Cancel & Auto-Restock</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#8c9196" }}>—</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                  <td style={{ padding: "10px 12px" }}>Shipping Method Upgrades</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#8c9196" }}>—</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                  <td style={{ padding: "10px 12px" }}>Add New Products to Open Orders</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#8c9196" }}>—</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#8c9196" }}>—</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                  <td style={{ padding: "10px 12px" }}>Address Autocomplete using Google API</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#8c9196" }}>—</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#8c9196" }}>—</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                  <td style={{ padding: "10px 12px" }}>Discount Codes & Upsell Carousels</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#8c9196" }}>—</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#8c9196" }}>—</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                </tr>
                <tr style={{ borderBottom: "1px solid #e1e3e5" }}>
                  <td style={{ padding: "10px 12px" }}>Bulk Order Update & CSV Upload</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#8c9196" }}>—</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#8c9196" }}>—</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#8c9196" }}>—</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", color: "#008060" }}>✓</td>
                </tr>
                <tr>
                  <td style={{ padding: "10px 12px" }}>Support Tier</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>Help Center</td>
                  <td style={{ padding: "10px 12px", textAlign: "center" }}>Standard Email</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: "600" }}>Priority Chat</td>
                  <td style={{ padding: "10px 12px", textAlign: "center", fontWeight: "600" }}>Priority Chat</td>
                </tr>
              </tbody>
            </table>
          </div>
        </s-box>
      </s-section>
    </s-page>
  );
}
