import { describe, it, expect } from "vitest";
import {
  createSignedInvoiceToken,
  verifySignedInvoiceToken,
} from "../app/utils/invoice-link.server";

describe("invoice-link stateless HMAC tokens", () => {
  const sampleParams = {
    shop: "test-store.myshopify.com",
    orderId: "gid://shopify/Order/123456789",
    customerAccountId: "gid://shopify/Customer/987654321",
  };

  it("creates and verifies a valid signed token", () => {
    const token = createSignedInvoiceToken(sampleParams);
    expect(typeof token).toBe("string");
    expect(token).toContain(".");

    const verified = verifySignedInvoiceToken(token);
    expect(verified).not.toBeNull();
    expect(verified?.shop).toBe(sampleParams.shop);
    expect(verified?.orderId).toBe(sampleParams.orderId);
    expect(verified?.customerAccountId).toBe(sampleParams.customerAccountId);
  });

  it("rejects a tampered token where payload was changed", () => {
    const token = createSignedInvoiceToken(sampleParams);
    const [payloadBase64, signature] = token.split(".");
    
    // Tamper payload to impersonate another order
    const tamperedPayload = Buffer.from(
      JSON.stringify({ ...sampleParams, orderId: "gid://shopify/Order/999999999", exp: Date.now() + 60000 })
    ).toString("base64url");
    const tamperedToken = `${tamperedPayload}.${signature}`;

    const verified = verifySignedInvoiceToken(tamperedToken);
    expect(verified).toBeNull();
  });

  it("rejects an expired token", () => {
    // Construct expired payload
    const expiredPayload = {
      ...sampleParams,
      exp: Date.now() - 1000, // expired 1s ago
    };
    const crypto = require("node:crypto");
    const secret = process.env.SHOPIFY_API_SECRET || "orderease-secure-invoice-secret";
    const payloadBase64 = Buffer.from(JSON.stringify(expiredPayload)).toString("base64url");
    const signature = crypto.createHmac("sha256", secret).update(payloadBase64).digest("base64url");
    const expiredToken = `${payloadBase64}.${signature}`;

    const verified = verifySignedInvoiceToken(expiredToken);
    expect(verified).toBeNull();
  });

  it("rejects invalid or garbage token formats", () => {
    expect(verifySignedInvoiceToken("")).toBeNull();
    expect(verifySignedInvoiceToken("invalid-token-without-dot")).toBeNull();
    expect(verifySignedInvoiceToken("a.b.c")).toBeNull();
    expect(verifySignedInvoiceToken(null as any)).toBeNull();
  });
});
