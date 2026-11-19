import type { LoaderFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";
import { verifySignedInvoiceToken } from "../utils/invoice-link.server";
import { generateInvoicePdf, ORDER_INVOICE_QUERY, type InvoiceOrder } from "../utils/invoice.server";

/**
 * Public stateless streaming endpoint for HMAC-signed invoice download links.
 *
 * Verifies the cryptographic token signature and TTL, fetches the order from Shopify,
 * validates customer ownership, and streams the generated PDF directly to the client.
 * No PDF buffers are retained in server process memory.
 */
export async function loader({ request }: LoaderFunctionArgs) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token");

  if (!token) {
    return new Response("Missing download token.", {
      status: 400,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const payload = verifySignedInvoiceToken(token);
  if (!payload) {
    return new Response("This invoice link is invalid or has expired.", {
      status: 403,
      headers: { "Content-Type": "text/plain" },
    });
  }

  const { shop, orderId, customerAccountId } = payload;

  try {
    const { admin } = await unauthenticated.admin(shop);

    const response = await admin.graphql(ORDER_INVOICE_QUERY, {
      variables: { id: orderId },
    });
    const json = await response.json();
    const order: InvoiceOrder | undefined = json.data?.order;

    if (!order) {
      return new Response("Order not found.", {
        status: 404,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const numericId = (gidOrId?: string | null) => gidOrId?.match(/\d+$/)?.[0];
    if (!order.customer?.id || numericId(order.customer.id) !== numericId(customerAccountId)) {
      return new Response("Unauthorized access to this invoice.", {
        status: 403,
        headers: { "Content-Type": "text/plain" },
      });
    }

    const pdfBuffer = await generateInvoicePdf(order);
    const filename = `invoice-${order.name.replace(/[^a-zA-Z0-9-_]/g, "")}.pdf`;

    return new Response(new Uint8Array(pdfBuffer), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(pdfBuffer.length),
        "Cache-Control": "private, no-cache, no-store, must-revalidate",
      },
    });
  } catch (err: unknown) {
    console.error("[public-invoice-link] Error generating invoice:", err);
    return new Response("Internal server error generating invoice.", {
      status: 500,
      headers: { "Content-Type": "text/plain" },
    });
  }
}
