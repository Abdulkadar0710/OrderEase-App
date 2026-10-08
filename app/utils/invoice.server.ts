import PDFDocument from "pdfkit";

export const ORDER_INVOICE_QUERY = `#graphql
  query getOrderInvoice($id: ID!) {
    order(id: $id) {
      id
      name
      createdAt
      email
      currencyCode
      tags
      discountCodes
      metafield(namespace: "orderease", key: "free_shipping_code") {
        value
      }
      discountApplications(first: 20) {
        nodes {
          targetType
          targetSelection
          allocationMethod
          ... on DiscountCodeApplication {
            code
          }
          ... on ManualDiscountApplication {
            title
            description
          }
          ... on ScriptDiscountApplication {
            title
          }
          ... on AutomaticDiscountApplication {
            title
          }
        }
      }
      customer {
        id
        firstName
        lastName
        email
      }
      billingAddress {
        name
        address1
        address2
        city
        province
        zip
        country
      }
      shippingAddress {
        name
        address1
        address2
        city
        province
        zip
        country
      }
      lineItems(first: 100) {
        edges {
          node {
            name
            quantity
            currentQuantity
            originalUnitPriceSet {
              shopMoney { amount currencyCode }
            }
            originalTotalSet {
              shopMoney { amount currencyCode }
            }
            discountedUnitPriceSet {
              shopMoney { amount currencyCode }
            }
            discountedTotalSet {
              shopMoney { amount currencyCode }
            }
            totalDiscountSet {
              shopMoney { amount currencyCode }
            }
            discountAllocations {
              allocatedAmountSet {
                shopMoney { amount currencyCode }
              }
              discountApplication {
                targetType
                targetSelection
                allocationMethod
                ... on DiscountCodeApplication {
                  code
                }
                ... on ManualDiscountApplication {
                  title
                  description
                }
                ... on ScriptDiscountApplication {
                  title
                }
                ... on AutomaticDiscountApplication {
                  title
                }
              }
            }
          }
        }
      }
      currentSubtotalPriceSet {
        shopMoney { amount currencyCode }
      }
      currentShippingPriceSet {
        shopMoney { amount currencyCode }
      }
      totalShippingPriceSet {
        shopMoney { amount currencyCode }
      }
      shippingLine {
        id
        title
        code
        originalPriceSet {
          shopMoney { amount currencyCode }
        }
        discountedPriceSet {
          shopMoney { amount currencyCode }
        }
        currentDiscountedPriceSet {
          shopMoney { amount currencyCode }
        }
        discountAllocations {
          allocatedAmountSet {
            shopMoney { amount currencyCode }
          }
          discountApplication {
            targetType
            targetSelection
            allocationMethod
            ... on DiscountCodeApplication {
              code
            }
            ... on ManualDiscountApplication {
              title
              description
            }
            ... on ScriptDiscountApplication {
              title
            }
            ... on AutomaticDiscountApplication {
              title
            }
          }
        }
      }
      shippingLines(first: 5) {
        nodes {
          id
          title
          code
          originalPriceSet {
            shopMoney { amount currencyCode }
          }
          discountedPriceSet {
            shopMoney { amount currencyCode }
          }
          currentDiscountedPriceSet {
            shopMoney { amount currencyCode }
          }
          discountAllocations {
            allocatedAmountSet {
              shopMoney { amount currencyCode }
            }
            discountApplication {
              targetType
              targetSelection
              allocationMethod
              ... on DiscountCodeApplication {
                code
              }
              ... on ManualDiscountApplication {
                title
                description
              }
              ... on ScriptDiscountApplication {
                title
              }
              ... on AutomaticDiscountApplication {
                title
              }
            }
          }
        }
      }
      currentTotalTaxSet {
        shopMoney { amount currencyCode }
      }
      currentTotalDiscountsSet {
        shopMoney { amount currencyCode }
      }
      currentTotalPriceSet {
        shopMoney { amount currencyCode }
      }
      totalReceivedSet {
        shopMoney { amount currencyCode }
      }
      totalOutstandingSet {
        shopMoney { amount currencyCode }
      }
    }
  }
`;

interface Money {
  amount: string;
  currencyCode: string;
}

export interface InvoiceOrder {
  id: string;
  name: string;
  createdAt: string;
  email?: string | null;
  currencyCode: string;
  tags?: string[] | null;
  discountCodes?: string[] | null;
  metafield?: { value?: string | null } | null;
  discountApplications?: {
    nodes?: Array<{
      targetType?: string;
      targetSelection?: string;
      allocationMethod?: string;
      code?: string;
      title?: string;
      description?: string;
    }>;
  } | null;
  customer?: {
    id?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    email?: string | null;
  } | null;
  billingAddress?: {
    name?: string | null;
    address1?: string | null;
    address2?: string | null;
    city?: string | null;
    province?: string | null;
    zip?: string | null;
    country?: string | null;
  } | null;
  lineItems: {
    edges: Array<{
      node: {
        name: string;
        quantity: number;
        currentQuantity: number;
        originalUnitPriceSet?: { shopMoney: Money } | null;
        originalTotalSet?: { shopMoney: Money } | null;
        discountedUnitPriceSet?: { shopMoney: Money } | null;
        discountedTotalSet?: { shopMoney: Money } | null;
        totalDiscountSet?: { shopMoney: Money } | null;
        discountAllocations?: Array<{
          allocatedAmountSet?: { shopMoney: Money } | null;
          discountApplication?: {
            targetType?: string;
            targetSelection?: string;
            allocationMethod?: string;
            code?: string;
            title?: string;
            description?: string;
          } | null;
        }> | null;
      };
    }>;
  };
  currentSubtotalPriceSet?: { shopMoney: Money } | null;
  currentShippingPriceSet?: { shopMoney: Money } | null;
  totalShippingPriceSet?: { shopMoney: Money } | null;
  shippingLine?: {
    id?: string | null;
    title?: string | null;
    code?: string | null;
    originalPriceSet?: { shopMoney: Money } | null;
    discountedPriceSet?: { shopMoney: Money } | null;
    currentDiscountedPriceSet?: { shopMoney: Money } | null;
    discountAllocations?: Array<{
      allocatedAmountSet?: { shopMoney: Money } | null;
      discountApplication?: {
        targetType?: string;
        targetSelection?: string;
        allocationMethod?: string;
        code?: string;
        title?: string;
        description?: string;
      } | null;
    }> | null;
  } | null;
  shippingLines?: {
    nodes?: Array<{
      id?: string | null;
      title?: string | null;
      code?: string | null;
      originalPriceSet?: { shopMoney: Money } | null;
      discountedPriceSet?: { shopMoney: Money } | null;
      currentDiscountedPriceSet?: { shopMoney: Money } | null;
      discountAllocations?: Array<{
        allocatedAmountSet?: { shopMoney: Money } | null;
        discountApplication?: {
          targetType?: string;
          targetSelection?: string;
          allocationMethod?: string;
          code?: string;
          title?: string;
          description?: string;
        } | null;
      }> | null;
    }>;
  } | null;
  currentTotalTaxSet?: { shopMoney: Money } | null;
  currentTotalDiscountsSet?: { shopMoney: Money } | null;
  currentTotalPriceSet?: { shopMoney: Money } | null;
  totalReceivedSet?: { shopMoney: Money } | null;
  totalOutstandingSet?: { shopMoney: Money } | null;
}

function formatMoney(money?: Money | null, fallbackCurrency?: string): string {
  if (!money) return "";
  const amount = Number(money.amount || 0).toFixed(2);
  return `${amount} ${money.currencyCode || fallbackCurrency || ""}`.trim();
}

function cleanDiscountTitle(raw?: string | null): string {
  if (!raw) return "";
  let cleaned = raw
    .replace(/\{@d\d+:[^}]*\}/gi, "")
    .replace(/@d\d+:\s*/gi, "")
    .replace(/\{[^}]*\}/g, "")
    .replace(/^Discount\s+/gi, "")
    .trim();
  return cleaned || raw.trim();
}

function formatAddress(address?: InvoiceOrder["billingAddress"]): string[] {
  if (!address) return [];
  const lines: string[] = [];
  if (address.name) lines.push(address.name);
  if (address.address1) lines.push(address.address1);
  if (address.address2) lines.push(address.address2);
  const cityLine = [address.city, address.province, address.zip]
    .filter(Boolean)
    .join(", ");
  if (cityLine) lines.push(cityLine);
  if (address.country) lines.push(address.country);
  return lines;
}

export function extractFreeShippingCode(order: InvoiceOrder): string | null {
  if (order.metafield?.value?.trim()) {
    return order.metafield.value.trim();
  }

  if (Array.isArray(order.tags)) {
    for (const tag of order.tags) {
      const match = tag.match(/^free-shipping:(.+)$/i);
      if (match) return match[1].trim();
    }
  }

  const shippingLine = order.shippingLine || order.shippingLines?.nodes?.[0];
  const title = shippingLine?.title || "";
  const titleMatch =
    title.match(/\(Free\s*-\s*([^)]+)\)/i) ||
    title.match(/Free Shipping\s*\(([^)]+)\)/i);
  if (titleMatch) {
    return titleMatch[1].trim();
  }

  const allocs = shippingLine?.discountAllocations || [];
  for (const alloc of allocs) {
    if (alloc.discountApplication?.code) {
      return alloc.discountApplication.code;
    }
  }

  const orderApps = order.discountApplications?.nodes || [];
  for (const app of orderApps) {
    if (app.targetType === "SHIPPING" && app.code) {
      return app.code;
    }
  }

  const dCodes = order.discountCodes || [];
  if (dCodes.length > 0) {
    for (const code of dCodes) {
      if (/ship/i.test(code) || /free/i.test(code)) {
        return code;
      }
    }
    if (/\bfree\b/i.test(title)) {
      return dCodes[0];
    }
  }

  return null;
}

/**
 * Renders an order into a real PDF invoice and resolves with the PDF bytes.
 */
export function generateInvoicePdf(order: InvoiceOrder): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4", margin: 50 });
      const chunks: Buffer[] = [];

      doc.on("data", (chunk: Buffer) => chunks.push(chunk));
      doc.on("end", () => resolve(Buffer.concat(chunks)));
      doc.on("error", reject);

      const currency = order.currencyCode;
      const orderDate = order.createdAt
        ? new Date(order.createdAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })
        : "";

      // Header
      const freeShippingCode = extractFreeShippingCode(order);

      doc.fontSize(22).font("Helvetica-Bold").text("Invoice", { align: "left" });
      doc.moveDown(0.5);
      doc
        .fontSize(11)
        .font("Helvetica")
        .text(`Order: ${order.name}`)
        .text(orderDate ? `Date: ${orderDate}` : "");

      const allDiscounts = Array.from(
        new Set([
          ...(order.discountCodes || []),
          ...(freeShippingCode ? [freeShippingCode] : []),
        ]),
      ).filter(Boolean);

      if (allDiscounts.length > 0) {
        doc.text(`Discount: ${allDiscounts.join(", ")}`);
      }

      doc.moveDown();

      // Billing / customer info
      const customerName = [order.customer?.firstName, order.customer?.lastName]
        .filter(Boolean)
        .join(" ");
      const customerEmail = order.customer?.email || order.email || "";

      const billingLines = formatAddress(order.billingAddress);

      const infoTop = doc.y;
      doc.font("Helvetica-Bold").text("Billed To", 50, infoTop);
      doc.font("Helvetica");
      let infoY = infoTop + 16;
      if (customerName) {
        doc.text(customerName, 50, infoY);
        infoY += 14;
      }
      if (customerEmail) {
        doc.text(customerEmail, 50, infoY);
        infoY += 14;
      }
      for (const line of billingLines) {
        doc.text(line, 50, infoY);
        infoY += 14;
      }

      doc.y = Math.max(doc.y, infoY) + 10;
      doc.moveDown();

      // Table Column Definitions
      // Usable width: 50 to 545 = 495pt
      const col = {
        name: 50,      // width: 145
        qty: 200,      // width: 30
        origPrice: 235,// width: 60
        discount: 300, // width: 105
        netPrice: 410, // width: 65
        total: 480,    // width: 65
      };

      const drawTableHeader = (y: number) => {
        doc.font("Helvetica-Bold").fontSize(9).fillColor("#000000");
        doc.text("Item", col.name, y);
        doc.text("Qty", col.qty, y, { width: 30, align: "center" });
        doc.text("Orig. Price", col.origPrice, y, { width: 60, align: "right" });
        doc.text("Discount", col.discount, y, { width: 105, align: "right" });
        doc.text("Net Price", col.netPrice, y, { width: 65, align: "right" });
        doc.text("Total", col.total, y, { width: 65, align: "right" });

        doc
          .moveTo(50, y + 14)
          .lineTo(545, y + 14)
          .strokeColor("#cccccc")
          .stroke();
      };

      const tableTop = doc.y;
      drawTableHeader(tableTop);

      let rowY = tableTop + 22;

      // Only include items that are still active in the order (not removed by edits)
      const items = (order.lineItems?.edges ?? []).filter(
        ({ node }) => node.currentQuantity > 0
      );

      for (const { node } of items) {
        const qty = node.currentQuantity;
        const origUnitMoney = node.originalUnitPriceSet?.shopMoney;
        const origUnitAmt = Number(origUnitMoney?.amount || 0);

        // Extract clean discount code / title / description names for active allocations only
        const activeAllocations = (node.discountAllocations || []).filter(
          (alloc) => Number(alloc.allocatedAmountSet?.shopMoney?.amount || 0) > 0.001
        );
        const targetAllocations =
          activeAllocations.length > 0
            ? activeAllocations
            : (node.discountAllocations || []);

        const discountCodes = Array.from(
          new Set(
            targetAllocations
              .map((alloc) => {
                const app = alloc.discountApplication;
                if (!app) return "";
                if (app.code) return app.code;
                return (
                  cleanDiscountTitle(app.title) ||
                  cleanDiscountTitle(app.description)
                );
              })
              .filter(Boolean)
          )
        );
        const discountNameStr = discountCodes.length > 0 ? discountCodes.join(", ") : "";

        // Determine total item discount amount for all units combined
        let totalDiscountAmt = 0;
        if (node.totalDiscountSet?.shopMoney) {
          totalDiscountAmt = Number(node.totalDiscountSet.shopMoney.amount || 0);
        } else if (node.discountAllocations && node.discountAllocations.length > 0) {
          totalDiscountAmt = node.discountAllocations.reduce((sum, alloc) => {
            return sum + Number(alloc.allocatedAmountSet?.shopMoney?.amount || 0);
          }, 0);
        }

        // Determine unit discount and discounted unit price
        let discUnitAmt = origUnitAmt;
        if (node.discountedUnitPriceSet?.shopMoney) {
          discUnitAmt = Number(node.discountedUnitPriceSet.shopMoney.amount);
        } else if (totalDiscountAmt > 0 && qty > 0) {
          discUnitAmt = Math.max(0, origUnitAmt - totalDiscountAmt / qty);
        }

        // If totalDiscountAmt was 0 but discUnitAmt < origUnitAmt, calculate totalDiscountAmt
        if (totalDiscountAmt === 0 && origUnitAmt > discUnitAmt && qty > 0) {
          totalDiscountAmt = (origUnitAmt - discUnitAmt) * qty;
        }

        const unitDiscountAmt = Math.max(0, origUnitAmt - discUnitAmt);
        const hasDiscount = unitDiscountAmt > 0.001 || totalDiscountAmt > 0.001;

        // Line total after discount
        let lineTotalAmt = discUnitAmt * qty;
        if (node.discountedTotalSet?.shopMoney) {
          lineTotalAmt = Number(node.discountedTotalSet.shopMoney.amount);
        }

        // Format money strings
        const origPriceStr = formatMoney(origUnitMoney || { amount: String(origUnitAmt), currencyCode: currency }, currency);
        const netPriceStr = formatMoney({ amount: discUnitAmt.toFixed(2), currencyCode: currency }, currency);
        const lineTotalStr = formatMoney({ amount: lineTotalAmt.toFixed(2), currencyCode: currency }, currency);

        // Calculate height requirements
        const nameHeight = doc.heightOfString(node.name, { width: 145 });
        const discountCellHeight = hasDiscount ? (qty > 1 ? 32 : 22) : 12;
        const totalRowHeight = Math.max(18, nameHeight, discountCellHeight) + 4;

        if (rowY + totalRowHeight > 730) {
          doc.addPage();
          rowY = 50;
          drawTableHeader(rowY);
          rowY += 22;
        }

        // Render Item Name (clean, without discount sublines underneath)
        doc.font("Helvetica").fontSize(9).fillColor("#000000");
        doc.text(node.name, col.name, rowY, { width: 145 });

        // Render Qty & Orig Price
        doc.text(String(qty), col.qty, rowY, { width: 30, align: "center" });
        doc.text(origPriceStr, col.origPrice, rowY, { width: 60, align: "right" });

        // Render Discount Details in dedicated Discount column
        if (hasDiscount) {
          const codeLabel = discountNameStr ? discountNameStr : "Discount";
          const unitDiscText = `-${formatMoney({ amount: unitDiscountAmt.toFixed(2), currencyCode: currency }, currency)} / unit`;
          const totalDiscText = `(-${formatMoney({ amount: totalDiscountAmt.toFixed(2), currencyCode: currency }, currency)} total)`;

          doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#000000");
          doc.text(codeLabel, col.discount, rowY, { width: 105, align: "right" });

          doc.font("Helvetica").fontSize(8).fillColor("#555555");
          doc.text(unitDiscText, col.discount, rowY + 11, { width: 105, align: "right" });

          if (qty > 1) {
            doc.text(totalDiscText, col.discount, rowY + 21, { width: 105, align: "right" });
          }
        } else {
          doc.font("Helvetica").fontSize(9).fillColor("#000000");
          doc.text("-", col.discount, rowY, { width: 105, align: "right" });
        }

        // Render Net Price & Total
        doc.font("Helvetica").fontSize(9).fillColor("#000000");
        doc.text(netPriceStr, col.netPrice, rowY, { width: 65, align: "right" });
        doc.text(lineTotalStr, col.total, rowY, { width: 65, align: "right" });

        rowY += totalRowHeight + 4;
      }

      doc
        .moveTo(50, rowY + 4)
        .lineTo(545, rowY + 4)
        .strokeColor("#cccccc")
        .stroke();

      // Totals Summary Section
      let totalsY = rowY + 16;
      const totalsRow = (label: string, value?: Money | null, bold = false, isDiscount = false) => {
        if (!value) return;
        const valNum = Number(value.amount || 0);
        if (isDiscount && valNum <= 0) return;

        doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(9).fillColor("#000000");
        doc.text(label, col.netPrice - 60, totalsY, { width: 120, align: "left" });

        const formattedVal = isDiscount ? `-${formatMoney(value, currency)}` : formatMoney(value, currency);
        doc.text(formattedVal, col.total, totalsY, { width: 65, align: "right" });
        totalsY += 16;
      };

      totalsRow("Subtotal", order.currentSubtotalPriceSet?.shopMoney);

      // Shipping calculation:
      // Prefer currentShippingPriceSet (reflects order edits and shipping discounts like Free Shipping).
      // Fallback to shippingLine currentDiscountedPriceSet / discountedPriceSet,
      // discount allocation calculations, or totalShippingPriceSet.
      const shippingLine = order.shippingLine || order.shippingLines?.nodes?.[0];
      const shippingAllocations = shippingLine?.discountAllocations || [];
      const totalShippingDiscount = shippingAllocations.reduce((sum, alloc) => {
        return sum + Number(alloc.allocatedAmountSet?.shopMoney?.amount || 0);
      }, 0);

      const origShippingAmt = Number(
        shippingLine?.originalPriceSet?.shopMoney?.amount ??
        order.totalShippingPriceSet?.shopMoney?.amount ??
        0
      );

      let shippingMoney: Money;
      if (order.currentShippingPriceSet?.shopMoney) {
        shippingMoney = order.currentShippingPriceSet.shopMoney;
      } else if (shippingLine?.currentDiscountedPriceSet?.shopMoney) {
        shippingMoney = shippingLine.currentDiscountedPriceSet.shopMoney;
      } else if (shippingLine?.discountedPriceSet?.shopMoney) {
        shippingMoney = shippingLine.discountedPriceSet.shopMoney;
      } else if (totalShippingDiscount > 0) {
        shippingMoney = {
          amount: Math.max(0, origShippingAmt - totalShippingDiscount).toFixed(2),
          currencyCode: currency,
        };
      } else {
        shippingMoney = order.totalShippingPriceSet?.shopMoney || {
          amount: "0.00",
          currencyCode: currency,
        };
      }

      if (freeShippingCode && (shippingLine?.title?.includes("Free") || origShippingAmt > 0)) {
        shippingMoney = { amount: "0.00", currencyCode: currency };
      }

      let shippingLabel = "Shipping";
      if (freeShippingCode) {
        shippingLabel = `Shipping (Free - ${freeShippingCode})`;
      } else if (Number(shippingMoney.amount) === 0) {
        shippingLabel = "Shipping (Free)";
      }

      totalsRow(shippingLabel, shippingMoney);
      totalsRow("Tax", order.currentTotalTaxSet?.shopMoney);
      if (order.currentTotalDiscountsSet?.shopMoney && Number(order.currentTotalDiscountsSet.shopMoney.amount) > 0) {
        totalsRow("Total Discounts", order.currentTotalDiscountsSet?.shopMoney, false, true);
      }
      totalsRow("Total", order.currentTotalPriceSet?.shopMoney, true);

      if (freeShippingCode) {
        totalsY += 4;
        doc.font("Helvetica-Oblique").fontSize(8.5).fillColor("#2e7d32");
        doc.text(
          `* Free shipping discount code "${freeShippingCode}" applied`,
          col.netPrice - 60,
          totalsY,
          { width: 185, align: "right" },
        );
        totalsY += 12;
      }

      // Paid and Remaining Balance calculation
      const totalPriceAmt = Number(order.currentTotalPriceSet?.shopMoney?.amount || 0);
      const paidAmt = order.totalReceivedSet?.shopMoney
        ? Number(order.totalReceivedSet.shopMoney.amount)
        : totalPriceAmt;

      const outstandingAmt = order.totalOutstandingSet?.shopMoney
        ? Number(order.totalOutstandingSet.shopMoney.amount)
        : Math.max(0, totalPriceAmt - paidAmt);

      const paidMoney: Money = order.totalReceivedSet?.shopMoney || {
        amount: paidAmt.toFixed(2),
        currencyCode: currency,
      };

      const remainingMoney: Money = order.totalOutstandingSet?.shopMoney || {
        amount: outstandingAmt.toFixed(2),
        currencyCode: currency,
      };

      totalsY += 4;
      totalsRow("Amount Paid", paidMoney);
      totalsRow("Remaining Amount", remainingMoney, outstandingAmt > 0);

      doc.end();
    } catch (err) {
      reject(err);
    }
  });
}



