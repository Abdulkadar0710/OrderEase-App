import { useEffect, useRef, useState } from "react";
import { useFetcher, useLoaderData } from "react-router";
import type {
  ActionFunctionArgs,
  HeadersFunction,
  LoaderFunctionArgs,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import {
  getRequiredPlanForService,
  isServiceAllowedOnPlan,
  isTimeLimitAllowedOnPlan,
  isMaxEditsAllowedOnPlan,
  isGooglePlacesAllowedOnPlan,
  isUpsellAllowedOnPlan,
} from "../config/plans";
import { getMerchantPlan, getMonthlyQuotaStatus } from "../utils/planHelper.server";

const SSwitch = "s-switch" as any;

// ─── GraphQL Queries & Mutations for Product Tags & Upsell ───────────────

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

// ─── Service definitions (static metadata) ─────────────────────────────────

const SERVICES = [
  {
    id: "add-product",
    title: "Add Product to Order",
    description:
      "Allow customers to add new products or additional items to their unfulfilled order.",
    category: "Item Management",
  },
  {
    id: "product-upsell",
    title: "Product Upsell & Recommendations",
    description:
      "Offer smart product recommendations and upsells directly on the order edit page.",
    category: "Revenue & Growth",
  },
  {
    id: "edit-quantity",
    title: "Edit Product Quantity",
    description:
      "Let customers increase or decrease quantities of line items in existing orders.",
    category: "Item Management",
  },
  {
    id: "swap-variant",
    title: "Swap Product Variant",
    description:
      "Enable customers to switch product size, color, or variant options easily.",
    category: "Item Management",
  },
  {
    id: "bulk-update",
    title: "Bulk Update Order Items",
    description:
      "Allow customers to bulk add, adjust quantities, swap variants, or replace items via CSV upload.",
    category: "Item Management",
  },
  {
    id: "change-address",
    title: "Change Shipping Address",
    description:
      "Allow customers to update their delivery address before order dispatch.",
    category: "Shipping & Delivery",
  },
  {
    id: "change-shipping-method",
    title: "Change Shipping Method",
    description:
      "Let customers upgrade or change their selected shipping method and speed.",
    category: "Shipping & Delivery",
  },
  {
    id: "order-note",
    title: "Add / Edit Order Note",
    description:
      "Allow customers to leave special instructions, gift notes, or delivery hints.",
    category: "Communication",
  },
  {
    id: "contact-info",
    title: "Update Contact Information",
    description:
      "Enable customers to update email address or phone number on pending orders.",
    category: "Account & Contact",
  },
  {
    id: "apply-discount",
    title: "Apply Discount Code",
    description:
      "Allow customers to apply coupon codes or promotional discounts to active orders.",
    category: "Promotions",
  },
  {
    id: "cancel-order",
    title: "Cancel Order",
    description:
      "Provide self-serve order cancellation within merchant-defined time limits.",
    category: "Order Management",
  },
  {
    id: "download-invoice",
    title: "Download & Print Invoice",
    description:
      "Provide downloadable PDF invoices on customer order status pages.",
    category: "Billing & Receipts",
  },
] as const;

// ─── Loader ────────────────────────────────────────────────────────────────

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase()
    .trim();

  // 1. Fetch merchant's active plan and monthly quota
  const plan = await getMerchantPlan(shop);
  const quota = await getMonthlyQuotaStatus(shop);

  // 2. Fetch existing settings rows for this shop
  let rows = await db.serviceSettings.findMany({
    where: { shop },
  });

  const existingIds = new Set(rows.map((r) => r.id));
  const missingServices = SERVICES.filter((s) => !existingIds.has(s.id));

  // Auto-seed any missing service rows in the database as enabled: false
  if (missingServices.length > 0) {
    console.log(
      `[ActiveServices Loader] Seeding ${missingServices.length} missing services in DB with enabled=false for shop ${shop}`,
    );
    await db.serviceSettings.createMany({
      data: missingServices.map((s) => ({
        id: s.id,
        shop,
        enabled: false,
      })),
    });

    // Re-fetch updated rows
    rows = await db.serviceSettings.findMany({
      where: { shop },
    });
  }

  // 3. Auto-fix: if any service is marked enabled in DB but NOT allowed on current plan, reset it to false
  const unallowedEnabledServices = rows.filter(
    (r) => r.enabled && !isServiceAllowedOnPlan(plan.id, r.id),
  );
  if (unallowedEnabledServices.length > 0) {
    console.log(
      `[ActiveServices Loader] Disabling ${unallowedEnabledServices.length} unallowed services for shop ${shop} on plan ${plan.id}`,
    );
    await db.serviceSettings.updateMany({
      where: {
        shop,
        id: { in: unallowedEnabledServices.map((s) => s.id) },
      },
      data: { enabled: false },
    });
    rows = await db.serviceSettings.findMany({ where: { shop } });
  }

  // 4. Build a lookup map: serviceId -> enabled
  const dbMap: Record<string, boolean> = {};
  rows.forEach((row) => {
    dbMap[row.id] = row.enabled;
  });

  // 5. Map services with DB state and plan gating metadata
  const services = SERVICES.map((s) => {
    const isAllowed = isServiceAllowedOnPlan(plan.id, s.id);
    const requiredPlan = getRequiredPlanForService(s.id);
    return {
      ...s,
      isAllowed,
      requiredPlan: {
        id: requiredPlan.id,
        name: requiredPlan.name,
        monthlyPrice: requiredPlan.monthlyPrice,
      },
      enabled: isAllowed ? (dbMap[s.id] ?? false) : false,
    };
  });

  // 6. Fetch time limit setting for this shop
  let timeLimitRecord = await db.orderEditTimeLimit.findUnique({
    where: { shop },
  });

  if (!timeLimitRecord) {
    timeLimitRecord = await db.orderEditTimeLimit.create({
      data: {
        shop,
        timeLimit: "1h",
        customValue: 1,
        customUnit: "hours",
        maxEdits: 3,
      },
    });
  }

  // 7. Fetch Google Places API Key configuration for this shop
  const googleConfig = await db.googlePlacesConfig.findUnique({
    where: { shop },
  });

  // 8. Initial products array (populated upon user search)
  const initialProducts: Array<{
    id: string;
    title: string;
    handle: string;
    tags: string[];
    imageUrl: string;
  }> = [];

  const effectiveTimeLimit = plan.id === "free" ? "1h" : (timeLimitRecord.timeLimit || "1h");
  let effectiveMaxEdits = timeLimitRecord.maxEdits ?? 3;
  if (plan.id === "free") {
    effectiveMaxEdits = 3;
  } else if (plan.id === "pro") {
    effectiveMaxEdits =
      timeLimitRecord.maxEdits && timeLimitRecord.maxEdits !== 3
        ? timeLimitRecord.maxEdits
        : 0;
  }

  return {
    shop,
    plan: {
      id: plan.id,
      name: plan.name,
      monthlyPrice: plan.monthlyPrice,
      monthlyOrderLimit: plan.monthlyOrderLimit,
    },
    quota: {
      usedCount: quota.usedCount,
      limit: quota.limit,
      isExceeded: quota.isExceeded,
    },
    services,
    timeLimitSettings: {
      timeLimit: effectiveTimeLimit,
      customValue: timeLimitRecord.customValue ?? 1,
      customUnit: timeLimitRecord.customUnit ?? "hours",
      maxEdits: effectiveMaxEdits,
    },
    hasGoogleApiKey: Boolean(
      isGooglePlacesAllowedOnPlan(plan.id) &&
        googleConfig?.apiKey &&
        googleConfig.apiKey.trim().length > 0,
    ),
    isGooglePlacesAllowed: isGooglePlacesAllowedOnPlan(plan.id),
    isUpsellAllowed: isUpsellAllowedOnPlan(plan.id),
    initialProducts,
  };
};

// ─── Action — toggle service, save time/edit limits, or save Google API key ───

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const shop = session.shop
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase()
    .trim();

  const plan = await getMerchantPlan(shop);
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "addProductTag") {
    if (!isUpsellAllowedOnPlan(plan.id)) {
      return {
        ok: false,
        error:
          "Product Upsells & Recommendations require the Growth plan ($29/mo) or higher.",
      };
    }
    const productId = formData.get("productId") as string;
    const tag = (formData.get("tag") as string)?.trim();

    if (!productId || !tag) {
      return { ok: false, error: "Product ID and Tag are required" };
    }

    console.log(
      `[ActiveServices Action] Adding tag "${tag}" to product ${productId}`,
    );
    const res = await admin.graphql(ADD_TAGS_MUTATION, {
      variables: { id: productId, tags: [tag] },
    });
    const json = await res.json();
    const errors = json.data?.tagsAdd?.userErrors ?? [];

    if (errors.length > 0) {
      return { ok: false, error: errors[0].message };
    }

    return { ok: true, type: "productTag", action: "added", productId, tag };
  }

  if (intent === "removeProductTag") {
    if (!isUpsellAllowedOnPlan(plan.id)) {
      return {
        ok: false,
        error:
          "Product Upsells & Recommendations require the Growth plan ($29/mo) or higher.",
      };
    }
    const productId = formData.get("productId") as string;
    const tag = (formData.get("tag") as string)?.trim();

    if (!productId || !tag) {
      return { ok: false, error: "Product ID and Tag are required" };
    }

    console.log(
      `[ActiveServices Action] Removing tag "${tag}" from product ${productId}`,
    );
    const res = await admin.graphql(REMOVE_TAGS_MUTATION, {
      variables: { id: productId, tags: [tag] },
    });
    const json = await res.json();
    const errors = json.data?.tagsRemove?.userErrors ?? [];

    if (errors.length > 0) {
      return { ok: false, error: errors[0].message };
    }

    return { ok: true, type: "productTag", action: "removed", productId, tag };
  }

  if (intent === "searchProducts") {
    if (!isUpsellAllowedOnPlan(plan.id)) {
      return {
        ok: false,
        error:
          "Product Upsells & Recommendations require the Growth plan ($29/mo) or higher.",
      };
    }
    const query = (formData.get("query") as string)?.trim() || "";
    console.log(
      `[ActiveServices Action] Searching products with query "${query}"`,
    );

    const res = await admin.graphql(GET_PRODUCTS_QUERY, {
      variables: {
        first: 12,
        query: query ? `title:*${query}* OR tag:*${query}*` : undefined,
      },
    });
    const json = await res.json();
    const edges = json.data?.products?.edges ?? [];
    const products = edges.map((e: any) => ({
      id: e.node.id,
      title: e.node.title,
      handle: e.node.handle,
      tags: e.node.tags || [],
      imageUrl: e.node.featuredMedia?.preview?.image?.url || "",
    }));

    return { ok: true, type: "searchProducts", products };
  }

  if (intent === "saveGoogleApiKey") {
    if (!isGooglePlacesAllowedOnPlan(plan.id)) {
      return {
        ok: false,
        type: "googleApiKey",
        error:
          "Google Places address autocomplete requires the Growth plan ($29/mo) or higher.",
      };
    }
    const apiKeyRaw = formData.get("googleApiKey") as string;
    const apiKey = apiKeyRaw ? apiKeyRaw.trim() : null;

    if (!apiKey) {
      return {
        ok: false,
        type: "googleApiKey",
        error: "Enter a Google Places API key to save, or use Delete Key to remove the saved key.",
      };
    }

    console.log(
      `[ActiveServices Action] Saving Google Places API Key: shop=${shop}, hasKey=${Boolean(apiKey)}`,
    );

    await db.googlePlacesConfig.upsert({
      where: { shop },
      create: {
        shop,
        apiKey,
      },
      update: {
        apiKey,
      },
    });

    return {
      ok: true,
      type: "googleApiKey",
      action: "saved",
      hasGoogleApiKey: true,
    };
  }

  if (intent === "deleteGoogleApiKey") {
    console.log(
      `[ActiveServices Action] Deleting Google Places API Key for shop=${shop}`,
    );

    try {
      await db.googlePlacesConfig.delete({
        where: { shop },
      });
    } catch (e) {
      // If record didn't exist in DB, ensure it's set to null
      await db.googlePlacesConfig.upsert({
        where: { shop },
        create: { shop, apiKey: null },
        update: { apiKey: null },
      });
    }

    return { ok: true, type: "googleApiKey", action: "deleted" };
  }

  if (intent === "saveMaxEdits") {
    const maxEditsStr = formData.get("maxEdits") as string;
    // Store 0 for "unlimited" to avoid MySQL NULL/DEFAULT-3 ambiguity.
    // The helpers already treat null or <= 0 as unlimited.
    const maxEdits =
      !maxEditsStr || maxEditsStr === "0" || maxEditsStr === "unlimited"
        ? 0
        : parseInt(maxEditsStr, 10);

    if (!isMaxEditsAllowedOnPlan(plan.id, maxEdits)) {
      return {
        ok: false,
        type: "maxEdits",
        error:
          "The Free plan is locked to 3 edits per order. Upgrade to Starter to configure limits.",
      };
    }

    console.log(
      `[ActiveServices Action] Saving max edits limit: shop=${shop}, maxEdits=${maxEdits}`,
    );

    const timeLimitRecord = await db.orderEditTimeLimit.upsert({
      where: { shop },
      create: {
        shop,
        maxEdits,
      },
      update: {
        maxEdits,
      },
    });

    return { ok: true, type: "maxEdits", result: timeLimitRecord };
  }

  if (intent === "saveTimeLimit") {
    const timeLimit = (formData.get("timeLimit") as string) || "1h";
    const customValueStr = formData.get("customValue") as string;
    const customUnit = (formData.get("customUnit") as string) || "hours";
    const customValue = customValueStr ? parseInt(customValueStr, 10) : null;

    if (!isTimeLimitAllowedOnPlan(plan.id, timeLimit)) {
      return {
        ok: false,
        type: "timeLimit",
        error:
          "This time window is not permitted on your plan. Free plan is limited to 1 Hour, and custom durations require Pro.",
      };
    }

    console.log(
      `[ActiveServices Action] Saving time limit setting: shop=${shop}, timeLimit=${timeLimit}, customValue=${customValue}, customUnit=${customUnit}`,
    );

    const timeLimitRecord = await db.orderEditTimeLimit.upsert({
      where: { shop },
      create: {
        shop,
        timeLimit,
        customValue,
        customUnit,
      },
      update: {
        timeLimit,
        customValue,
        customUnit,
      },
    });

    return { ok: true, type: "timeLimit", result: timeLimitRecord };
  }

  const serviceId = formData.get("serviceId") as string;
  const enabledStr = formData.get("enabled") as string;
  const enabled = enabledStr === "true";

  if (enabled && !isServiceAllowedOnPlan(plan.id, serviceId)) {
    const requiredPlan = getRequiredPlanForService(serviceId);
    return {
      ok: false,
      error: `"${serviceId}" requires the ${requiredPlan.name} plan ($${requiredPlan.monthlyPrice}/mo). Please upgrade your plan to activate it.`,
    };
  }

  console.log(
    `[ActiveServices Action] Saving service setting: shop=${shop}, serviceId=${serviceId}, enabled=${enabled}`,
  );

  if (!serviceId) {
    return { ok: false, error: "Missing serviceId" };
  }

  // Upsert: create row if first toggle, update if it already exists
  const result = await db.serviceSettings.upsert({
    where: { shop_id: { shop, id: serviceId } },
    create: { id: serviceId, shop, enabled },
    update: { enabled },
  });

  return { ok: true, type: "service", result };
};

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};

// ─── Component ─────────────────────────────────────────────────────────────

export default function ActiveServicesPage(): JSX.Element {
  const {
    shop,
    plan,
    quota,
    services,
    timeLimitSettings,
    hasGoogleApiKey,
    isGooglePlacesAllowed,
    isUpsellAllowed,
    initialProducts,
  } = useLoaderData<typeof loader>();

  return (
    <s-page heading="Active Services">
      {/* ── Active Plan Status Banner ── */}
      <s-section>
        <s-box padding="base" border="base" borderRadius="base" background="subdued">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <div style={{ fontSize: "15px" }}>
                <s-text type="strong">
                  Active Plan:{" "}
                  <span style={{ color: "#008060", textTransform: "capitalize" }}>
                    {plan.name} (${plan.monthlyPrice}/mo)
                  </span>
                </s-text>
              </div>
              <div style={{ marginTop: "3px" }}>
                <s-paragraph color="subdued">
                  {plan.monthlyOrderLimit === null
                    ? `Unlimited monthly edited orders (${quota.usedCount} edits used this month).`
                    : `${quota.usedCount} of ${plan.monthlyOrderLimit} monthly edited orders used this cycle.`}
                  {plan.id === "free" &&
                    " Features beyond the Free plan are locked and require an upgrade to enable."}
                </s-paragraph>
              </div>
            </div>
            <a
              href="/app/pricing"
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                backgroundColor: "#008060",
                color: "#ffffff",
                fontWeight: "600",
                fontSize: "13px",
                textDecoration: "none",
                display: "inline-block",
              }}
            >
              {plan.id === "pro" ? "View Pricing Plans" : "Upgrade Plan"}
            </a>
          </div>
        </s-box>
      </s-section>

      <s-section heading="Order Edit App Capabilities">
        <s-paragraph>
          Manage and monitor all active customer-facing services provided by your
          Order Edit App. Only features included in your active pricing plan can
          be enabled.
        </s-paragraph>
      </s-section>

      {/* ── Product Tags & Upsell Management Section ── */}
      <ProductTagsSection
        initialProducts={initialProducts}
        isAllowed={isUpsellAllowed}
      />

      {/* ── Google Location Autocomplete Key Section ── */}
      <GoogleApiKeySection
        initialHasKey={hasGoogleApiKey}
        isAllowed={isGooglePlacesAllowed}
      />

      {/* ── Max Edits Limit Configuration Box ── */}
      <MaxEditsSection
        initialMaxEdits={timeLimitSettings.maxEdits}
        planId={plan.id}
      />

      {/* ── Time Limit Configuration Box ── */}
      <TimeLimitSection
        initialSettings={timeLimitSettings}
        planId={plan.id}
      />

      <s-section heading="Services Overview">
        <s-stack direction="block" gap="base">
          {services.map((service) => (
            <ServiceRow
              key={service.id}
              id={service.id}
              title={service.title}
              description={service.description}
              category={service.category}
              enabled={service.enabled}
              isAllowed={service.isAllowed}
              requiredPlan={service.requiredPlan}
            />
          ))}
        </s-stack>
      </s-section>
    </s-page>
  );
}

// ─── MaxEditsSection Component ──────────────────────────────────────────────

const MAX_EDITS_PRESETS = [
  { value: "1", label: "1 Edit" },
  { value: "2", label: "2 Edits" },
  { value: "3", label: "3 Edits" },
  { value: "5", label: "5 Edits" },
  { value: "unlimited", label: "Unlimited" },
  { value: "custom", label: "Custom Limit" },
] as const;

interface MaxEditsSectionProps {
  initialMaxEdits: number | null;
  planId: string;
}

const getMaxEditsPreset = (val: number | null | undefined): string => {
  if (val === null || val === undefined || val === 0) {
    return "unlimited";
  }
  const num = Number(val);
  if ([1, 2, 3, 5].includes(num)) {
    return String(num);
  }
  return "custom";
};

function MaxEditsSection({
  initialMaxEdits,
  planId,
}: MaxEditsSectionProps): JSX.Element {
  const isFree = planId === "free";
  const fetcher = useFetcher();
  const initialPreset = isFree ? "3" : getMaxEditsPreset(initialMaxEdits);

  const lastSavedPresetRef = useRef<string | null>(null);

  const [selectedPreset, setSelectedPreset] = useState(initialPreset);
  const [customVal, setCustomVal] = useState(
    typeof initialMaxEdits === "number" && initialMaxEdits > 0
      ? initialMaxEdits
      : 3,
  );
  const [isSaved, setIsSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (isFree) {
      setSelectedPreset("3");
    } else if (lastSavedPresetRef.current === null) {
      setSelectedPreset(getMaxEditsPreset(initialMaxEdits));
      if (typeof initialMaxEdits === "number" && initialMaxEdits > 0) {
        setCustomVal(initialMaxEdits);
      }
    }
  }, [initialMaxEdits, isFree]);

  useEffect(() => {
    if (fetcher.state === "submitting") {
      return;
    }
    if (fetcher.state === "idle" && fetcher.data) {
      if (!fetcher.data.ok && fetcher.data.error) {
        setErrorMessage(fetcher.data.error);
        const timer = setTimeout(() => setErrorMessage(null), 4000);
        return () => clearTimeout(timer);
      }
      if (fetcher.data.ok && fetcher.data.type === "maxEdits") {
        const savedMax = fetcher.data.result?.maxEdits;
        const savedPreset = getMaxEditsPreset(savedMax);
        lastSavedPresetRef.current = savedPreset;
        setSelectedPreset(savedPreset);
        if (typeof savedMax === "number" && savedMax > 0) {
          setCustomVal(savedMax);
        }
        setIsSaved(true);
        if (typeof window !== "undefined" && (window as any).shopify?.toast) {
          (window as any).shopify.toast.show(
            "Maximum order edit limit updated successfully!",
          );
        }
        const timer = setTimeout(() => {
          setIsSaved(false);
          lastSavedPresetRef.current = null;
        }, 4000);
        return () => clearTimeout(timer);
      }
    }
  }, [fetcher.state, fetcher.data]);

  const handleSave = (preset: string, cVal?: number) => {
    if (isFree && preset !== "3") {
      setErrorMessage(
        "The Free plan is locked to 3 edits per order. Upgrade to Starter to configure limits.",
      );
      const timer = setTimeout(() => setErrorMessage(null), 4000);
      return;
    }
    lastSavedPresetRef.current = preset;
    let valToSend = preset;
    if (preset === "custom") {
      valToSend = String(cVal ?? customVal);
    }
    fetcher.submit(
      {
        intent: "saveMaxEdits",
        maxEdits: valToSend,
      },
      { method: "post" },
    );
  };

  return (
    <s-section heading="Maximum Order Edits Allowed">
      <s-box
        padding="large"
        border="base"
        borderRadius="base"
        background="subdued"
      >
        <s-stack direction="block" gap="large">
          <s-stack direction="block" gap="small">
            <s-text type="strong">Maximum Allowed Edits Per Order</s-text>
            <s-paragraph color="subdued">
              Set the maximum number of edit actions a customer can perform on a
              single order (e.g. 3 edits max). Once this edit count is reached,
              order editing will be disabled. PDF Invoice downloads will always
              remain available.
            </s-paragraph>
          </s-stack>

          {isFree && (
            <s-banner tone="info">
              The Free plan includes a fixed <strong>3 Edits Per Order</strong> limit.{" "}
              <a href="/app/pricing" style={{ color: "#008060", fontWeight: "bold" }}>
                Upgrade to Starter ($10/mo)
              </a>{" "}
              to unlock custom or unlimited edits.
            </s-banner>
          )}

          {errorMessage && <s-banner tone="critical">{errorMessage}</s-banner>}

          {/* Presets Grid */}
          <s-stack direction="block" gap="small">
            <s-text type="strong">Limit Options</s-text>
            <s-grid
              gridTemplateColumns="repeat(auto-fit, minmax(130px, 1fr))"
              gap="small"
            >
              {MAX_EDITS_PRESETS.map((preset) => {
                const isActive = selectedPreset === preset.value;
                const isLocked = isFree && preset.value !== "3";
                return (
                  <button
                    key={preset.value}
                    type="button"
                    style={{
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: isActive
                        ? "2px solid #008060"
                        : "1px solid #c9cccf",
                      backgroundColor: isActive
                        ? "#eaf4f0"
                        : isLocked
                        ? "#f4f6f8"
                        : "#ffffff",
                      color: isActive
                        ? "#004c3f"
                        : isLocked
                        ? "#8c9196"
                        : "#202223",
                      fontWeight: isActive ? "600" : "400",
                      cursor: isLocked ? "not-allowed" : "pointer",
                      textAlign: "center",
                      opacity: isLocked ? 0.6 : 1,
                      transition: "all 0.15s ease-in-out",
                    }}
                    onClick={() => {
                      if (isLocked) {
                        setErrorMessage(
                          "The Free plan is locked to 3 edits per order. Upgrade to Starter to configure limits.",
                        );
                        return;
                      }
                      setSelectedPreset(preset.value);
                      if (preset.value !== "custom") {
                        handleSave(preset.value);
                      }
                    }}
                  >
                    {isLocked ? `🔒 ${preset.label}` : preset.label}
                  </button>
                );
              })}
            </s-grid>
          </s-stack>

          {/* Custom Edit Count Input */}
          {selectedPreset === "custom" && (
            <s-box padding="base" border="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-text type="strong">Custom Max Edits Limit</s-text>
                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    alignItems: "flex-end",
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <s-text color="subdued">Number of Edits Allowed</s-text>
                    <input
                      type="number"
                      min="1"
                      value={customVal}
                      onChange={(e) =>
                        setCustomVal(
                          Math.max(1, parseInt(e.target.value, 10) || 1),
                        )
                      }
                      style={{
                        marginTop: "6px",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid #c9cccf",
                        fontSize: "14px",
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSave("custom", customVal)}
                    style={{
                      padding: "9px 18px",
                      borderRadius: "6px",
                      border: "none",
                      backgroundColor: "#008060",
                      color: "#ffffff",
                      fontWeight: "600",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      height: "36px",
                      flexShrink: 0,
                    }}
                  >
                    Save Limit
                  </button>
                </div>
              </s-stack>
            </s-box>
          )}

          {isSaved && (
            <s-banner tone="success">
              Maximum order edit limit saved successfully!
            </s-banner>
          )}
        </s-stack>
      </s-box>
    </s-section>
  );
}

// ─── TimeLimitSection Component ────────────────────────────────────────────

const TIME_LIMIT_PRESETS = [
  { value: "30m", label: "30 Minutes" },
  { value: "1h", label: "1 Hour" },
  { value: "2h", label: "2 Hours" },
  { value: "1d", label: "1 Day" },
  { value: "2d", label: "2 Days" },
  { value: "custom", label: "Custom Time" },
] as const;

interface TimeLimitSectionProps {
  initialSettings: {
    timeLimit: string;
    customValue: number;
    customUnit: string;
  };
  planId: string;
}

function TimeLimitSection({
  initialSettings,
  planId,
}: TimeLimitSectionProps): JSX.Element {
  const isFree = planId === "free";
  const isPro = planId === "pro";
  const fetcher = useFetcher();
  const [selectedPreset, setSelectedPreset] = useEffectState(
    isFree ? "1h" : initialSettings.timeLimit || "1h",
  );
  const [customVal, setCustomVal] = useEffectState(
    initialSettings.customValue || 1,
  );
  const [customUnitVal, setCustomUnitVal] = useEffectState(
    initialSettings.customUnit || "hours",
  );
  const [isSaved, setIsSaved] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Sync state if reloaded
  useEffect(() => {
    setSelectedPreset(isFree ? "1h" : initialSettings.timeLimit || "1h");
    setCustomVal(initialSettings.customValue || 1);
    setCustomUnitVal(initialSettings.customUnit || "hours");
  }, [initialSettings, isFree]);

  useEffect(() => {
    if (fetcher.state === "idle" && fetcher.data) {
      if (!fetcher.data.ok && fetcher.data.error) {
        setErrorMessage(fetcher.data.error);
        const timer = setTimeout(() => setErrorMessage(null), 4000);
        return () => clearTimeout(timer);
      }
      if (fetcher.data.ok && fetcher.data.type === "timeLimit") {
        setIsSaved(true);
        if (typeof window !== "undefined" && (window as any).shopify?.toast) {
          (window as any).shopify.toast.show(
            "Order edit time limit updated successfully!",
          );
        }
        const timer = setTimeout(() => setIsSaved(false), 4000);
        return () => clearTimeout(timer);
      }
    }
  }, [fetcher.state, fetcher.data]);

  const handleSave = (preset: string, cVal?: number, cUnit?: string) => {
    if (isFree && preset !== "1h") {
      setErrorMessage(
        "The Free plan includes a fixed 1-Hour edit window. Upgrade to Starter or Pro to change it.",
      );
      const timer = setTimeout(() => setErrorMessage(null), 4000);
      return;
    }
    if (!isPro && preset === "custom") {
      setErrorMessage("Custom time windows require the Pro plan ($60/mo).");
      const timer = setTimeout(() => setErrorMessage(null), 4000);
      return;
    }
    fetcher.submit(
      {
        intent: "saveTimeLimit",
        timeLimit: preset,
        customValue: String(cVal ?? customVal),
        customUnit: cUnit ?? customUnitVal,
      },
      { method: "post" },
    );
  };

  return (
    <s-section heading="Order Edit Time Limit">
      <s-box
        padding="large"
        border="base"
        borderRadius="base"
        background="subdued"
      >
        <s-stack direction="block" gap="large">
          <s-stack direction="block" gap="small">
            <s-text type="strong">Maximum Allowed Time for Order Edits</s-text>
            <s-paragraph color="subdued">
              Set how long after placing an order a customer is permitted to
              edit their order. Once this time window expires, editing will be
              disabled.
            </s-paragraph>
          </s-stack>

          {isFree && (
            <s-banner tone="info">
              The Free plan includes a fixed <strong>1-Hour edit window</strong>.{" "}
              <a href="/app/pricing" style={{ color: "#008060", fontWeight: "bold" }}>
                Upgrade to Starter ($10/mo)
              </a>{" "}
              for preset windows, or Pro ($60/mo) for custom durations.
            </s-banner>
          )}

          {!isFree && !isPro && (
            <s-paragraph color="subdued">
              Preset time windows unlocked. <em>Custom durations (exact minutes or hours) require the Pro plan ($60/mo).</em>
            </s-paragraph>
          )}

          {errorMessage && <s-banner tone="critical">{errorMessage}</s-banner>}

          {/* Presets Grid */}
          <s-stack direction="block" gap="small">
            <s-text type="strong">Preset Options</s-text>
            <s-grid
              gridTemplateColumns="repeat(auto-fit, minmax(130px, 1fr))"
              gap="small"
            >
              {TIME_LIMIT_PRESETS.map((preset) => {
                const isActive = selectedPreset === preset.value;
                const isLocked = isFree
                  ? preset.value !== "1h"
                  : !isPro && preset.value === "custom";
                return (
                  <button
                    key={preset.value}
                    type="button"
                    style={{
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: isActive
                        ? "2px solid #008060"
                        : "1px solid #c9cccf",
                      backgroundColor: isActive
                        ? "#eaf4f0"
                        : isLocked
                        ? "#f4f6f8"
                        : "#ffffff",
                      color: isActive
                        ? "#004c3f"
                        : isLocked
                        ? "#8c9196"
                        : "#202223",
                      fontWeight: isActive ? "600" : "400",
                      cursor: isLocked ? "not-allowed" : "pointer",
                      textAlign: "center",
                      opacity: isLocked ? 0.6 : 1,
                      transition: "all 0.15s ease-in-out",
                    }}
                    onClick={() => {
                      if (isLocked) {
                        if (isFree) {
                          setErrorMessage(
                            "The Free plan includes a fixed 1-Hour edit window. Upgrade to Starter or Pro to change it.",
                          );
                        } else {
                          setErrorMessage(
                            "Custom time windows require the Pro plan ($60/mo).",
                          );
                        }
                        return;
                      }
                      setSelectedPreset(preset.value);
                      handleSave(preset.value);
                    }}
                  >
                    {isLocked ? `🔒 ${preset.label}` : preset.label}
                  </button>
                );
              })}
            </s-grid>
          </s-stack>

          {/* Custom Time Form */}
          {selectedPreset === "custom" && (
            <s-box padding="base" border="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                <s-text type="strong">Custom Duration</s-text>
                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    alignItems: "flex-end",
                    flexWrap: "wrap",
                  }}
                >
                  <div style={{ flex: 1, minWidth: "140px" }}>
                    <s-text color="subdued">Duration Value</s-text>
                    <input
                      type="number"
                      min="1"
                      value={customVal}
                      onChange={(e) =>
                        setCustomVal(
                          Math.max(1, parseInt(e.target.value, 10) || 1),
                        )
                      }
                      style={{
                        marginTop: "6px",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid #c9cccf",
                        fontSize: "14px",
                        width: "100%",
                        boxSizing: "border-box",
                      }}
                    />
                  </div>

                  <div style={{ flex: 1, minWidth: "140px" }}>
                    <s-text color="subdued">Time Unit</s-text>
                    <select
                      value={customUnitVal}
                      onChange={(e) => setCustomUnitVal(e.target.value)}
                      style={{
                        marginTop: "6px",
                        padding: "8px 12px",
                        borderRadius: "6px",
                        border: "1px solid #c9cccf",
                        fontSize: "14px",
                        width: "100%",
                        boxSizing: "border-box",
                        backgroundColor: "#ffffff",
                      }}
                    >
                      <option value="minutes">Minutes</option>
                      <option value="hours">Hours</option>
                      <option value="days">Days</option>
                    </select>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      handleSave("custom", customVal, customUnitVal)
                    }
                    style={{
                      padding: "9px 18px",
                      borderRadius: "6px",
                      border: "none",
                      backgroundColor: "#008060",
                      color: "#ffffff",
                      fontWeight: "600",
                      cursor: "pointer",
                      whiteSpace: "nowrap",
                      height: "36px",
                      flexShrink: 0,
                    }}
                  >
                    Save Custom Limit
                  </button>
                </div>
              </s-stack>
            </s-box>
          )}

          {isSaved && (
            <s-banner tone="success">
              Time limit settings saved successfully!
            </s-banner>
          )}
        </s-stack>
      </s-box>
    </s-section>
  );
}

// Helper hook for initial state with sync
function useEffectState(initialValue: any) {
  const [val, setVal] = useState(initialValue);
  return [val, setVal];
}

// ─── ServiceRow — individual toggle row ───────────────────────────────────

interface ServiceRowProps {
  id: string;
  title: string;
  description: string;
  category: string;
  enabled: boolean;
  isAllowed: boolean;
  requiredPlan: {
    id: string;
    name: string;
    monthlyPrice: number;
  };
}

function ServiceRow({
  id,
  title,
  description,
  category,
  enabled,
  isAllowed,
  requiredPlan,
}: ServiceRowProps): JSX.Element {
  const fetcher = useFetcher();
  const switchRef = useRef<any>(null);

  // Optimistic state: if a submission is in-flight, show the pending value
  const optimisticEnabled =
    isAllowed &&
    (fetcher.state !== "idle"
      ? fetcher.formData?.get("enabled") === "true"
      : enabled);

  const toggleService = (nextState: boolean): void => {
    if (!isAllowed) return;
    console.log(`[ServiceRow] Toggling service ${id} to ${nextState}`);
    fetcher.submit(
      { serviceId: id, enabled: String(nextState) },
      { method: "post" },
    );
  };

  useEffect(() => {
    const el = switchRef.current;
    if (!el || !isAllowed) return;

    const handleCustomEvent = (e: Event) => {
      e.stopPropagation();
      const target = e.target as HTMLInputElement & { checked?: boolean };
      const newChecked =
        target.checked !== undefined ? target.checked : !optimisticEnabled;
      toggleService(newChecked);
    };

    el.addEventListener("change", handleCustomEvent);
    return () => {
      el.removeEventListener("change", handleCustomEvent);
    };
  }, [id, optimisticEnabled, isAllowed]);

  return (
    <s-box
      padding="base"
      border="base"
      borderRadius="base"
      background="subdued"
    >
      <s-grid gridTemplateColumns="1fr auto" alignItems="center" gap="base">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" alignItems="center" gap="base">
            <s-text type="strong">{title}</s-text>
            <s-badge tone={optimisticEnabled ? "success" : "neutral"}>
              {category}
            </s-badge>
          </s-stack>
          <s-paragraph color="subdued">{description}</s-paragraph>
        </s-stack>

        {!isAllowed ? (
          <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
            <span
              style={{
                fontSize: "12px",
                backgroundColor: "#fff4e5",
                color: "#914400",
                padding: "4px 8px",
                borderRadius: "6px",
                fontWeight: "600",
              }}
            >
              🔒 {requiredPlan.name} (${requiredPlan.monthlyPrice}/mo)
            </span>
            <a
              href="/app/pricing"
              style={{
                padding: "6px 12px",
                borderRadius: "6px",
                backgroundColor: "#008060",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: "600",
                textDecoration: "none",
                whiteSpace: "nowrap",
              }}
            >
              Upgrade
            </a>
          </div>
        ) : (
          <s-badge tone={optimisticEnabled ? "success" : "neutral"}>
            <SSwitch
              tone={optimisticEnabled ? "success" : "neutral"}
              ref={switchRef}
              label={optimisticEnabled ? "Active" : "Inactive"}
              name={id}
              checked={optimisticEnabled}
              onClick={() => {
                if (fetcher.state === "idle") {
                  toggleService(!optimisticEnabled);
                }
              }}
            />
          </s-badge>
        )}
      </s-grid>
    </s-box>
  );
}

// ─── GoogleApiKeySection Component ───────────────────────────────────────────

interface GoogleApiKeySectionProps {
  initialHasKey: boolean;
  isAllowed: boolean;
}

function GoogleApiKeySection({
  initialHasKey,
  isAllowed,
}: GoogleApiKeySectionProps): JSX.Element {
  if (!isAllowed) {
    return (
      <s-section heading="Google Places & Location Suggestions">
        <s-box padding="large" border="base" borderRadius="base" background="subdued">
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <s-text type="strong">Google Places Address Autocomplete</s-text>
              <div style={{ marginTop: "4px" }}>
                <s-paragraph color="subdued">
                  Eliminate address typos and delivery delays with Google Places autocomplete. Available on the <strong>Growth ($29/mo)</strong> and <strong>Pro ($60/mo)</strong> plans.
                </s-paragraph>
              </div>
            </div>
            <a
              href="/app/pricing"
              style={{
                padding: "8px 14px",
                borderRadius: "6px",
                backgroundColor: "#008060",
                color: "#ffffff",
                fontWeight: "600",
                fontSize: "13px",
                textDecoration: "none",
              }}
            >
              Upgrade to Growth
            </a>
          </div>
        </s-box>
      </s-section>
    );
  }

  const fetcher = useFetcher();
  const [hasKey, setHasKey] = useState(initialHasKey);
  const [apiKey, setApiKey] = useEffectState("");
  const [showKey, setShowKey] = useState(false);
  const [isSaved, setIsSaved] = useEffectState(false);
  const [actionMessage, setActionMessage] = useState("");
  const [lastAction, setLastAction] = useState<"saved" | "deleted" | null>(
    null,
  );

  useEffect(() => {
    setHasKey(initialHasKey);
  }, [initialHasKey]);

  useEffect(() => {
    if (
      fetcher.state === "idle" &&
      fetcher.data?.ok &&
      fetcher.data?.type === "googleApiKey"
    ) {
      setIsSaved(true);
      const isDeleted = fetcher.data?.action === "deleted";
      setLastAction(isDeleted ? "deleted" : "saved");
      setHasKey(!isDeleted);
      // Clear input after save/delete so stored secrets remain write-only in the browser.
      setApiKey("");

      const msg = isDeleted
        ? "Google Places API key deleted successfully!"
        : "Google Places API key saved successfully!";
      setActionMessage(msg);

      if (typeof window !== "undefined" && (window as any).shopify?.toast) {
        (window as any).shopify.toast.show(msg);
      }
      const timer = setTimeout(() => {
        setIsSaved(false);
        setLastAction(null);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [fetcher.state, fetcher.data]);

  const handleSave = () => {
    if (!apiKey.trim()) return;
    fetcher.submit(
      {
        intent: "saveGoogleApiKey",
        googleApiKey: apiKey,
      },
      { method: "post" },
    );
  };

  const handleDelete = () => {
    fetcher.submit(
      {
        intent: "deleteGoogleApiKey",
      },
      { method: "post" },
    );
  };

  const isDeleting =
    fetcher.state !== "idle" &&
    fetcher.formData?.get("intent") === "deleteGoogleApiKey";
  const isConfigured = hasKey || isDeleting;
  const showDeleteButton =
    isConfigured || isDeleting || (isSaved && lastAction === "deleted");

  return (
    <s-section heading="Google Places & Location Suggestions">
      <s-box
        padding="large"
        border="base"
        borderRadius="base"
        background="subdued"
      >
        <s-stack direction="block" gap="large">
          <s-stack direction="block" gap="small">
            <s-stack
              direction="inline"
              justifyContent="space-between"
              alignItems="center"
            >
              <s-text type="strong">🔑 Google Places API Key</s-text>
              <s-badge
                tone={
                  isConfigured && !isDeleting && lastAction !== "deleted"
                    ? "success"
                    : "neutral"
                }
              >
                {isConfigured && !isDeleting && lastAction !== "deleted"
                  ? "Active (Autocomplete Enabled)"
                  : "Disabled (No Key)"}
              </s-badge>
            </s-stack>
            <s-paragraph color="subdued">
              Enter your Google Places & Geocoding API Key to enable instant
              location autocomplete and auto-filling address suggestions for
              your store customers. If left blank, the location suggestions
              section will be hidden on storefront address forms.
            </s-paragraph>
          </s-stack>

          <s-box
            padding="base"
            border="base"
            borderRadius="base"
            background="base"
          >
            <s-stack direction="block" gap="base">
              <s-text type="strong">Merchant API Key</s-text>
              <div
                style={{ display: "flex", gap: "12px", alignItems: "flex-end" }}
              >
                <div style={{ flex: 1 }}>
                  <s-text color="subdued">
                    API Key (Places API & Geocoding API enabled)
                  </s-text>
                  <div style={{ position: "relative", marginTop: "6px" }}>
                    <input
                      type={showKey ? "text" : "password"}
                      value={apiKey}
                      onChange={(e) => setApiKey(e.target.value)}
                      placeholder={
                        hasKey
                          ? "API key saved — enter a new key to replace"
                          : "e.g. AIzaSyD..."
                      }
                      style={{
                        padding: "8px 50px 8px 12px",
                        borderRadius: "6px",
                        border: "1px solid #c9cccf",
                        fontSize: "14px",
                        width: "100%",
                        height: "36px",
                        boxSizing: "border-box",
                        fontFamily: "monospace",
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowKey(!showKey)}
                      style={{
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
                        lineHeight: 1,
                      }}
                    >
                      {showKey ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!apiKey.trim()}
                  style={{
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
                    flexShrink: 0,
                  }}
                >
                  {fetcher.state !== "idle" &&
                  fetcher.formData?.get("intent") === "saveGoogleApiKey"
                    ? "Saving..."
                    : "Save Key"}
                </button>

                {showDeleteButton && (
                  <button
                    type="button"
                    onClick={handleDelete}
                    disabled={isDeleting}
                    style={{
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
                      opacity: isDeleting ? 0.7 : 1,
                    }}
                  >
                    {isDeleting ? "Deleting..." : "Delete Key"}
                  </button>
                )}
              </div>
            </s-stack>
          </s-box>

          {isSaved && (
            <s-banner tone={lastAction === "deleted" ? "critical" : "success"}>
              {actionMessage}
            </s-banner>
          )}
        </s-stack>
      </s-box>
    </s-section>
  );
}

// ─── ProductTagsSection Component ───────────────────────────────────────────

interface ProductItem {
  id: string;
  title: string;
  handle: string;
  tags: string[];
  imageUrl: string;
}

interface ProductTagsSectionProps {
  initialProducts: ProductItem[];
  isAllowed: boolean;
}

function ProductTagsSection({
  initialProducts,
  isAllowed,
}: ProductTagsSectionProps): JSX.Element {
  if (!isAllowed) {
    return (
      <s-section heading="Product Tags & Upsell Management">
        <s-box
          padding="large"
          border="base"
          borderRadius="base"
          background="subdued"
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: "12px",
            }}
          >
            <div>
              <s-text type="strong">Product Upsell & Recommendations</s-text>
              <div style={{ marginTop: "4px" }}>
                <s-paragraph color="subdued">
                  Offer smart product recommendations and add-ons directly on
                  customer order edit pages to increase revenue. Available on the{" "}
                  <strong>Growth ($29/mo)</strong> and{" "}
                  <strong>Pro ($60/mo)</strong> plans.
                </s-paragraph>
              </div>
            </div>
            <a
              href="/app/pricing"
              style={{
                padding: "8px 14px",
                borderRadius: "6px",
                backgroundColor: "#008060",
                color: "#ffffff",
                fontWeight: "600",
                fontSize: "13px",
                textDecoration: "none",
              }}
            >
              Upgrade to Growth
            </a>
          </div>
        </s-box>
      </s-section>
    );
  }

  const [products, setProducts] = useState<ProductItem[]>(
    initialProducts || [],
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [hasSearched, setHasSearched] = useState(false);
  const [newTagsMap, setNewTagsMap] = useState<Record<string, string>>({});
  const [bannerInfo, setBannerInfo] = useState<{
    msg: string;
    tone: "success" | "critical";
  } | null>(null);
  const searchFetcher = useFetcher<any>();
  const tagFetcher = useFetcher<any>();

  useEffect(() => {
    if (
      searchFetcher.state === "idle" &&
      searchFetcher.data?.ok &&
      searchFetcher.data?.type === "searchProducts"
    ) {
      setProducts(searchFetcher.data.products || []);
      setHasSearched(true);
    }
  }, [searchFetcher.state, searchFetcher.data]);

  useEffect(() => {
    if (
      tagFetcher.state === "idle" &&
      tagFetcher.data?.ok &&
      tagFetcher.data?.type === "productTag"
    ) {
      const { action, productId, tag } = tagFetcher.data;
      setProducts((prev) =>
        prev.map((p) => {
          if (p.id !== productId) return p;
          let updatedTags = [...p.tags];
          if (action === "added" && !updatedTags.includes(tag)) {
            updatedTags.push(tag);
          } else if (action === "removed") {
            updatedTags = updatedTags.filter((t) => t !== tag);
          }
          return { ...p, tags: updatedTags };
        }),
      );
      setBannerInfo({
        msg:
          action === "added"
            ? `Added tag "${tag}" successfully!`
            : `Removed tag "${tag}" successfully!`,
        tone: action === "added" ? "success" : "critical",
      });
      const timer = setTimeout(() => setBannerInfo(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [tagFetcher.state, tagFetcher.data]);

  const handleSearch = (e: any) => {
    e.preventDefault();
    setHasSearched(true);
    searchFetcher.submit(
      { intent: "searchProducts", query: searchQuery },
      { method: "post" },
    );
  };

  const handleAddTag = (productId: string, tagToAdd: string) => {
    if (!tagToAdd || !tagToAdd.trim()) return;
    const cleanTag = tagToAdd.trim();
    tagFetcher.submit(
      { intent: "addProductTag", productId, tag: cleanTag },
      { method: "post" },
    );
    setNewTagsMap((prev) => ({ ...prev, [productId]: "" }));
  };

  const handleRemoveTag = (productId: string, tagToRemove: string) => {
    tagFetcher.submit(
      { intent: "removeProductTag", productId, tag: tagToRemove },
      { method: "post" },
    );
  };

  return (
    <s-section heading="Product Tags & Upsell Management">
      <s-box
        padding="large"
        border="base"
        borderRadius="base"
        background="subdued"
      >
        <s-stack direction="block" gap="large">
          <s-stack direction="block" gap="small">
            <s-text type="strong">
              🏷️ Configure Product Tags for Upsell Recommendations
            </s-text>
            <s-paragraph color="subdued">
              Organize your product catalog by managing product tags. The
              OrderEase Upsell feature automatically pairs items in a customer's
              order tagged with [tag] with recommendation products tagged with
              [tag]-upshell.
            </s-paragraph>
          </s-stack>

          {bannerInfo ? (
            <s-banner tone={bannerInfo.tone}>{bannerInfo.msg}</s-banner>
          ) : null}

          <form
            onSubmit={handleSearch}
            style={{ display: "flex", gap: "10px" }}
          >
            <input
              type="text"
              placeholder="Search products by title or tag..."
              value={searchQuery}
              onChange={(e: any) => setSearchQuery(e.target.value)}
              style={{
                flex: 1,
                padding: "8px 12px",
                borderRadius: "6px",
                border: "1px solid #c9cccf",
                fontSize: "14px",
              }}
            />
            <button
              type="submit"
              style={{
                padding: "8px 16px",
                borderRadius: "6px",
                border: "none",
                backgroundColor: "#008060",
                color: "#ffffff",
                fontWeight: "600",
                cursor: "pointer",
              }}
            >
              {searchFetcher.state !== "idle"
                ? "Searching..."
                : "Search Products"}
            </button>
          </form>

          <s-stack direction="block" gap="base">
            {searchFetcher.state !== "idle" ? (
              <s-box padding="base" border="base" borderRadius="base">
                <s-paragraph color="subdued">
                  ⏳ Searching products...
                </s-paragraph>
              </s-box>
            ) : !hasSearched ? (
              <s-box padding="base" border="base" borderRadius="base">
                <s-paragraph color="subdued">
                  🔍 Search for a product by title or tag above to view and
                  manage its tags.
                </s-paragraph>
              </s-box>
            ) : products.length === 0 ? (
              <s-box padding="base" border="base" borderRadius="base">
                <s-paragraph color="subdued">
                  No products found. Try adjusting your search query.
                </s-paragraph>
              </s-box>
            ) : (
              products.map((prod) => {
                const currentNewTag = newTagsMap[prod.id] || "";
                return (
                  <s-box
                    key={prod.id}
                    padding="base"
                    border="base"
                    borderRadius="base"
                  >
                    <s-grid
                      gridTemplateColumns="auto 1fr"
                      gap="base"
                      alignItems="start"
                    >
                      <div
                        style={{
                          width: "56px",
                          height: "56px",
                          borderRadius: "8px",
                          overflow: "hidden",
                          backgroundColor: "#f1f2f3",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "1px solid #e1e3e5",
                        }}
                      >
                        {prod.imageUrl ? (
                          <img
                            src={prod.imageUrl}
                            alt={prod.title}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "cover",
                            }}
                          />
                        ) : (
                          <span style={{ fontSize: "20px" }}>📦</span>
                        )}
                      </div>

                      <s-stack direction="block" gap="small">
                        <s-text type="strong">{prod.title}</s-text>

                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: "6px",
                            alignItems: "center",
                          }}
                        >
                          {prod.tags && prod.tags.length > 0 ? (
                            prod.tags.map((tag) => {
                              const isUpsellTag = tag.endsWith("-upshell");
                              return (
                                <span
                                  key={tag}
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px",
                                    padding: "3px 8px",
                                    borderRadius: "12px",
                                    backgroundColor: isUpsellTag
                                      ? "#eaf4f0"
                                      : "#f1f2f3",
                                    color: isUpsellTag ? "#004c3f" : "#202223",
                                    border: isUpsellTag
                                      ? "1px solid #95c9b4"
                                      : "1px solid #c9cccf",
                                    fontSize: "12px",
                                    fontWeight: isUpsellTag ? "600" : "500",
                                  }}
                                >
                                  {isUpsellTag ? `⚡ ${tag}` : tag}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleRemoveTag(prod.id, tag)
                                    }
                                    style={{
                                      background: "none",
                                      border: "none",
                                      color: "#5c5f62",
                                      cursor: "pointer",
                                      fontSize: "13px",
                                      padding: "0 2px",
                                      lineHeight: 1,
                                    }}
                                    title={`Remove tag ${tag}`}
                                  >
                                    ×
                                  </button>
                                </span>
                              );
                            })
                          ) : (
                            <s-text color="subdued">No tags assigned</s-text>
                          )}
                        </div>

                        <div
                          style={{
                            display: "flex",
                            gap: "8px",
                            marginTop: "4px",
                            flexWrap: "wrap",
                          }}
                        >
                          <input
                            type="text"
                            placeholder="Add tag (e.g. Summer or Summer-upshell)..."
                            value={currentNewTag}
                            onChange={(e: any) =>
                              setNewTagsMap((prev) => ({
                                ...prev,
                                [prod.id]: e.target.value,
                              }))
                            }
                            onKeyDown={(e: any) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleAddTag(prod.id, currentNewTag);
                              }
                            }}
                            style={{
                              flex: 1,
                              minWidth: "180px",
                              padding: "6px 10px",
                              borderRadius: "6px",
                              border: "1px solid #c9cccf",
                              fontSize: "13px",
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => handleAddTag(prod.id, currentNewTag)}
                            disabled={!currentNewTag.trim()}
                            style={{
                              padding: "6px 12px",
                              borderRadius: "6px",
                              border: "none",
                              backgroundColor: "#008060",
                              color: "#ffffff",
                              fontSize: "13px",
                              fontWeight: "600",
                              cursor: currentNewTag.trim()
                                ? "pointer"
                                : "not-allowed",
                              opacity: currentNewTag.trim() ? 1 : 0.6,
                            }}
                          >
                            + Tag
                          </button>
                          {currentNewTag.trim() &&
                          !currentNewTag.trim().endsWith("-upshell") ? (
                            <button
                              type="button"
                              onClick={() =>
                                handleAddTag(
                                  prod.id,
                                  `${currentNewTag.trim()}-upshell`,
                                )
                              }
                              style={{
                                padding: "6px 12px",
                                borderRadius: "6px",
                                border: "1px solid #008060",
                                backgroundColor: "#eaf4f0",
                                color: "#004c3f",
                                fontSize: "13px",
                                fontWeight: "600",
                                cursor: "pointer",
                              }}
                            >
                              + Quick Add {currentNewTag.trim()}-upshell
                            </button>
                          ) : null}
                        </div>
                      </s-stack>
                    </s-grid>
                  </s-box>
                );
              })
            )}
          </s-stack>
        </s-stack>
      </s-box>
    </s-section>
  );
}
