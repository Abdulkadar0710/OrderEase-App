import type { LoaderFunctionArgs } from "react-router";
import { getInvoiceDownload } from "../utils/invoice-link.server";

/**
 * Public streaming endpoint for pre-authorized invoice PDFs.
 *
 * The PDF is authorized and rendered in `/api/order/invoice` under customer account
 * session authentication, stored in a short-lived single-session cache, and retrieved
 * here via an unguessable UUID download token.
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

  const download = getInvoiceDownload(token);
  if (!download) {
    return new Response("This invoice link is invalid or has expired.", {
      status: 403,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return new Response(new Uint8Array(download.pdfBuffer), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${download.filename}"`,
      "Content-Length": String(download.pdfBuffer.length),
      "Cache-Control": "no-store",
    },
  });
}
