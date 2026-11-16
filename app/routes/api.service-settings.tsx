import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { checkOrderEditLimit } from "../utils/editLimitHelper.server";
import { getMerchantPlan, getMonthlyQuotaStatus, normalizeShop } from "../utils/planHelper.server";
import { isGooglePlacesAllowedOnPlan } from "../config/plans";

/**
 * GET /api/service-settings
 *
 * Called by Customer Account UI and Checkout UI extensions to discover:
 * 1. Which features are enabled AND allowed by the merchant's plan tier
 * 2. Time limit window (enforcing 1h fixed on Free)
 * 3. Max edits limit (enforcing 3 edits on Free)
 * 4. Google Places API availability (enforcing Growth/Pro only)
 * 5. Monthly quota status
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const { sessionToken, cors } = await authenticate.public.customerAccount(request);

  const storeDomain = normalizeShop(sessionToken.dest ?? "");

  if (!storeDomain) {
    return cors(Response.json({ error: "Unauthorized" }, { status: 401 }));
  }

  const url = new URL(request.url);
  const orderId = url.searchParams.get("orderId");

  // 1. Fetch merchant's active plan and monthly quota status
  const plan = await getMerchantPlan(storeDomain);
  const quota = await getMonthlyQuotaStatus(storeDomain);

  // 2. Fetch service settings rows for this shop
  const rows = await db.serviceSettings.findMany({
    where: { shop: storeDomain },
    select: { id: true, enabled: true },
  });

  // 3. Fetch order edit time limit setting for this shop
  const timeLimitRecord = await db.orderEditTimeLimit.findUnique({
    where: { shop: storeDomain },
  });

  // 4. Fetch Google Places API Key configuration for this specific shop
  const googleConfig = await db.googlePlacesConfig.findUnique({
    where: { shop: storeDomain },
  });

  // Google Places is strictly gated to Growth and Pro plans
  const hasGooglePlacesKey = Boolean(
    isGooglePlacesAllowedOnPlan(plan.id) &&
      googleConfig?.apiKey &&
      googleConfig.apiKey.trim().length > 0,
  );

  // 5. Check order edit limit and quota
  let fallbackMaxEdits: number | null = timeLimitRecord?.maxEdits ?? 3;
  if (plan.id === "free") {
    fallbackMaxEdits = 3;
  } else if (plan.id === "pro") {
    if (
      timeLimitRecord &&
      typeof timeLimitRecord.maxEdits === "number" &&
      timeLimitRecord.maxEdits > 0 &&
      timeLimitRecord.maxEdits !== 3
    ) {
      fallbackMaxEdits = timeLimitRecord.maxEdits;
    } else {
      fallbackMaxEdits = null; // Unlimited on Pro
    }
  } else if (fallbackMaxEdits !== null && fallbackMaxEdits <= 0) {
    fallbackMaxEdits = null;
  }

  const editLimitInfo = orderId
    ? await checkOrderEditLimit({ shop: storeDomain, orderId })
    : {
        isLimitReached: quota.isExceeded,
        currentEditCount: 0,
        maxEdits: fallbackMaxEdits,
        quotaExceeded: quota.isExceeded,
      };

  // 6. Build gated settings map:
  // Must be enabled by merchant AND permitted under the merchant's active pricing plan
  const settings: Record<string, boolean> = {};
  for (const row of rows) {
    const isAllowedByPlan = plan.allowedServices.includes(row.id);
    // If shop's monthly quota is exceeded, shut down all editing features
    settings[row.id] = !quota.isExceeded && row.enabled && isAllowedByPlan;
  }

  // 7. Enforce Time Limit rules based on plan
  let effectiveTimeLimit = { preset: "1h", customValue: 1, customUnit: "hours" };
  if (plan.id === "free") {
    // Free plan is strictly locked to 1 Hour
    effectiveTimeLimit = { preset: "1h", customValue: 1, customUnit: "hours" };
  } else if (plan.id === "starter" || plan.id === "growth") {
    // Starter & Growth: presets only (30m, 1h, 2h, 1d, 2d). Fall back to 1h if invalid custom.
    const preset = timeLimitRecord?.timeLimit || "1h";
    effectiveTimeLimit = {
      preset: preset === "custom" ? "1h" : preset,
      customValue: 1,
      customUnit: "hours",
    };
  } else if (plan.id === "pro") {
    // Pro: presets or custom
    effectiveTimeLimit = {
      preset: timeLimitRecord?.timeLimit || "1h",
      customValue: timeLimitRecord?.customValue ?? 1,
      customUnit: timeLimitRecord?.customUnit ?? "hours",
    };
  }

  return cors(
    Response.json(
      {
        plan: {
          id: plan.id,
          name: plan.name,
        },
        quota: {
          used: quota.usedCount,
          limit: quota.limit,
          isExceeded: quota.isExceeded,
        },
        settings,
        hasGooglePlacesKey,
        timeLimit: effectiveTimeLimit,
        editLimit: {
          maxEdits: plan.id === "free" ? 3 : editLimitInfo.maxEdits,
          currentEditCount: editLimitInfo.currentEditCount,
          isLimitReached: editLimitInfo.isLimitReached,
          quotaExceeded: editLimitInfo.quotaExceeded ?? quota.isExceeded,
        },
      },
      {
        headers: {
          "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
          Pragma: "no-cache",
          Expires: "0",
        },
      },
    ),
  );
}

export async function action({ request }: ActionFunctionArgs) {
  const { cors } = await authenticate.public.customerAccount(request);
  return cors(Response.json({ error: "Method not allowed" }, { status: 405 }));
}
