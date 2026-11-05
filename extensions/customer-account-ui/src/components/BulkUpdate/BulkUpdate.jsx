import { useState } from 'preact/hooks';
import { bulkUpdateOrder, getSampleCsvUrl } from '../../utils/api.js';
import { useOrderEdit } from '../../context/OrderEditContext.jsx';
import { BulkUpdateUI } from './BulkUpdateUI.jsx';

/**
 * Escapes CSV text value.
 */
function escapeCsv(val) {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Shortens error issue messages to fit cleanly within one line.
 */
function shortenIssue(issue) {
  if (!issue) return 'Update failed';
  const str = String(issue).trim();

  if (str.includes('not found in store catalog')) {
    return str.includes('Replacement') ? 'Replacement SKU not found' : 'SKU not found in catalog';
  }
  if (str.includes('does not exist in this order')) {
    return 'SKU not in current order';
  }
  if (str.includes('Insufficient stock')) {
    const match = str.match(/Available:\s*(\d+)/i);
    return match ? `Insufficient stock (${match[1]} available)` : 'Insufficient stock';
  }
  if (str.includes('additional unit') && str.includes('available')) {
    const match = str.match(/Only\s*(\d+)/i);
    return match ? `Only ${match[1]} more in stock` : 'Insufficient stock';
  }
  if (str.includes('quantity 0')) {
    return 'Quantity must be > 0';
  }
  if (str.includes('Replacement quantity')) {
    return 'Replacement qty must be > 0';
  }
  if (str.includes('valid non-negative number')) {
    return 'Invalid quantity';
  }
  if (str.includes('SKU is required')) {
    return 'Missing SKU';
  }
  if (str.includes('maximum allowed edits')) {
    return 'Max edits reached';
  }
  if (str.includes('Order not found')) {
    return 'Order not found';
  }

  return str.replace(/SKU\s*['"][^'"]+['"]\s*/gi, '').replace(/\.$/, '').trim();
}

/**
 * Parses CSV text into array of objects with keys: productName, sku, replaceWithSku, quantity
 */
function parseCsv(rawCsv) {
  if (!rawCsv || typeof rawCsv !== 'string') return [];
  const cleanCsv = rawCsv.replace(/^\uFEFF/, '').trim();
  const lines = cleanCsv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 2) return [];

  const parseLine = (line) => {
    const result = [];
    let cur = '';
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
      } else if (char === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else {
        cur += char;
      }
    }
    result.push(cur.trim());
    return result;
  };

  const rawHeaders = parseLine(lines[0]);
  const headers = rawHeaders.map((h) =>
    h.toLowerCase().replace(/[^a-z0-9]/g, ''),
  );

  let replaceSkuIdx = headers.findIndex((h) => h.includes('replace'));
  let skuIdx = headers.findIndex(
    (h) => h === 'sku' || (h.includes('sku') && !h.includes('replace')),
  );
  let productNameIdx = headers.findIndex(
    (h) =>
      (h.includes('product') || h.includes('title') || h.includes('name')) &&
      !h.includes('sku'),
  );
  let quantityIdx = headers.findIndex(
    (h) => h.includes('quantity') || h.includes('qty') || h === 'count',
  );

  // Defaults if column names were missing:
  // Col 0: Product name, Col 1: SKU, Col 2: Replace with SKU, Col 3: Quantity
  if (productNameIdx === -1) productNameIdx = 0;
  if (skuIdx === -1 && headers.length >= 2) skuIdx = 1;
  if (replaceSkuIdx === -1 && headers.length >= 3) replaceSkuIdx = 2;
  if (quantityIdx === -1 && headers.length >= 4) quantityIdx = 3;

  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const parts = parseLine(lines[i]);
    if (parts.length === 0 || parts.every((p) => p === '')) continue;

    const productName =
      productNameIdx !== -1 && parts[productNameIdx]
        ? parts[productNameIdx].replace(/^["']|["']$/g, '').trim()
        : '';
    const sku =
      skuIdx !== -1 && parts[skuIdx]
        ? parts[skuIdx].replace(/^["']|["']$/g, '').trim()
        : '';
    const replaceWithSku =
      replaceSkuIdx !== -1 && parts[replaceSkuIdx]
        ? parts[replaceSkuIdx].replace(/^["']|["']$/g, '').trim()
        : '';
    const rawQty =
      quantityIdx !== -1 && parts[quantityIdx]
        ? parts[quantityIdx].replace(/[^0-9-]/g, '').trim()
        : '1';
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

export function BulkUpdate({ orderId: propOrderId }) {
  const currentOrderId = propOrderId || shopify?.order?.value?.id;
  const { notifyUpdateSuccess } = useOrderEdit
    ? useOrderEdit()
    : { notifyUpdateSuccess: () => {} };

  const [mode, setMode] = useState('ui'); // 'ui' | 'csv'
  const [fileName, setFileName] = useState('');
  const [rawCsv, setRawCsv] = useState('');
  const [parsedRows, setParsedRows] = useState([]);
  const [showPasteBox, setShowPasteBox] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [generalError, setGeneralError] = useState(null);
  const [errorsList, setErrorsList] = useState([]);
  const [successInfo, setSuccessInfo] = useState(null);

  // Sample CSV template content
  const SAMPLE_CSV = `Product name,sku,replace with sku,quantity\nClassic Cotton T-Shirt,TSHIRT-BLK-M,,2\nDenim Jacket,JKT-BLU-L,JKT-BLU-XL,1\nRunning Shoes,SHOE-WHT-10,,3\nBaseball Cap,CAP-RED-OS,CAP-BLK-OS,1\n`;

  const handleDownloadSample = () => {
    try {
      const url = getSampleCsvUrl();
      const newTab = window.open(url, '_blank');
      if (!newTab || newTab.closed || typeof newTab.closed === 'undefined') {
        const encodedUri = encodeURI(`data:text/csv;charset=utf-8,${SAMPLE_CSV}`);
        window.open(encodedUri, '_blank');
      }
    } catch (err) {
      const encodedUri = encodeURI(`data:text/csv;charset=utf-8,${SAMPLE_CSV}`);
      window.open(encodedUri, '_blank');
    }
  };

  const handleFileChange = (e) => {
    const files = e?.target?.files || e?.currentTarget?.files || e?.detail?.files;
    const file = files?.[0];
    if (!file) return;

    setFileName(file.name || 'uploaded.csv');
    setGeneralError(null);
    setErrorsList([]);
    setSuccessInfo(null);
    setIsSubmitted(false);

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result;
      if (typeof text === 'string') {
        setRawCsv(text);
        const rows = parseCsv(text);
        setParsedRows(rows);
        if (rows.length === 0) {
          setGeneralError('No valid rows found in the CSV. Please check the file formatting.');
        }
      }
    };
    reader.onerror = () => {
      setGeneralError('Failed to read the selected CSV file.');
    };
    reader.readAsText(file);
  };

  const handlePasteChange = (e) => {
    const text = e.target.value;
    setRawCsv(text);
    setGeneralError(null);
    setErrorsList([]);
    setSuccessInfo(null);
    setIsSubmitted(false);

    if (text.trim().length > 0) {
      const rows = parseCsv(text);
      setParsedRows(rows);
      if (rows.length === 0) {
        setGeneralError('No valid rows detected. Headers must include: Product name, sku, replace with sku, quantity');
      }
    } else {
      setParsedRows([]);
    }
  };

  const handleClear = () => {
    setFileName('');
    setRawCsv('');
    setParsedRows([]);
    setGeneralError(null);
    setErrorsList([]);
    setSuccessInfo(null);
    setIsSubmitted(false);
  };

  const handleApply = async () => {
    if (!currentOrderId) {
      setGeneralError('Order ID is missing.');
      return;
    }

    if (parsedRows.length === 0) {
      setGeneralError('Please upload or paste a CSV with at least one update row.');
      return;
    }

    setSubmitting(true);
    setGeneralError(null);
    setErrorsList([]);
    setSuccessInfo(null);

    try {
      const result = await bulkUpdateOrder({
        orderId: currentOrderId,
        rows: parsedRows,
        rawCsv,
        source: 'customer_account_ui',
      });

      if (!result.success || result.hasErrors) {
        setErrorsList(result.errors || []);
        setGeneralError('Some items in the CSV could not be processed. Review the issues below:');
      } else {
        setIsSubmitted(true);
        setSuccessInfo(result.summary || { actionsApplied: parsedRows.length });
        if (typeof notifyUpdateSuccess === 'function') {
          notifyUpdateSuccess(result.order?.statusPageUrl);
        }
      }
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : 'Bulk update request failed.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <s-stack direction="block" gap="large" inlineSize="100%">
      {/* ── Mode Selection Header ── */}
      <s-box background="subdued" padding="base" borderRadius="base" borderWidth="base">
        <s-stack direction="block" gap="base">
          <s-stack direction="block" gap="small-100">
            <s-text type="strong" size="medium">Bulk Update Order Items</s-text>
            <s-text size="base" color="subdued">
              Choose how you want to update items: interactively from the visual interface or by uploading a spreadsheet (.CSV).
            </s-text>
          </s-stack>

          <s-stack direction="inline" gap="small-200">
            <s-button
              variant={mode === 'ui' ? 'primary' : 'secondary'}
              onClick={() => setMode('ui')}
            >
              Update from UI
            </s-button>
            <s-button
              variant={mode === 'csv' ? 'primary' : 'secondary'}
              onClick={() => setMode('csv')}
            >
              Update using .CSV
            </s-button>
          </s-stack>
        </s-stack>
      </s-box>

      {mode === 'ui' ? (
        <BulkUpdateUI orderId={currentOrderId} />
      ) : (
        <s-stack direction="block" gap="large" inlineSize="100%">
          {/* ── Intro Box ── */}
          <s-box background="subdued" padding="base" borderRadius="base" borderWidth="base">
            <s-stack direction="block" gap="small-200">
              <s-text type="strong" size="medium">Bulk Order Updates via .CSV</s-text>
              <s-text size="base" color="subdued">
                Perform all your order line item changes at once: add new items, update existing quantities, change variants, or replace products using a single CSV file.
              </s-text>
            </s-stack>
          </s-box>

      {/* ── Format & Sample Download Card ── */}
      <s-box background="transparent" padding="base" borderRadius="base" borderWidth="base">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" justifyContent="space-between" alignItems="center">
            <s-stack direction="block" gap="small-100">
              <s-text type="strong">CSV Format & Template</s-text>
              <s-text size="small" color="subdued">
                Download the example .csv format with the required headers:
              </s-text>
              <s-text size="small" type="strong" color="subdued">
                Product name, sku, replace with sku, quantity
              </s-text>
            </s-stack>

            <s-button variant="secondary" onClick={handleDownloadSample}>
              Download Sample .CSV
            </s-button>
          </s-stack>

          <s-divider />

          {/* Business rules guidance (Clean Shopify web components without raw HTML tags) */}
          <s-stack direction="block" gap="small-200">
            <s-text size="small" type="strong">How it works:</s-text>

            <s-stack direction="block" gap="small-200">
              <s-box background="subdued" padding="small-200" borderRadius="base">
                <s-stack direction="block" gap="small-100">
                  <s-stack direction="inline" gap="small-200" alignItems="center">
                    <s-badge tone="info">Step 1: Add</s-badge>
                    <s-text size="small" type="strong">Add a new product</s-text>
                  </s-stack>
                  <s-text size="small" color="subdued">
                    Enter the new item's SKU and quantity. Leave "replace with sku" blank.
                  </s-text>
                </s-stack>
              </s-box>

              <s-box background="subdued" padding="small-200" borderRadius="base">
                <s-stack direction="block" gap="small-100">
                  <s-stack direction="inline" gap="small-200" alignItems="center">
                    <s-badge tone="info">Step 2: Quantity</s-badge>
                    <s-text size="small" type="strong">Update item quantity</s-text>
                  </s-stack>
                  <s-text size="small" color="subdued">
                    Enter the existing order item's SKU and new quantity (enter 0 to remove item). Leave "replace with sku" blank.
                  </s-text>
                </s-stack>
              </s-box>

              <s-box background="subdued" padding="small-200" borderRadius="base">
                <s-stack direction="block" gap="small-100">
                  <s-stack direction="inline" gap="small-200" alignItems="center">
                    <s-badge tone="warning">Step 3: Replace</s-badge>
                    <s-text size="small" type="strong">Change variant or replace product</s-text>
                  </s-stack>
                  <s-text size="small" color="subdued">
                    Enter the existing item's SKU, the new item's SKU in "replace with sku", and the desired quantity.
                  </s-text>
                </s-stack>
              </s-box>
            </s-stack>
          </s-stack>
        </s-stack>
      </s-box>

      {/* ── Upload & Paste Card ── */}
      <s-box background="transparent" padding="base" borderRadius="base" borderWidth="base">
        <s-stack direction="block" gap="base">
          <s-stack direction="block" gap="small-100">
            <s-text type="strong">Upload your completed .CSV</s-text>
            <s-text size="small" color="subdued">
              Select or drop your spreadsheet (.csv), or paste CSV rows directly.
            </s-text>
          </s-stack>

          <s-drop-zone
            accept=".csv,text/csv,text/plain"
            label="Drop your .CSV file here or click to browse"
            onChange={handleFileChange}
            onInput={handleFileChange}
            disabled={submitting || isSubmitted}
          />

          <s-stack direction="inline" gap="base" alignItems="center">
            <s-button
              variant="tertiary"
              onClick={() => setShowPasteBox(!showPasteBox)}
            >
              {showPasteBox ? 'Hide CSV Text Area' : 'Or Paste CSV Text Directly'}
            </s-button>

            {(fileName || rawCsv) && (
              <s-button variant="secondary" onClick={handleClear} disabled={submitting}>
                Clear
              </s-button>
            )}
          </s-stack>

          {fileName && (
            <s-box background="subdued" padding="small-200" borderRadius="base">
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-icon type="order" size="small" />
                <s-text type="strong">Loaded File:</s-text>
                <s-text>{fileName}</s-text>
              </s-stack>
            </s-box>
          )}

          {showPasteBox && (
            <s-stack direction="block" gap="small-200">
              <s-text size="small" color="subdued">
                Paste your CSV content with headers (Product name, sku, replace with sku, quantity):
              </s-text>
              <s-text-field
                multiline
                rows={5}
                value={rawCsv}
                placeholder={`Product name,sku,replace with sku,quantity\nClassic Cotton T-Shirt,TSHIRT-BLK-M,,2\nDenim Jacket,JKT-BLU-L,JKT-BLU-XL,1`}
                onInput={handlePasteChange}
                disabled={submitting || isSubmitted}
              />
            </s-stack>
          )}
        </s-stack>
      </s-box>

      {/* ── Parsed Rows Preview ── */}
      {parsedRows.length > 0 && (
        <s-box background="subdued" padding="base" borderRadius="base" borderWidth="base">
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" justifyContent="space-between" alignItems="center">
              <s-text type="strong">
                Detected Rows ({parsedRows.length} item{parsedRows.length !== 1 ? 's' : ''})
              </s-text>
              <s-text size="small" color="subdued">
                Review below before applying changes
              </s-text>
            </s-stack>

            <s-stack direction="block" gap="small-200">
              {parsedRows.map((r, i) => {
                const isReplace = Boolean(r.replaceWithSku && r.replaceWithSku.trim().length > 0);
                const isZero = r.quantity === 0;

                return (
                  <s-box
                    key={i}
                    background="surface"
                    padding="small-200"
                    borderRadius="base"
                    borderWidth="base"
                  >
                    <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                      <s-stack direction="block" gap="small-100">
                        <s-text type="strong">{r.productName || `Item #${i + 1}`}</s-text>
                        <s-stack direction="inline" gap="small-200" alignItems="center">
                          <s-stack direction="inline" gap="small-100" alignItems="center">
                            <s-text size="small" color="subdued">SKU:</s-text>
                            {r.sku ? (
                              <s-text size="small" type="strong">{r.sku}</s-text>
                            ) : (
                              <s-text size="small" tone="critical" type="strong">(Missing SKU)</s-text>
                            )}
                          </s-stack>
                          {isReplace && (
                            <s-stack direction="inline" gap="small-100" alignItems="center">
                              <s-text size="small" color="subdued">➔ Replace with:</s-text>
                              <s-text size="small" type="strong">{r.replaceWithSku}</s-text>
                            </s-stack>
                          )}
                        </s-stack>
                      </s-stack>

                      <s-stack direction="inline" gap="small-200" alignItems="center">
                        <s-badge tone={isReplace ? 'warning' : isZero ? 'critical' : 'info'}>
                          {isReplace ? 'Replace' : isZero ? 'Remove' : 'Qty: ' + r.quantity}
                        </s-badge>
                      </s-stack>
                    </s-stack>
                  </s-box>
                );
              })}
            </s-stack>
          </s-stack>
        </s-box>
      )}

      {/* ── Success Banner ── */}
      {successInfo && (
        <s-banner tone="success" title="Order Updated Successfully!">
          <s-stack direction="block" gap="small-200">
            <s-text type="strong">
              A new invoice has been sent to you with the latest updates.
            </s-text>
            <s-text size="small" color="subdued">
              Applied {successInfo.actionsApplied ?? 0} line item change{successInfo.actionsApplied !== 1 ? 's' : ''}. The page will refresh shortly to reflect your new order totals.
            </s-text>
          </s-stack>
        </s-banner>
      )}

      {/* ── Inline Row Errors Display (Direct on Screen, Single Line Per Row, No Download Buttons) ── */}
      {errorsList.length > 0 && (
        <s-banner tone="critical" title="Some items could not be processed">
          <s-stack direction="block" gap="small-200">
            <s-text size="small">
              Please fix the following {errorsList.length} row issue{errorsList.length !== 1 ? 's' : ''} in your CSV:
            </s-text>
            <s-stack direction="block" gap="small-100">
              {errorsList.map((err, idx) => (
                <s-box key={idx} background="surface" padding="small-200" borderRadius="base">
                  <s-stack direction="inline" alignItems="center" gap="small-200">
                    <s-badge tone="critical">Error</s-badge>
                    <s-text size="small" type="strong">{err.productName || 'Product'}</s-text>
                    <s-text size="small" color="subdued">({err.sku || 'No SKU'}):</s-text>
                    <s-text size="small" tone="critical">{shortenIssue(err.issue)}</s-text>
                  </s-stack>
                </s-box>
              ))}
            </s-stack>
          </s-stack>
        </s-banner>
      )}

      {generalError && errorsList.length === 0 && (
        <s-banner tone="critical" title="Bulk Update Error">
          <s-text>{generalError}</s-text>
        </s-banner>
      )}

      {/* ── Submit Action ── */}
      <s-stack direction="inline" justifyContent="end" gap="base">
        <s-button
          variant="primary"
          loading={submitting}
          disabled={submitting || isSubmitted || parsedRows.length === 0}
          onClick={handleApply}
        >
          {submitting ? 'Applying Updates...' : isSubmitted ? 'Updates Applied' : 'Apply Bulk Updates'}
        </s-button>
      </s-stack>
        </s-stack>
      )}
    </s-stack>
  );
}
export default BulkUpdate;
