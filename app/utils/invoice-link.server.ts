import crypto from "node:crypto";

const LINK_TTL_MS = 5 * 60 * 1000; // 5 minutes — plenty of time to open the download

interface StoredInvoice {
  pdfBuffer: Buffer | Uint8Array;
  filename: string;
  expires: number;
}

const invoiceCache = new Map<string, StoredInvoice>();

// Clean up expired entries every minute
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of invoiceCache.entries()) {
    if (val.expires < now) {
      invoiceCache.delete(key);
    }
  }
}, 60 * 1000).unref();

export function storeInvoiceDownload(pdfBuffer: Buffer | Uint8Array, filename: string): string {
  const token = crypto.randomUUID();
  invoiceCache.set(token, {
    pdfBuffer,
    filename,
    expires: Date.now() + LINK_TTL_MS,
  });
  return token;
}

export function getInvoiceDownload(token: string): { pdfBuffer: Buffer | Uint8Array; filename: string } | null {
  const entry = invoiceCache.get(token);
  if (!entry) return null;
  if (entry.expires < Date.now()) {
    invoiceCache.delete(token);
    return null;
  }
  return { pdfBuffer: entry.pdfBuffer, filename: entry.filename };
}

export function buildSignedInvoiceUrl(appUrl: string, token: string): string {
  const url = new URL("/public/invoice-link", appUrl);
  url.searchParams.set("token", token);
  return url.toString();
}
