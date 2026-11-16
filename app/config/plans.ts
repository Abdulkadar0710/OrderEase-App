export interface PlanDefinition {
  id: "free" | "starter" | "growth" | "pro";
  name: string;
  monthlyPrice: number;
  yearlyMonthlyEquivalent: number;
  yearlyAnnualTotal: number;
  trialDays: number;
  monthlyOrderLimit: number | null; // null = unlimited
  description: string;
  badge?: string;
  highlight?: boolean;
  features: string[];
  allowedServices: string[];
}

export const PLANS: Record<string, PlanDefinition> = {
  free: {
    id: "free",
    name: "Free",
    monthlyPrice: 0,
    yearlyMonthlyEquivalent: 0,
    yearlyAnnualTotal: 0,
    trialDays: 0,
    monthlyOrderLimit: 25,
    description: "Ideal for new or low-volume stores getting started with order editing.",
    features: [
      "25 edited orders per month",
      "Address, notes, email, and phone edits",
      "Quantity edits before fulfillment",
      "1-hour edit window",
      "3 edits per order allowed",
      "PDF invoice download",
    ],
    allowedServices: [
      "change-address",
      "order-note",
      "contact-info",
      "edit-quantity",
      "download-invoice",
    ],
  },
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPrice: 10,
    yearlyMonthlyEquivalent: 8,
    yearlyAnnualTotal: 96,
    trialDays: 14,
    monthlyOrderLimit: 150,
    description: "For growing stores looking to automate cancellations, exchanges, and shipping updates.",
    features: [
      "Everything in Free",
      "150 edited orders per month",
      "Variant swaps and item exchanges",
      "Self serve order cancel, auto restock",
      "Shipping method upgrades",
      "Configurable edits per order",
      "Configurable preset based edit windows",
    ],
    allowedServices: [
      "change-address",
      "order-note",
      "contact-info",
      "edit-quantity",
      "download-invoice",
      "swap-variant",
      "cancel-order",
      "change-shipping-method",
    ],
  },
  growth: {
    id: "growth",
    name: "Growth",
    monthlyPrice: 29,
    yearlyMonthlyEquivalent: 23.2,
    yearlyAnnualTotal: 278.4,
    trialDays: 14,
    monthlyOrderLimit: 750,
    badge: "Most Popular",
    highlight: true,
    description: "Designed for established brands wanting to boost average order value and prevent returns.",
    features: [
      "Everything in Starter",
      "750 edited orders per month",
      "Add products to open orders",
      "Address autocomplete using google API",
      "Discount codes and upsells",
      "Priority chat support",
    ],
    allowedServices: [
      "change-address",
      "order-note",
      "contact-info",
      "edit-quantity",
      "download-invoice",
      "swap-variant",
      "cancel-order",
      "change-shipping-method",
      "add-product",
      "product-upsell",
      "apply-discount",
    ],
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPrice: 60,
    yearlyMonthlyEquivalent: 48,
    yearlyAnnualTotal: 576,
    trialDays: 14,
    monthlyOrderLimit: null, // unlimited
    description: "For high-volume merchants and wholesale stores needing bulk updates and unlimited volume.",
    features: [
      "Everything in Growth",
      "Unlimited edited orders",
      "Custom order edit time window",
      "Bulk update and CSV upload",
      "Priority chat support",
    ],
    allowedServices: [
      "change-address",
      "order-note",
      "contact-info",
      "edit-quantity",
      "download-invoice",
      "swap-variant",
      "cancel-order",
      "change-shipping-method",
      "add-product",
      "product-upsell",
      "apply-discount",
      "bulk-update",
    ],
  },
};

export const DEFAULT_PLAN_ID = "free";

export function getPlan(planId?: string | null): PlanDefinition {
  if (!planId || !PLANS[planId]) {
    return PLANS.free;
  }
  return PLANS[planId];
}

/**
 * Returns which plan is required to unlock a given serviceId.
 */
export function getRequiredPlanForService(serviceId: string): PlanDefinition {
  if (PLANS.free.allowedServices.includes(serviceId)) {
    return PLANS.free;
  }
  if (PLANS.starter.allowedServices.includes(serviceId)) {
    return PLANS.starter;
  }
  if (PLANS.growth.allowedServices.includes(serviceId)) {
    return PLANS.growth;
  }
  return PLANS.pro;
}

/**
 * Checks if a serviceId is allowed under a given planId.
 */
export function isServiceAllowedOnPlan(planId: string, serviceId: string): boolean {
  const plan = getPlan(planId);
  return plan.allowedServices.includes(serviceId);
}

/**
 * Checks if a time limit preset is allowed under a given planId.
 * - Free: ONLY "1h"
 * - Starter & Growth: Presets ("30m", "1h", "2h", "1d", "2d")
 * - Pro: Presets + "custom"
 */
export function isTimeLimitAllowedOnPlan(planId: string, preset: string): boolean {
  if (planId === "free") {
    return preset === "1h";
  }
  if (planId === "starter" || planId === "growth") {
    return ["30m", "1h", "2h", "1d", "2d"].includes(preset);
  }
  return true; // Pro allows everything including "custom"
}

/**
 * Checks if a max edits limit is allowed under a given planId.
 * - Free: ONLY 3 edits max
 * - Starter, Growth, Pro: Configurable (1, 2, 3, 5, unlimited / 0, custom)
 */
export function isMaxEditsAllowedOnPlan(planId: string, maxEdits: number | null): boolean {
  if (planId === "free") {
    return maxEdits === 3;
  }
  return true; // Starter, Growth, Pro allow any configurable setting
}

/**
 * Checks if Google Places API address autocomplete is allowed under a planId.
 * Allowed on Growth and Pro only.
 */
export function isGooglePlacesAllowedOnPlan(planId: string): boolean {
  return planId === "growth" || planId === "pro";
}

/**
 * Checks if Product Upsell & Recommendations is allowed under a planId.
 * Allowed on Growth and Pro only.
 */
export function isUpsellAllowedOnPlan(planId: string): boolean {
  return planId === "growth" || planId === "pro";
}

/**
 * Checks if Bulk Update & CSV upload is allowed under a planId.
 * Allowed on Pro only.
 */
export function isBulkUpdateAllowedOnPlan(planId: string): boolean {
  return planId === "pro";
}
