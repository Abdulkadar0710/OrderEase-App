import { useState } from "react";
import type { ActionFunctionArgs, HeadersFunction, LoaderFunctionArgs } from "react-router";
import { useFetcher, useLoaderData } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { PLANS, getPlan } from "../config/plans";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const shop = session.shop
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase()
    .trim();

  // 1. Fetch current subscription for this shop
  let subscription = await db.merchantSubscription.findUnique({
    where: { shop },
  });

  if (!subscription) {
    subscription = await db.merchantSubscription.create({
      data: {
        shop,
        planId: "free",
        billingCycle: "monthly",
      },
    });
  }

  // 2. Count edited orders for current month
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
  const { session } = await authenticate.admin(request);
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
    const updated = await db.merchantSubscription.upsert({
      where: { shop },
      create: {
        shop,
        planId: targetPlanId,
        billingCycle,
      },
      update: {
        planId: targetPlanId,
        billingCycle,
      },
    });

    const targetPlan = PLANS[targetPlanId];
    // Automatically disable any active services that are not allowed on the new plan
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

    if (targetPlanId === "free") {
      await db.orderEditTimeLimit.upsert({
        where: { shop },
        create: { shop, timeLimit: "1h", maxEdits: 3 },
        update: { timeLimit: "1h", maxEdits: 3 },
      });
    } else if (targetPlanId === "pro") {
      // Pro includes Unlimited edited orders by default (0 represents unlimited)
      await db.orderEditTimeLimit.upsert({
        where: { shop },
        create: { shop, timeLimit: "1h", maxEdits: 0 },
        update: { maxEdits: 0 },
      });
    } else if (targetPlanId !== "pro") {
      const tl = await db.orderEditTimeLimit.findUnique({ where: { shop } });
      if (tl?.timeLimit === "custom") {
        await db.orderEditTimeLimit.update({
          where: { shop },
          data: { timeLimit: "1h" },
        });
      }
    }

    return { ok: true, subscription: updated };
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
                <s-text type="strong" style={{ fontSize: "16px" }}>
                  Current Plan: <span style={{ textTransform: "capitalize", color: "#008060" }}>{activePlan.name}</span>
                </s-text>
                <s-paragraph color="subdued" style={{ marginTop: "4px" }}>
                  {activePlan.monthlyOrderLimit === null
                    ? `Unlimited monthly edited orders (${editedOrdersCount} edits this month)`
                    : `${editedOrdersCount} of ${activePlan.monthlyOrderLimit} monthly edited orders used`}
                </s-paragraph>
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
