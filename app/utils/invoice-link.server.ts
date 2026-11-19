import crypto from "node:crypto";

const LINK_TTL_MS = 15 * 60 * 1000; // 15 minutes

interface SignedInvoicePayload {
  shop: string;
  orderId: string;
  customerAccountId: string;
  exp: number;
}

function getSecret(): string {
  return process.env.SHOPIFY_API_SECRET || "orderease-secure-invoice-secret";
}

export function createSignedInvoiceToken(params: {
  shop: string;
  orderId: string;
  customerAccountId: string;
}): string {
  const payload: SignedInvoicePayload = {
    shop: params.shop,
    orderId: params.orderId,
    customerAccountId: params.customerAccountId,
    exp: Date.now() + LINK_TTL_MS,
  };

  const payloadBase64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = crypto
    .createHmac("sha256", getSecret())
    .update(payloadBase64)
    .digest("base64url");

  return `${payloadBase64}.${signature}`;
}

export function verifySignedInvoiceToken(token: string): {
  shop: string;
  orderId: string;
  customerAccountId: string;
} | null {
  if (!token || typeof token !== "string") return null;

  const parts = token.split(".");
  if (parts.length !== 2) return null;

  const [payloadBase64, signature] = parts;
  if (!payloadBase64 || !signature) return null;

  const expectedSignature = crypto
    .createHmac("sha256", getSecret())
    .update(payloadBase64)
    .digest("base64url");

  if (signature.length !== expectedSignature.length) return null;

  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (!crypto.timingSafeEqual(sigBuffer, expectedBuffer)) return null;

  try {
    const jsonStr = Buffer.from(payloadBase64, "base64url").toString("utf-8");
    const data: SignedInvoicePayload = JSON.parse(jsonStr);

    if (!data.shop || !data.orderId || !data.customerAccountId || !data.exp) {
      return null;
    }

    if (Date.now() > data.exp) {
      return null;
    }

    return {
      shop: data.shop,
      orderId: data.orderId,
      customerAccountId: data.customerAccountId,
    };
  } catch {
    return null;
  }
}

export function buildSignedInvoiceUrl(appUrl: string, token: string): string {
  const url = new URL("/public/invoice-link", appUrl);
  url.searchParams.set("token", token);
  return url.toString();
}
