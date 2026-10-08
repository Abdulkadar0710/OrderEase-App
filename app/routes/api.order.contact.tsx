import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { addOrderTags } from "../utils/orderTagsHelper.server";
import { trackOrderEdit } from "../utils/analyticsHelper.server";
import { checkOrderEditLimit } from "../utils/editLimitHelper.server";

// Proper email validation with strict TLD, domain label, and RFC 5322 compliance
function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;

  // Must not contain whitespace
  if (/\s/.test(trimmed)) return false;

  // Exactly one @ symbol
  const parts = trimmed.split("@");
  if (parts.length !== 2) return false;

  const [localPart, domainPart] = parts;
  if (!localPart || !domainPart) return false;
  if (localPart.length > 64) return false;

  // Local part cannot start or end with a dot, or have consecutive dots
  if (localPart.startsWith(".") || localPart.endsWith(".") || localPart.includes("..")) {
    return false;
  }

  // Local part valid characters (RFC 5322 unquoted)
  const localRegex = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
  if (!localRegex.test(localPart)) {
    return false;
  }

  // Domain cannot start or end with a dot or hyphen, or have consecutive dots
  if (domainPart.startsWith(".") || domainPart.endsWith(".") || domainPart.includes("..")) {
    return false;
  }

  const domainLabels = domainPart.split(".");
  // Domain must contain at least a domain name and a TLD (e.g. example.com)
  if (domainLabels.length < 2) {
    return false;
  }

  // Top-Level Domain (TLD) must be alphabetic only and between 2 and 63 characters long
  const tld = domainLabels[domainLabels.length - 1];
  if (!/^[a-zA-Z]{2,63}$/.test(tld)) {
    return false;
  }

  // Each subdomain/domain label must be 1 to 63 alphanumeric chars (hyphens allowed in middle)
  for (let i = 0; i < domainLabels.length - 1; i++) {
    const label = domainLabels[i];
    if (!label || label.length > 63) return false;
    if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label)) {
      return false;
    }
  }

  return true;
}

// Phone validation — ITU-T E.164 standard (7–15 digits)
function isValidPhone(phone: string): boolean {
  if (!phone || typeof phone !== "string") return false;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length < 7 || digits.length > 15) {
    return false;
  }
  return /^\+?[\d\s\-()]+$/.test(trimmed);
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { cors } = await authenticate.public.customerAccount(request);
  return cors(
    new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  );
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
  const { orderId, email, phone } = body;

  if (!orderId) {
    return cors(Response.json({ userErrors: [{ message: "Missing orderId." }] }, { status: 400 }));
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

  const emailStr = typeof email === "string" ? email.trim() : "";
  const phoneStr = typeof phone === "string" ? phone.trim() : "";

  if (!emailStr && !phoneStr) {
    return cors(Response.json({ userErrors: [{ message: "Provide at least one field to update (email or phone)." }] }, { status: 400 }));
  }

  if (emailStr && !isValidEmail(emailStr)) {
    return cors(
      Response.json(
        {
          userErrors: [
            {
              field: ["email"],
              message: "Please enter a valid email address format (e.g., name@example.com).",
            },
          ],
        },
        { status: 422 },
      ),
    );
  }

  if (phoneStr && !isValidPhone(phoneStr)) {
    return cors(
      Response.json(
        {
          userErrors: [
            {
              field: ["phone"],
              message: "Please enter a valid telephone number format (7–15 digits).",
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
    query getOrderOwner($id: ID!) {
      order(id: $id) {
        id
        customer { id }
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

  // ── Build input — only include fields the customer actually changed ─────────
  const numericOrderId = orderId.match(/\d+$/)?.[0];
  if (!numericOrderId) {
    return cors(Response.json({ userErrors: [{ message: "Invalid orderId format." }] }, { status: 400 }));
  }

  const input: Record<string, unknown> = { id: orderId };
  if (emailStr) input.email = emailStr;
  if (phoneStr) input.phone = phoneStr;

  try {
    const updateRes = await admin.graphql(
      `#graphql
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
      }`,
      { variables: { input } },
    );

    const updateJson = await updateRes.json();
    const errors = updateJson.data?.orderUpdate?.userErrors ?? [];

    if (errors.length) {
      return cors(Response.json({ userErrors: errors }, { status: 422 }));
    }

    // Tag the order as updated (contact changes don't produce refunds).
    await addOrderTags(admin, orderId);

    // Track order edit and feature usage
    const { source } = body || {};
    await trackOrderEdit({
      shop: storeDomain,
      orderId,
      featureId: "contact-info",
      source,
    });

    return cors(Response.json({ order: updateJson.data.orderUpdate.order, userErrors: [] }));
  } catch (err: unknown) {
    console.error("[order-contact] Unexpected error:", err);
    return cors(
      Response.json(
        { userErrors: [{ message: err instanceof Error ? err.message : "Internal error" }] },
        { status: 500 },
      ),
    );
  }
}

