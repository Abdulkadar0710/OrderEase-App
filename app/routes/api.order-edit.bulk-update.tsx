import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate, unauthenticated } from "../shopify.server";
import { addOrderTags } from "../utils/orderTagsHelper.server";
import { applyPaymentPendingHold } from "../utils/fulfillmentHoldHelper.server";
import { trackOrderEdit } from "../utils/analyticsHelper.server";
import { validateOrderEditable } from "../utils/orderGuard.server";
import { checkAndRemoveInvalidBxgyDiscounts } from "../utils/bxgyDiscountHelper.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { cors } = await authenticate.public.customerAccount(request);
  return cors(
    Response.json({
      success: true,
      message: "Bulk update endpoint ready.",
    }),
  );
}

interface CsvRow {
  productName?: string;
  sku?: string;
  replaceWithSku?: string;
  quantity: number;
  actionType?: "ADD" | "UPDATE_QTY" | "REPLACE";
  lineItemId?: string;
  variantId?: string;
  newVariantId?: string;
}

interface RowError {
  productName: string;
  sku: string;
  issue: string;
}

/**
 * Escapes a cell value for standard CSV output.
 */
function escapeCsv(val: unknown): string {
  if (val === null || val === undefined) return "";
  const str = String(val);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generates an errors.csv string from an array of RowErrors.
 */
function generateErrorCsv(errors: RowError[]): string {
  const lines = ["Product name,sku,issue"];
  for (const err of errors) {
    lines.push(
      `${escapeCsv(err.productName)},${escapeCsv(err.sku)},${escapeCsv(err.issue)}`,
    );
  }
  return lines.join("\n");
}

/**
 * Robust CSV parser that handles commas inside quotes and various header namings.
 */
function parseCsvContent(rawCsv: string): CsvRow[] {
  if (!rawCsv || typeof rawCsv !== "string") return [];

  const cleanCsv = rawCsv.replace(/^\uFEFF/, "").trim();
  const lines = cleanCsv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  // Parse header line
  const parseLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = "";
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        if (inQuotes && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === "," && !inQuotes) {
        result.push(cur.trim());
        cur = "";
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const headers = parseLine(lines[0]).map((h) =>
    h.toLowerCase().replace(/[^a-z0-9]/g, ""),
  );

  let replaceSkuIdx = headers.findIndex((h) => h.includes("replace"));
  let skuIdx = headers.findIndex((h) => h === "sku" || (h.includes("sku") && !h.includes("replace")));
  let productNameIdx = headers.findIndex(
    (h) => (h.includes("product") || h.includes("title") || h.includes("name")) && !h.includes("sku"),
  );
  let quantityIdx = headers.findIndex(
    (h) => h.includes("quantity") || h.includes("qty") || h === "count",
  );

  // Fallbacks by standard column positions: Product name, sku, replace with sku, quantity
  if (skuIdx === -1 && headers.length >= 2) skuIdx = 1;
  if (productNameIdx === -1) productNameIdx = 0;
  if (replaceSkuIdx === -1 && headers.length >= 3) replaceSkuIdx = 2;
  if (quantityIdx === -1 && headers.length >= 4) quantityIdx = 3;

  const rows: CsvRow[] = [];

  for (let i = 1; i < lines.length; i++) {
    const parts = parseLine(lines[i]);
    if (parts.length === 0 || parts.every((p) => p === "")) continue;

    const productName = productNameIdx !== -1 && parts[productNameIdx] ? parts[productNameIdx] : "";
    const sku = skuIdx !== -1 && parts[skuIdx] ? parts[skuIdx] : "";
    const replaceWithSku =
      replaceSkuIdx !== -1 && parts[replaceSkuIdx] ? parts[replaceSkuIdx] : "";
    const rawQty = quantityIdx !== -1 && parts[quantityIdx] ? parts[quantityIdx] : "1";
    const quantity = parseInt(rawQty, 10);

    rows.push({
      productName,
      sku,
      replaceWithSku,
      quantity: isNaN(quantity) ? 1 : quantity,
    });
  }

  return rows;
}

export async function action({ request }: ActionFunctionArgs) {
  const { sessionToken, cors } = await authenticate.public.customerAccount(request);

  if (request.method === "OPTIONS") {
    return cors(
      new Response(null, {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
  }

  const storeDomain = sessionToken.dest.replace(/^https?:\/\//, "");
  const customerAccountId = sessionToken.sub;
  const { admin } = await unauthenticated.admin(storeDomain);

  let body: any = {};
  try {
    body = await request.json();
  } catch (e) {
    return cors(
      Response.json(
        {
          success: false,
          hasErrors: true,
          errors: [{ productName: "-", sku: "-", issue: "Invalid JSON payload." }],
          errorCsv: generateErrorCsv([{ productName: "-", sku: "-", issue: "Invalid JSON payload." }]),
        },
        { status: 400 },
      ),
    );
  }

  const { orderId, rows: rawRows, rawCsv, source } = body || {};

  if (!orderId) {
    return cors(
      Response.json(
        {
          success: false,
          hasErrors: true,
          errors: [{ productName: "-", sku: "-", issue: "Missing orderId." }],
          errorCsv: generateErrorCsv([{ productName: "-", sku: "-", issue: "Missing orderId." }]),
        },
        { status: 400 },
      ),
    );
  }

  // Centralized security guard (Ownership, Cancellation, Fulfillment, Time Limit, Max Edits)
  const guard = await validateOrderEditable({
    admin,
    shop: storeDomain,
    orderId,
    customerAccountId,
  });

  if (!guard.allowed) {
    const issue = guard.message;
    return cors(
      Response.json(
        {
          success: false,
          hasErrors: true,
          errors: [{ productName: "-", sku: "-", issue }],
          errorCsv: generateErrorCsv([{ productName: "-", sku: "-", issue }]),
        },
        { status: guard.status },
      ),
    );
  }

  // 1. Fetch current order details and verify ownership
  let order: any = null;
  try {
    const orderRes = await admin.graphql(
      `#graphql
      query GetOrderForBulkUpdate($id: ID!) {
        order(id: $id) {
          id
          name
          statusPageUrl
          cancelledAt
          customer { id }
          lineItems(first: 250) {
            nodes {
              id
              name
              title
              currentQuantity
              quantity
              sku
              variant {
                id
                sku
                title
                inventoryQuantity
                availableForSale
                product { id title }
              }
            }
          }
        }
      }`,
      { variables: { id: orderId } },
    );
    const orderJson = await orderRes.json();
    order = orderJson.data?.order;
  } catch (e) {
    console.error("[bulk-update] Failed to load order:", e);
  }

  if (!order) {
    const issue = "Order not found or inaccessible.";
    return cors(
      Response.json(
        {
          success: false,
          hasErrors: true,
          errors: [{ productName: "-", sku: "-", issue }],
          errorCsv: generateErrorCsv([{ productName: "-", sku: "-", issue }]),
        },
        { status: 404 },
      ),
    );
  }

  if (order.cancelledAt) {
    const issue = "Order has been cancelled. No further modifications can be made.";
    return cors(
      Response.json(
        {
          success: false,
          hasErrors: true,
          errors: [{ productName: "-", sku: "-", issue }],
          errorCsv: generateErrorCsv([{ productName: "-", sku: "-", issue }]),
        },
        { status: 422 },
      ),
    );
  }

  const numericId = (gidOrId?: string | null) => gidOrId?.match(/\d+$/)?.[0];
  if (!order.customer?.id || numericId(order.customer.id) !== numericId(customerAccountId)) {
    const issue = "Not authorized to update this order.";
    return cors(
      Response.json(
        {
          success: false,
          hasErrors: true,
          errors: [{ productName: "-", sku: "-", issue }],
          errorCsv: generateErrorCsv([{ productName: "-", sku: "-", issue }]),
        },
        { status: 403 },
      ),
    );
  }

  // 2. Parse CSV input (either from parsed array rows or raw string)
  let parsedRows: CsvRow[] = [];
  if (Array.isArray(rawRows) && rawRows.length > 0) {
    parsedRows = rawRows.map((r: any) => ({
      productName: String(r.productName || r["Product name"] || "").trim(),
      sku: String(r.sku || r.SKU || "").trim(),
      replaceWithSku: String(r.replaceWithSku || r["replace with sku"] || r.replace_with_sku || "").trim(),
      quantity: isNaN(Number(r.quantity)) ? 1 : Number(r.quantity),
      actionType: r.actionType,
      lineItemId: r.lineItemId,
      variantId: r.variantId,
      newVariantId: r.newVariantId,
    }));
  } else if (typeof rawCsv === "string" && rawCsv.trim().length > 0) {
    parsedRows = parseCsvContent(rawCsv);
  }

  if (parsedRows.length === 0) {
    const issue = "No update rows found in the CSV. Please ensure the CSV has data.";
    return cors(
      Response.json(
        {
          success: false,
          hasErrors: true,
          errors: [{ productName: "-", sku: "-", issue }],
          errorCsv: generateErrorCsv([{ productName: "-", sku: "-", issue }]),
        },
        { status: 400 },
      ),
    );
  }

  // 3. Index existing active line items by SKU, Line Item ID, and Variant ID
  const activeItemsBySku = new Map<string, any>();
  const activeItemsByLineId = new Map<string, any>();
  const activeItemsByVariantId = new Map<string, any>();

  for (const item of order.lineItems?.nodes || []) {
    if (item.currentQuantity > 0) {
      if (item.id) activeItemsByLineId.set(item.id, item);
      if (item.variant?.id) activeItemsByVariantId.set(item.variant.id, item);
      const itemSku = (item.sku || item.variant?.sku || "").trim().toLowerCase();
      if (itemSku) {
        activeItemsBySku.set(itemSku, item);
      }
    }
  }

  // Helper to query variants from the store catalog by SKU
  const variantCache = new Map<string, any>();
  async function findVariantBySku(skuToFind: string) {
    const key = skuToFind.trim().toLowerCase();
    if (variantCache.has(key)) return variantCache.get(key);

    try {
      const res = await admin.graphql(
        `#graphql
        query FindVariantBySku($query: String!) {
          productVariants(first: 10, query: $query) {
            nodes {
              id
              title
              sku
              inventoryQuantity
              availableForSale
              product { id title }
            }
          }
        }`,
        { variables: { query: `sku:"${skuToFind.trim()}"` } },
      );
      const json = await res.json();
      const nodes = json.data?.productVariants?.nodes || [];
      const match = nodes.find((v: any) => (v.sku || "").trim().toLowerCase() === key) || null;
      variantCache.set(key, match);
      return match;
    } catch (e) {
      console.warn("[bulk-update] Error querying variant by SKU:", skuToFind, e);
      variantCache.set(key, null);
      return null;
    }
  }

  // Helper to query variant by Variant ID
  const variantByIdCache = new Map<string, any>();
  async function findVariantById(variantId: string) {
    if (!variantId) return null;
    if (variantByIdCache.has(variantId)) return variantByIdCache.get(variantId);
    try {
      const res = await admin.graphql(
        `#graphql
        query FindVariantById($id: ID!) {
          productVariant(id: $id) {
            id
            title
            sku
            inventoryQuantity
            availableForSale
            product { id title }
          }
        }`,
        { variables: { id: variantId } },
      );
      const json = await res.json();
      const variant = json.data?.productVariant || null;
      variantByIdCache.set(variantId, variant);
      return variant;
    } catch (e) {
      console.warn("[bulk-update] Error querying variant by ID:", variantId, e);
      variantByIdCache.set(variantId, null);
      return null;
    }
  }

  // 4. Validate all rows and plan actions
  const rowErrors: RowError[] = [];
  const plannedActions: Array<{
    type: "ADD" | "UPDATE_QTY" | "REPLACE";
    productName: string;
    sku: string;
    replaceWithSku?: string;
    quantity: number;
    lineItemId?: string;
    variantId?: string;
    newVariantId?: string;
  }> = [];

  for (let idx = 0; idx < parsedRows.length; idx++) {
    const row = parsedRows[idx];
    const productName = row.productName || `Row #${idx + 1}`;
    let sku = row.sku ? String(row.sku).trim() : "";
    let replaceWithSku = row.replaceWithSku ? String(row.replaceWithSku).trim() : "";
    const quantity = Number(row.quantity);
    const lineItemId = row.lineItemId;
    const variantId = row.variantId;
    const newVariantId = row.newVariantId;
    const actionType = row.actionType;

    // Validate SKU presence for CSV or rows without direct IDs
    if (!sku && !variantId && !lineItemId) {
      rowErrors.push({
        productName,
        sku: "(blank)",
        issue: "SKU is required for each row.",
      });
      continue;
    }

    if (isNaN(quantity) || quantity < 0) {
      rowErrors.push({
        productName,
        sku: sku || "-",
        issue: "Quantity must be a valid non-negative number.",
      });
      continue;
    }

    // Identify existing order item
    let existingItem: any = null;
    if (lineItemId) {
      existingItem = activeItemsByLineId.get(lineItemId);
    }
    if (!existingItem && variantId && actionType !== "ADD") {
      existingItem = activeItemsByVariantId.get(variantId);
    }
    if (!existingItem && sku) {
      existingItem = activeItemsBySku.get(sku.toLowerCase());
    }

    // Determine operation type
    const isExplicitAdd = actionType === "ADD";
    const isExplicitReplace = actionType === "REPLACE";
    const isExplicitUpdate = actionType === "UPDATE_QTY";

    if (isExplicitAdd || (!existingItem && !isExplicitReplace && !isExplicitUpdate)) {
      // ── ADD PRODUCT ──
      if (replaceWithSku && !isExplicitAdd) {
        rowErrors.push({
          productName,
          sku: sku || "-",
          issue: `Cannot replace product: SKU '${sku}' does not exist in this order.`,
        });
        continue;
      }

      if (quantity <= 0) {
        rowErrors.push({
          productName,
          sku: sku || "-",
          issue: `Cannot add product with quantity 0.`,
        });
        continue;
      }

      let variant: any = null;
      if (variantId) {
        variant = await findVariantById(variantId);
      }
      if (!variant && sku) {
        variant = await findVariantBySku(sku);
      }

      if (!variant) {
        rowErrors.push({
          productName,
          sku: sku || "-",
          issue: sku ? `SKU '${sku}' not found in store catalog.` : "Product variant not found.",
        });
        continue;
      }

      if (!sku && variant.sku) {
        sku = variant.sku;
      }

      if (typeof variant.inventoryQuantity === "number" && variant.inventoryQuantity < quantity) {
        rowErrors.push({
          productName,
          sku: sku || variant.sku || "-",
          issue: `Insufficient stock for '${productName || variant.title}'. Requested: ${quantity}, Available: ${variant.inventoryQuantity}.`,
        });
        continue;
      }

      plannedActions.push({
        type: "ADD",
        productName: productName || variant.product?.title || variant.title,
        sku: sku || variant.sku || "-",
        quantity,
        variantId: variant.id,
      });
    } else if (isExplicitReplace || replaceWithSku) {
      // ── REPLACE WITH ANOTHER PRODUCT / VARIANT ──
      if (!existingItem) {
        rowErrors.push({
          productName,
          sku: sku || "-",
          issue: `Cannot replace item: Product does not exist in this order.`,
        });
        continue;
      }

      if (quantity <= 0) {
        rowErrors.push({
          productName,
          sku: sku || existingItem.sku || "-",
          issue: `Replacement quantity must be greater than 0.`,
        });
        continue;
      }

      let repVariant: any = null;
      if (newVariantId) {
        repVariant = await findVariantById(newVariantId);
      }
      if (!repVariant && replaceWithSku) {
        repVariant = await findVariantBySku(replaceWithSku);
      }

      if (!repVariant) {
        rowErrors.push({
          productName,
          sku: sku || existingItem.sku || "-",
          issue: replaceWithSku
            ? `Replacement SKU '${replaceWithSku}' not found in store catalog.`
            : "Replacement variant not found in store catalog.",
        });
        continue;
      }

      if (!replaceWithSku && repVariant.sku) {
        replaceWithSku = repVariant.sku;
      }

      if (typeof repVariant.inventoryQuantity === "number" && repVariant.inventoryQuantity < quantity) {
        rowErrors.push({
          productName,
          sku: sku || existingItem.sku || "-",
          issue: `Insufficient stock for replacement '${repVariant.title}'. Requested: ${quantity}, Available: ${repVariant.inventoryQuantity}.`,
        });
        continue;
      }

      plannedActions.push({
        type: "REPLACE",
        productName: productName || existingItem.title,
        sku: sku || existingItem.sku || existingItem.variant?.sku || "-",
        replaceWithSku: replaceWithSku || repVariant.sku || "-",
        quantity,
        lineItemId: existingItem.id,
        newVariantId: repVariant.id,
      });
    } else {
      // ── UPDATE QUANTITY ──
      if (!existingItem) {
        rowErrors.push({
          productName,
          sku: sku || "-",
          issue: `Item not found in current order to update quantity.`,
        });
        continue;
      }

      if (quantity === existingItem.currentQuantity) {
        // No change needed
        continue;
      }

      if (quantity > existingItem.currentQuantity) {
        const needed = quantity - existingItem.currentQuantity;
        const invQty = existingItem.variant?.inventoryQuantity;
        if (typeof invQty === "number" && invQty < needed) {
          rowErrors.push({
            productName,
            sku: sku || existingItem.sku || "-",
            issue: `Cannot increase quantity of SKU '${sku || existingItem.title}' to ${quantity}. Only ${invQty} additional unit(s) available in stock.`,
          });
          continue;
        }
      }

      plannedActions.push({
        type: "UPDATE_QTY",
        productName: productName || existingItem.title,
        sku: sku || existingItem.sku || existingItem.variant?.sku || "-",
        quantity,
        lineItemId: existingItem.id,
      });
    }
  }

  // 5. If ANY row validation failed, do NOT commit mutations — return errors.csv
  if (rowErrors.length > 0) {
    const errorCsv = generateErrorCsv(rowErrors);
    return cors(
      Response.json(
        {
          success: false,
          hasErrors: true,
          errors: rowErrors,
          errorCsv,
        },
        { status: 422 },
      ),
    );
  }

  if (plannedActions.length === 0) {
    return cors(
      Response.json({
        success: true,
        hasErrors: false,
        message: "No line item changes were required. The order is already up to date.",
        summary: { totalRows: parsedRows.length, actionsApplied: 0 },
      }),
    );
  }

  // 6. Execute all row updates in a single Shopify Order Editing mutation session
  try {
    // Step 6A: Begin order edit
    const beginRes = await admin.graphql(
      `#graphql
      mutation OrderEditBeginBulk($id: ID!) {
        orderEditBegin(id: $id) {
          calculatedOrder { id }
          userErrors { field message }
        }
      }`,
      { variables: { id: orderId } },
    );
    const beginJson = await beginRes.json();
    const beginErrors = beginJson.data?.orderEditBegin?.userErrors || [];
    if (beginErrors.length > 0) {
      const errs: RowError[] = beginErrors.map((e: any) => ({
        productName: "Order Edit",
        sku: "-",
        issue: e.message || "Failed to initiate order edit session.",
      }));
      return cors(
        Response.json(
          {
            success: false,
            hasErrors: true,
            errors: errs,
            errorCsv: generateErrorCsv(errs),
          },
          { status: 422 },
        ),
      );
    }

    const calculatedOrderId = beginJson.data.orderEditBegin.calculatedOrder.id;

    // Step 6B: Apply each row action
    for (const act of plannedActions) {
      if (act.type === "ADD") {
        const addRes = await admin.graphql(
          `#graphql
          mutation BulkAddVariant($id: ID!, $variantId: ID!, $quantity: Int!) {
            orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity) {
              calculatedOrder { id }
              userErrors { field message }
            }
          }`,
          { variables: { id: calculatedOrderId, variantId: act.variantId, quantity: act.quantity } },
        );
        const addJson = await addRes.json();
        const errs = addJson.data?.orderEditAddVariant?.userErrors || [];
        if (errs.length > 0) {
          rowErrors.push({
            productName: act.productName,
            sku: act.sku,
            issue: errs[0].message || "Failed to add product variant.",
          });
        }
      } else if (act.type === "UPDATE_QTY") {
        const calcLineItemId = act.lineItemId!.replace("LineItem", "CalculatedLineItem");
        const setQtyRes = await admin.graphql(
          `#graphql
          mutation BulkSetQuantity($id: ID!, $lineItemId: ID!, $quantity: Int!, $restock: Boolean) {
            orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity, restock: $restock) {
              calculatedOrder { id }
              userErrors { field message }
            }
          }`,
          {
            variables: {
              id: calculatedOrderId,
              lineItemId: calcLineItemId,
              quantity: act.quantity,
              restock: true,
            },
          },
        );
        const setQtyJson = await setQtyRes.json();
        const errs = setQtyJson.data?.orderEditSetQuantity?.userErrors || [];
        if (errs.length > 0) {
          rowErrors.push({
            productName: act.productName,
            sku: act.sku,
            issue: errs[0].message || "Failed to update item quantity.",
          });
        }
      } else if (act.type === "REPLACE") {
        const calcLineItemId = act.lineItemId!.replace("LineItem", "CalculatedLineItem");
        // Remove existing item (quantity 0 with restock)
        const removeRes = await admin.graphql(
          `#graphql
          mutation BulkRemoveForReplace($id: ID!, $lineItemId: ID!, $quantity: Int!, $restock: Boolean) {
            orderEditSetQuantity(id: $id, lineItemId: $lineItemId, quantity: $quantity, restock: $restock) {
              calculatedOrder { id }
              userErrors { field message }
            }
          }`,
          {
            variables: {
              id: calculatedOrderId,
              lineItemId: calcLineItemId,
              quantity: 0,
              restock: true,
            },
          },
        );
        const removeJson = await removeRes.json();
        const remErrs = removeJson.data?.orderEditSetQuantity?.userErrors || [];
        if (remErrs.length > 0) {
          rowErrors.push({
            productName: act.productName,
            sku: act.sku,
            issue: remErrs[0].message || "Failed to remove original item for replacement.",
          });
          continue;
        }

        // Add new replacement variant
        const repAddRes = await admin.graphql(
          `#graphql
          mutation BulkAddReplacement($id: ID!, $variantId: ID!, $quantity: Int!) {
            orderEditAddVariant(id: $id, variantId: $variantId, quantity: $quantity) {
              calculatedOrder { id }
              userErrors { field message }
            }
          }`,
          { variables: { id: calculatedOrderId, variantId: act.newVariantId, quantity: act.quantity } },
        );
        const repAddJson = await repAddRes.json();
        const repErrs = repAddJson.data?.orderEditAddVariant?.userErrors || [];
        if (repErrs.length > 0) {
          rowErrors.push({
            productName: act.productName,
            sku: act.replaceWithSku || act.sku,
            issue: repErrs[0].message || "Failed to add replacement product variant.",
          });
        }
      }
    }

    // If any row mutation produced errors, do NOT commit — abort and return errors.csv
    if (rowErrors.length > 0) {
      return cors(
        Response.json(
          {
            success: false,
            hasErrors: true,
            errors: rowErrors,
            errorCsv: generateErrorCsv(rowErrors),
          },
          { status: 422 },
        ),
      );
    }

    // Step 6C: Revalidate any active Buy X Get Y discounts
    try {
      await checkAndRemoveInvalidBxgyDiscounts(admin, calculatedOrderId);
    } catch (bxgyErr) {
      console.warn("[bulk-update] BXGY discount check warning:", bxgyErr);
    }

    // Step 6D: Commit the single transaction
    const commitRes = await admin.graphql(
      `#graphql
      mutation BulkOrderEditCommit($id: ID!) {
        orderEditCommit(id: $id, notifyCustomer: true, staffNote: "Bulk update via CSV upload") {
          order {
            id
            name
            statusPageUrl
            totalOutstandingSet {
              presentmentMoney { amount currencyCode }
              shopMoney { amount currencyCode }
            }
          }
          userErrors { field message }
        }
      }`,
      { variables: { id: calculatedOrderId } },
    );
    const commitJson = await commitRes.json();
    const commitErrors = commitJson.data?.orderEditCommit?.userErrors || [];
    if (commitErrors.length > 0) {
      const errs: RowError[] = commitErrors.map((e: any) => ({
        productName: "Order Commit",
        sku: "-",
        issue: e.message || "Failed to commit order edit changes.",
      }));
      return cors(
        Response.json(
          {
            success: false,
            hasErrors: true,
            errors: errs,
            errorCsv: generateErrorCsv(errs),
          },
          { status: 422 },
        ),
      );
    }

    const updatedOrder = commitJson.data.orderEditCommit.order;
    const balanceDue =
      updatedOrder?.totalOutstandingSet?.presentmentMoney ??
      updatedOrder?.totalOutstandingSet?.shopMoney ??
      null;

    const owesRefund = balanceDue ? parseFloat(balanceDue.amount) < 0 : false;
    const hasBalanceDue = balanceDue ? parseFloat(balanceDue.amount) > 0 : false;

    if (hasBalanceDue) {
      await applyPaymentPendingHold(admin, orderId);
    } else {
      await addOrderTags(admin, orderId, owesRefund, ["Bulk-Updated"]);
    }

    // Track analytics
    await trackOrderEdit({
      shop: storeDomain,
      orderId,
      featureId: "bulk-update",
      source: source || "customer_account_ui",
    });

    return cors(
      Response.json({
        success: true,
        hasErrors: false,
        order: updatedOrder,
        balanceDue,
        summary: {
          totalRows: parsedRows.length,
          actionsApplied: plannedActions.length,
          added: plannedActions.filter((a) => a.type === "ADD").length,
          updated: plannedActions.filter((a) => a.type === "UPDATE_QTY").length,
          replaced: plannedActions.filter((a) => a.type === "REPLACE").length,
        },
      }),
    );
  } catch (err: unknown) {
    console.error("[bulk-update] Server exception:", err);
    const issue = err instanceof Error ? err.message : "Internal server error occurred.";
    const errs: RowError[] = [{ productName: "-", sku: "-", issue }];
    return cors(
      Response.json(
        {
          success: false,
          hasErrors: true,
          errors: errs,
          errorCsv: generateErrorCsv(errs),
        },
        { status: 500 },
      ),
    );
  }
}
