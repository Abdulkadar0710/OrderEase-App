import type { LoaderFunctionArgs, ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import db from "../db.server";
import { isServiceEnabled } from "../utils/orderGuard.server";
import { getMerchantPlan } from "../utils/planHelper.server";
import { isGooglePlacesAllowedOnPlan } from "../config/plans";

interface SuggestionItem {
  id: string;
  description: string;
  mainText: string;
  secondaryText: string;
  address1: string;
  city: string;
  province: string;
  zip: string;
  countryCode: string;
  country: string;
}

interface RateLimitRecord {
  count: number;
  resetAt: number;
}

const rateLimitMap = new Map<string, RateLimitRecord>();

function checkRateLimit(key: string, limit = 40, windowMs = 60 * 1000): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(key);
  if (!record || now > record.resetAt) {
    rateLimitMap.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (record.count >= limit) {
    return false;
  }
  record.count += 1;
  return true;
}

// Clean up expired rate limit entries every 2 minutes
setInterval(() => {
  const now = Date.now();
  for (const [k, v] of rateLimitMap.entries()) {
    if (now > v.resetAt) {
      rateLimitMap.delete(k);
    }
  }
}, 2 * 60 * 1000).unref();

function normalizeShopDomain(dest?: string | null): string {
  return (dest ?? "")
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "")
    .toLowerCase()
    .trim();
}

async function handleLocationSuggestions(
  storeDomain: string,
  customerAccountId: string,
  cors: (response: Response) => Response,
  q: string,
  countryCode: string,
): Promise<Response> {
  if (!storeDomain) {
    return cors(Response.json({ error: "Unauthorized" }, { status: 401 }));
  }

  // 1. Sliding window rate limiting (40 requests per minute per user/shop)
  const rateLimitKey = `${storeDomain}:${customerAccountId || "anon"}`;
  if (!checkRateLimit(rateLimitKey, 40, 60 * 1000)) {
    return cors(
      Response.json(
        { error: "Too many requests. Please slow down." },
        { status: 429, headers: { "Retry-After": "15" } },
      ),
    );
  }

  // 2. Query bounds and sanitization
  const sanitizedQ = (q || "").replace(/[\x00-\x1F\x7F]/g, "").trim();
  if (sanitizedQ.length < 2) {
    return cors(Response.json({ suggestions: [] }));
  }
  if (sanitizedQ.length > 100) {
    return cors(
      Response.json({ error: "Query exceeds maximum length of 100 characters." }, { status: 400 }),
    );
  }

  // 3. Strict 2-letter ISO country code validation
  const validCountryCode = countryCode && /^[A-Za-z]{2}$/.test(countryCode.trim())
    ? countryCode.trim().toUpperCase()
    : "";

  const plan = await getMerchantPlan(storeDomain);
  if (!isGooglePlacesAllowedOnPlan(plan.id)) {
    return cors(Response.json({ suggestions: [] }));
  }
  if (!(await isServiceEnabled(storeDomain, "change-address"))) {
    return cors(Response.json({ error: "This feature is not enabled by the merchant." }, { status: 403 }));
  }

  const suggestions = await fetchLocationSuggestions(sanitizedQ, storeDomain, validCountryCode);
  return cors(Response.json({ suggestions }));
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { sessionToken, cors } = await authenticate.public.customerAccount(request);
  const storeDomain = normalizeShopDomain(sessionToken.dest);
  const customerAccountId = sessionToken.sub;
  const url = new URL(request.url);
  const q = url.searchParams.get("q") || "";
  const countryCode = url.searchParams.get("countryCode") || "";

  return handleLocationSuggestions(storeDomain, customerAccountId, cors, q, countryCode);
}

export async function action({ request }: ActionFunctionArgs) {
  const { sessionToken, cors } = await authenticate.public.customerAccount(request);
  const storeDomain = normalizeShopDomain(sessionToken.dest);
  const customerAccountId = sessionToken.sub;

  try {
    const body = await request.json().catch(() => ({}));
    const q = body.q || "";
    const countryCode = body.countryCode || "";

    return handleLocationSuggestions(storeDomain, customerAccountId, cors, q, countryCode);
  } catch (err) {
    return cors(Response.json({ suggestions: [] }));
  }
}

async function fetchLocationSuggestions(query: string, storeDomain?: string, countryCode?: string): Promise<SuggestionItem[]> {
  let googleApiKey = "";
  const cleanDomain = storeDomain ? storeDomain.replace(/^https?:\/\//, "").replace(/\/.*$/, "").toLowerCase().trim() : "";

  // 1. Load merchant's Google API key strictly for this specific shop from DB
  if (cleanDomain) {
    try {
      const googleConfig = await db.googlePlacesConfig.findUnique({
        where: { shop: cleanDomain },
      });
      if (googleConfig?.apiKey && googleConfig.apiKey.trim().length > 0) {
        googleApiKey = googleConfig.apiKey.trim();
      }
    } catch (e) {
      console.warn("[api.location-suggestions] DB lookup error for shop:", cleanDomain, e);
    }
  }

  if (!googleApiKey) {
    return [];
  }

  // ── Strategy A: Google Places API (New) ───────────────────────────────────
  try {
    const newPlacesUrl = "https://places.googleapis.com/v1/places:autocomplete";
    const newPlacesBody: Record<string, unknown> = { input: query };
    if (countryCode) {
      newPlacesBody.includedRegionCodes = [countryCode.toLowerCase()];
    }
    const resNew = await fetch(newPlacesUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": googleApiKey,
      },
      body: JSON.stringify(newPlacesBody),
    });

    if (resNew.ok) {
      const dataNew = await resNew.json();
      if (Array.isArray(dataNew.suggestions) && dataNew.suggestions.length > 0) {
        const items: SuggestionItem[] = [];

        for (const s of dataNew.suggestions.slice(0, 5)) {
          const pred = s.placePrediction;
          if (!pred) continue;

          const rawPlaceId = pred.placeId || (pred.place ? pred.place.replace(/^places\//, "") : "");
          const mainText = pred.structuredFormat?.mainText?.text || query;
          const secondaryText = pred.structuredFormat?.secondaryText?.text || "";
          const description = pred.text?.text || `${mainText}, ${secondaryText}`;

          let address1 = mainText;
          let city = mainText;
          let province = "";
          let zip = "";
          let countryCode = "";
          let country = "";

          // Optionally fetch detail from Places (New)
          if (rawPlaceId) {
            try {
              const detailRes = await fetch(`https://places.googleapis.com/v1/places/${rawPlaceId}`, {
                headers: {
                  "X-Goog-Api-Key": googleApiKey,
                  "X-Goog-FieldMask": "addressComponents,formattedAddress",
                },
              });

              if (detailRes.ok) {
                const detailData = await detailRes.json();
                const comps = detailData.addressComponents || [];
                let streetNum = "";
                let route = "";
                let neighborhood = "";

                for (const c of comps) {
                  const types = c.types || [];
                  if (types.includes("street_number")) streetNum = c.longText || c.shortText;
                  if (types.includes("route")) route = c.longText || c.shortText;
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
                    countryCode = (c.shortText || "").toUpperCase();
                  }
                }

                if (!city) city = neighborhood || mainText;
                address1 = [streetNum, route].filter(Boolean).join(" ") || neighborhood || mainText;
              }
            } catch (e) {
              // fallback to structured text
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
            countryCode,
            country,
          });
        }

        if (items.length > 0) {
          return items;
        }
      }
    }
  } catch (e) {
    // try strategy B
  }

  // ── Strategy B: Google Places API (Legacy) ────────────────────────────────
  try {
    let gUrl = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(query)}&types=geocode&key=${googleApiKey}`;
    if (countryCode) {
      gUrl += `&components=country:${encodeURIComponent(countryCode.toLowerCase())}`;
    }
    const res = await fetch(gUrl);
    const data = await res.json();

    if (data.status === "OK" && Array.isArray(data.predictions) && data.predictions.length > 0) {
      const googleItems: SuggestionItem[] = [];

      for (const pred of data.predictions.slice(0, 5)) {
        const detailUrl = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${pred.place_id}&fields=address_components,formatted_address&key=${googleApiKey}`;
        const detailRes = await fetch(detailUrl);
        const detailData = await detailRes.json();

        if (detailData.status === "OK" && detailData.result) {
          const comps = detailData.result.address_components || [];
          let streetNum = "";
          let route = "";
          let neighborhood = "";
          let city = "";
          let province = "";
          let zip = "";
          let countryCode = "";
          let country = "";

          for (const c of comps) {
            const types = c.types || [];
            if (types.includes("street_number")) streetNum = c.long_name;
            if (types.includes("route")) route = c.long_name;
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
              countryCode = (c.short_name || "").toUpperCase();
            }
          }

          if (!city) {
            city = neighborhood || (pred.structured_formatting?.main_text || "").replace(/\d+/g, "").trim();
          }

          const address1 =
            [streetNum, route].filter(Boolean).join(" ") ||
            neighborhood ||
            pred.structured_formatting?.main_text ||
            "";

          googleItems.push({
            id: pred.place_id,
            description: detailData.result.formatted_address || pred.description,
            mainText: pred.structured_formatting?.main_text || query,
            secondaryText: pred.structured_formatting?.secondary_text || "",
            address1,
            city,
            province,
            zip,
            countryCode,
            country,
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

  /*
  // ── OpenStreetMap Nominatim Fallback (Disabled) ─────────────────────────
  */

  return [];
}
