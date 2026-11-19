import { describe, it, expect } from "vitest";
import { normalizeShop } from "../app/utils/planHelper.server";
import {
  PLANS,
  getPlan,
  isServiceAllowedOnPlan,
  getRequiredPlanForService,
} from "../app/config/plans";

describe("planHelper and plan configurations", () => {
  it("normalizeShop cleans URLs, trailing slashes, and downcases", () => {
    expect(normalizeShop("https://My-Shop.myshopify.com/")).toBe("my-shop.myshopify.com");
    expect(normalizeShop("http://STORE.myshopify.com/admin/orders")).toBe("store.myshopify.com");
    expect(normalizeShop("test.myshopify.com")).toBe("test.myshopify.com");
  });

  it("getPlan returns free plan fallback for unknown plan IDs", () => {
    expect(getPlan("unknown-plan").id).toBe("free");
    expect(getPlan("starter").id).toBe("starter");
    expect(getPlan("growth").id).toBe("growth");
    expect(getPlan("pro").id).toBe("pro");
  });

  it("verifies allowed services across tiers", () => {
    // Address change is allowed on Free plan
    expect(isServiceAllowedOnPlan("free", "change-address")).toBe(true);

    // Cancel order requires Starter
    expect(isServiceAllowedOnPlan("free", "cancel-order")).toBe(false);
    expect(isServiceAllowedOnPlan("starter", "cancel-order")).toBe(true);

    // Bulk update requires Pro
    expect(isServiceAllowedOnPlan("growth", "bulk-update")).toBe(false);
    expect(isServiceAllowedOnPlan("pro", "bulk-update")).toBe(true);

    // Product upsell is on Growth
    expect(isServiceAllowedOnPlan("growth", "product-upsell")).toBe(true);
  });

  it("returns correct minimum required plan for services", () => {
    expect(getRequiredPlanForService("change-address").id).toBe("free");
    expect(getRequiredPlanForService("cancel-order").id).toBe("starter");
    expect(getRequiredPlanForService("bulk-update").id).toBe("pro");
  });
});
