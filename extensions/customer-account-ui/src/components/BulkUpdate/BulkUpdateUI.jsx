import { useState } from 'preact/hooks';
import { bulkUpdateOrder } from '../../utils/api.js';
import { useOrderSearch } from '../../hooks/useorderSearch.js';
import { useProductSearch } from '../../hooks/useProductSearch.js';
import { formatMoney } from '../../utils/formatMoney.js';
import { useOrderEdit } from '../../context/OrderEditContext.jsx';

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

function truncate(text, maxLength = 36) {
  if (!text) return '';
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trimEnd() + '...';
}

function getVariantLabel(variant) {
  if (!variant) return '';
  const opts = (variant.selectedOptions || [])
    .filter((o) => o.value !== 'Default Title')
    .map((o) => `${o.name}: ${o.value}`)
    .join(', ');
  return opts || variant.title || '';
}

export function BulkUpdateUI({ orderId: propOrderId }) {
  const currentOrderId = propOrderId || shopify?.order?.value?.id;
  const { notifyUpdateSuccess, setIsUpdating } = useOrderEdit
    ? useOrderEdit()
    : { notifyUpdateSuccess: () => {}, setIsUpdating: () => {} };

  const { lineItems: lines, loading: loadingLines, error: linesError, refetch } = useOrderSearch(currentOrderId);

  // Staged changes state
  // qtyChanges: { [lineItemId]: newQuantity }
  const [qtyChanges, setQtyChanges] = useState({});
  // replacements: { [lineItemId]: { newVariantId, replaceWithSku, newTitle, variantTitle, quantity, price } }
  const [replacements, setReplacements] = useState({});
  // addedItems: [ { tempId, variantId, sku, title, variantTitle, quantity, price } ]
  const [addedItems, setAddedItems] = useState([]);

  // Modals / active drawers
  const [activeReplaceLineId, setActiveReplaceLineId] = useState(null);
  const [showAddSection, setShowAddSection] = useState(false);

  // Search states for "Add Product"
  const [addSearchTerm, setAddSearchTerm] = useState('');
  const [addSelectedProduct, setAddSelectedProduct] = useState(null);
  const [addSelectedVariantId, setAddSelectedVariantId] = useState(null);
  const [addQuantity, setAddQuantity] = useState(1);

  // Search states for "Replace Item"
  const [repSearchTerm, setRepSearchTerm] = useState('');
  const [repSelectedProduct, setRepSelectedProduct] = useState(null);
  const [repSelectedVariantId, setRepSelectedVariantId] = useState(null);
  const [repQuantity, setRepQuantity] = useState(1);

  // Submission states
  const [submitting, setSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [generalError, setGeneralError] = useState(null);
  const [errorsList, setErrorsList] = useState([]);
  const [successInfo, setSuccessInfo] = useState(null);

  // Hooks for product search
  const { results: addResults, loading: searchingAdd } = useProductSearch(
    addSelectedProduct ? '' : addSearchTerm,
  );
  const { results: repResults, loading: searchingRep } = useProductSearch(
    repSelectedProduct ? '' : repSearchTerm,
  );

  // Calculate total number of staged changes
  const modifiedQtyLines = (lines || []).filter(
    (l) => !replacements[l.id] && qtyChanges[l.id] !== undefined && qtyChanges[l.id] !== l.currentQuantity,
  );
  const totalStagedCount = addedItems.length + Object.keys(replacements).length + modifiedQtyLines.length;

  // ── Quantity Adjuster Handlers ──
  const handleQtyChange = (lineId, nextVal) => {
    const val = Math.max(0, parseInt(nextVal, 10) || 0);
    setQtyChanges((prev) => ({
      ...prev,
      [lineId]: val,
    }));
    setGeneralError(null);
    setErrorsList([]);
  };

  const handleIncrement = (lineId, curVal) => {
    handleQtyChange(lineId, (curVal || 1) + 1);
  };

  const handleDecrement = (lineId, curVal) => {
    handleQtyChange(lineId, Math.max(0, (curVal || 1) - 1));
  };

  const handleUndoQty = (lineId) => {
    setQtyChanges((prev) => {
      const copy = { ...prev };
      delete copy[lineId];
      return copy;
    });
  };

  // ── Replace Item Handlers ──
  const handleOpenReplace = (line) => {
    setActiveReplaceLineId(line.id);
    setRepSearchTerm('');
    setRepSelectedProduct(null);
    setRepSelectedVariantId(null);
    setRepQuantity(qtyChanges[line.id] !== undefined ? qtyChanges[line.id] : line.currentQuantity);
    setGeneralError(null);
    setErrorsList([]);
  };

  const handleSelectRepProduct = (prod) => {
    setRepSelectedProduct(prod);
    const firstAvail = prod.variants?.nodes?.find((v) => v.availableForSale) || prod.variants?.nodes?.[0];
    setRepSelectedVariantId(firstAvail?.id || null);
  };

  const handleConfirmReplace = (line) => {
    if (!repSelectedProduct || !repSelectedVariantId) return;
    const variant = repSelectedProduct.variants?.nodes?.find((v) => v.id === repSelectedVariantId);

    setReplacements((prev) => ({
      ...prev,
      [line.id]: {
        newVariantId: repSelectedVariantId,
        replaceWithSku: variant?.sku || '',
        newTitle: repSelectedProduct.title,
        variantTitle: getVariantLabel(variant),
        quantity: Math.max(1, repQuantity || 1),
        price: variant?.price,
      },
    }));

    setActiveReplaceLineId(null);
    setRepSelectedProduct(null);
    setRepSelectedVariantId(null);
    setRepSearchTerm('');
    setGeneralError(null);
    setErrorsList([]);
  };

  const handleUndoReplace = (lineId) => {
    setReplacements((prev) => {
      const copy = { ...prev };
      delete copy[lineId];
      return copy;
    });
  };

  // ── Add Product Handlers ──
  const handleSelectAddProduct = (prod) => {
    setAddSelectedProduct(prod);
    const firstAvail = prod.variants?.nodes?.find((v) => v.availableForSale) || prod.variants?.nodes?.[0];
    setAddSelectedVariantId(firstAvail?.id || null);
    setAddQuantity(1);
  };

  const handleConfirmAdd = () => {
    if (!addSelectedProduct || !addSelectedVariantId) return;
    const variant = addSelectedProduct.variants?.nodes?.find((v) => v.id === addSelectedVariantId);

    const newItem = {
      tempId: 'new_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      variantId: addSelectedVariantId,
      sku: variant?.sku || '',
      title: addSelectedProduct.title,
      variantTitle: getVariantLabel(variant),
      quantity: Math.max(1, addQuantity || 1),
      price: variant?.price,
    };

    setAddedItems((prev) => [...prev, newItem]);
    setAddSelectedProduct(null);
    setAddSelectedVariantId(null);
    setAddSearchTerm('');
    setShowAddSection(false);
    setGeneralError(null);
    setErrorsList([]);
  };

  const handleRemoveAdded = (tempId) => {
    setAddedItems((prev) => prev.filter((item) => item.tempId !== tempId));
  };

  const handleResetAll = () => {
    setQtyChanges({});
    setReplacements({});
    setAddedItems([]);
    setActiveReplaceLineId(null);
    setShowAddSection(false);
    setGeneralError(null);
    setErrorsList([]);
  };

  // ── Apply Bulk Updates (Single Mutation Transaction) ──
  const handleApply = async () => {
    if (!currentOrderId) {
      setGeneralError('Order ID is missing.');
      return;
    }

    if (totalStagedCount === 0) {
      setGeneralError('No staged changes to apply. Please adjust a quantity, replace an item, or add a product.');
      return;
    }

    setSubmitting(true);
    if (typeof setIsUpdating === 'function') setIsUpdating(true);
    setGeneralError(null);
    setErrorsList([]);
    setSuccessInfo(null);

    const rows = [];

    // 1. Staged additions
    for (const item of addedItems) {
      rows.push({
        actionType: 'ADD',
        productName: item.title,
        sku: item.sku,
        variantId: item.variantId,
        quantity: item.quantity,
      });
    }

    // 2. Order lines updates & replacements
    for (const line of lines || []) {
      if (replacements[line.id]) {
        const rep = replacements[line.id];
        rows.push({
          actionType: 'REPLACE',
          productName: line.title,
          sku: line.sku,
          replaceWithSku: rep.replaceWithSku,
          lineItemId: line.id,
          newVariantId: rep.newVariantId,
          quantity: rep.quantity,
        });
      } else if (qtyChanges[line.id] !== undefined && qtyChanges[line.id] !== line.currentQuantity) {
        rows.push({
          actionType: 'UPDATE_QTY',
          productName: line.title,
          sku: line.sku,
          lineItemId: line.id,
          quantity: qtyChanges[line.id],
        });
      }
    }

    try {
      const result = await bulkUpdateOrder({
        orderId: currentOrderId,
        rows,
        source: 'customer_account_ui_direct',
      });

      if (!result.success || result.hasErrors) {
        setErrorsList(result.errors || []);
        if (!result.errors || result.errors.length === 0) {
          setGeneralError(result.message || 'Bulk update request failed.');
        }
      } else {
        setIsSubmitted(true);
        setSuccessInfo(result.summary || { actionsApplied: rows.length });
        if (typeof notifyUpdateSuccess === 'function') {
          notifyUpdateSuccess(result.order?.statusPageUrl);
        }
        refetch();
      }
    } catch (err) {
      setGeneralError(err instanceof Error ? err.message : 'Bulk update request failed.');
    } finally {
      setSubmitting(false);
      if (typeof setIsUpdating === 'function') setIsUpdating(false);
    }
  };

  return (
    <s-stack direction="block" gap="large" inlineSize="100%">
      {/* ── Guidance Banner ── */}
      <s-box background="subdued" padding="base" borderRadius="base" borderWidth="base">
        <s-stack direction="block" gap="small-100">
          <s-text type="strong" size="medium">Interactive Order Item Management</s-text>
          <s-text size="small" color="subdued">
            Make any combination of line item updates below: add new products, adjust ordered quantities, or swap items for catalog replacements. All staged changes are applied simultaneously in a single transaction.
          </s-text>
        </s-stack>
      </s-box>

      {/* ── Section 1: Order Line Items (Update Quantity & Replace) ── */}
      <s-box background="transparent" padding="base" borderRadius="base" borderWidth="base">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" justifyContent="space-between" alignItems="center">
            <s-stack direction="block" gap="small-100">
              <s-text type="strong">Current Order Items</s-text>
              <s-text size="small" color="subdued">
                Adjust quantities (+ / -) or choose to swap an item with another product.
              </s-text>
            </s-stack>

            {lines && lines.length > 0 && (
              <s-badge tone="info">{lines.length} Ordered Item{lines.length !== 1 ? 's' : ''}</s-badge>
            )}
          </s-stack>

          {loadingLines && (
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-stack direction="inline" gap="small-200" alignItems="center" justifyContent="center">
                <s-spinner size="small" />
                <s-text size="small" color="subdued">Loading order line items...</s-text>
              </s-stack>
            </s-box>
          )}

          {linesError && (
            <s-banner tone="critical" title="Could not load order items">
              <s-text>{linesError}</s-text>
            </s-banner>
          )}

          {!loadingLines && (!lines || lines.length === 0) && (
            <s-box padding="base" background="subdued" borderRadius="base">
              <s-text size="small" color="subdued">No active line items found in this order.</s-text>
            </s-box>
          )}

          {/* List of order items */}
          <s-stack direction="block" gap="small-200">
            {(lines || []).map((line) => {
              const rep = replacements[line.id];
              const effectiveQty = qtyChanges[line.id] !== undefined ? qtyChanges[line.id] : line.currentQuantity;
              const isQtyModified = !rep && qtyChanges[line.id] !== undefined && qtyChanges[line.id] !== line.currentQuantity;
              const isRemoved = !rep && effectiveQty === 0;
              const isBeingReplaced = activeReplaceLineId === line.id;

              return (
                <s-box
                  key={line.id}
                  background={rep ? 'subdued' : isRemoved ? 'subdued' : isQtyModified ? 'subdued' : 'surface'}
                  padding="base"
                  borderRadius="base"
                  borderWidth="base"
                >
                  <s-stack direction="block" gap="base">
                    {/* Item row header */}
                    <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                      <s-stack direction="inline" gap="base" alignItems="center">
                        {line.image?.url ? (
                          <s-box inlineSize="48px" blockSize="48px">
                            <s-image
                              src={line.image.url}
                              alt={line.title}
                              aspectRatio="1"
                              borderRadius="base"
                            />
                          </s-box>
                        ) : (
                          <s-box inlineSize="48px" blockSize="48px" background="subdued" borderRadius="base" padding="small-200">
                            <s-icon type="order" size="base" tone="neutral" />
                          </s-box>
                        )}

                        <s-stack direction="block" gap="small-100">
                          <s-text type="strong">{truncate(line.title, 38)}</s-text>
                          <s-stack direction="inline" gap="small-200" alignItems="center">
                            {line.variantTitle && line.variantTitle !== 'Default Title' && (
                              <s-text size="small" color="subdued">{line.variantTitle}</s-text>
                            )}
                            <s-badge tone="neutral">SKU: {line.sku || 'N/A'}</s-badge>
                            {line.cost?.totalAmount && (
                              <s-text size="small" color="subdued">• {formatMoney(line.cost.totalAmount)}</s-text>
                            )}
                          </s-stack>
                        </s-stack>
                      </s-stack>

                      {/* Staged status badge */}
                      {rep && (
                        <s-badge tone="warning">Staged for Replace</s-badge>
                      )}
                      {!rep && isRemoved && (
                        <s-badge tone="critical">Will be Removed</s-badge>
                      )}
                      {!rep && isQtyModified && !isRemoved && (
                        <s-badge tone="info">Qty: {line.currentQuantity} ➔ {effectiveQty}</s-badge>
                      )}
                    </s-stack>

                    {/* Staged Replacement Details Preview */}
                    {rep && (
                      <s-box background="surface" padding="small-200" borderRadius="base" borderWidth="base">
                        <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                          <s-stack direction="inline" gap="small-200" alignItems="center">
                            <s-badge tone="warning">➔ Replace with:</s-badge>
                            <s-text type="strong" size="small">{rep.newTitle}</s-text>
                            {rep.variantTitle ? (
                              <s-text size="small" color="subdued">({rep.variantTitle})</s-text>
                            ) : null}
                            {rep.replaceWithSku ? (
                              <s-badge tone="neutral">SKU: {rep.replaceWithSku}</s-badge>
                            ) : null}
                            <s-text size="small" type="strong">x {rep.quantity}</s-text>
                          </s-stack>

                          <s-button variant="tertiary" onClick={() => handleUndoReplace(line.id)}>
                            Undo
                          </s-button>
                        </s-stack>
                      </s-box>
                    )}

                    {/* Quantity Stepper & Replace Button (when not replaced) */}
                    {!rep && !isBeingReplaced && (
                      <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                        {/* Stepper */}
                        <s-stack direction="inline" gap="small-200" alignItems="center">
                          <s-text size="small" color="subdued">Quantity:</s-text>
                          <s-stack direction="inline" gap="small-100" alignItems="center">
                            <s-button
                              variant="secondary"
                              onClick={() => handleDecrement(line.id, effectiveQty)}
                              disabled={effectiveQty <= 0 || submitting || isSubmitted}
                            >
                              -
                            </s-button>
                            <s-box padding="small-200" background="subdued" borderRadius="base" minInlineSize="36px">
                              <s-text type="strong" alignment="center">{effectiveQty}</s-text>
                            </s-box>
                            <s-button
                              variant="secondary"
                              onClick={() => handleIncrement(line.id, effectiveQty)}
                              disabled={submitting || isSubmitted}
                            >
                              +
                            </s-button>
                          </s-stack>

                          {isQtyModified && (
                            <s-button variant="tertiary" onClick={() => handleUndoQty(line.id)}>
                              Reset Qty
                            </s-button>
                          )}
                        </s-stack>

                        {/* Replace action */}
                        <s-button
                          variant="secondary"
                          disabled={submitting || isSubmitted}
                          onClick={() => handleOpenReplace(line)}
                        >
                          Swap / Replace Item
                        </s-button>
                      </s-stack>
                    )}

                    {/* Inline Replacement Picker */}
                    {isBeingReplaced && (
                      <s-box background="subdued" padding="base" borderRadius="base">
                        <s-stack direction="block" gap="base">
                          <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                            <s-text type="strong">Search Catalog for Replacement</s-text>
                            <s-button variant="tertiary" onClick={() => setActiveReplaceLineId(null)}>
                              Cancel
                            </s-button>
                          </s-stack>

                          {!repSelectedProduct ? (
                            <s-stack direction="block" gap="small-200">
                              <s-text-field
                                placeholder="Type product name to search store catalog..."
                                value={repSearchTerm}
                                onInput={(e) => setRepSearchTerm(e.target.value)}
                              />

                              {searchingRep && (
                                <s-stack direction="inline" gap="small-200" alignItems="center">
                                  <s-spinner size="small" />
                                  <s-text size="small" color="subdued">Searching catalog...</s-text>
                                </s-stack>
                              )}

                              {repResults.length > 0 && (
                                <s-scroll-box maxBlockSize="180px">
                                  <s-stack direction="block" gap="small-100">
                                    {repResults.map((p) => (
                                      <s-box key={p.id} background="surface" padding="small-200" borderRadius="base">
                                        <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                                          <s-stack direction="inline" gap="small-200" alignItems="center">
                                            {p.featuredImage?.url && (
                                              <s-box inlineSize="32px" blockSize="32px">
                                                <s-image src={p.featuredImage.url} alt={p.title} aspectRatio="1" />
                                              </s-box>
                                            )}
                                            <s-text type="strong" size="small">{p.title}</s-text>
                                          </s-stack>
                                          <s-button variant="secondary" onClick={() => handleSelectRepProduct(p)}>
                                            Select
                                          </s-button>
                                        </s-stack>
                                      </s-box>
                                    ))}
                                  </s-stack>
                                </s-scroll-box>
                              )}
                            </s-stack>
                          ) : (
                            /* Product selected -> Choose variant & quantity */
                            <s-stack direction="block" gap="small-200">
                              <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                                <s-stack direction="inline" gap="small-200" alignItems="center">
                                  <s-text type="strong">Selected:</s-text>
                                  <s-text>{repSelectedProduct.title}</s-text>
                                </s-stack>
                                <s-button variant="tertiary" onClick={() => setRepSelectedProduct(null)}>
                                  Change Product
                                </s-button>
                              </s-stack>

                              {/* Variants */}
                              {repSelectedProduct.variants?.nodes?.length > 1 && (
                                <s-stack direction="block" gap="small-100">
                                  <s-text size="small" type="strong">Select Option / Variant:</s-text>
                                  <s-stack direction="inline" gap="small-100" wrap>
                                    {repSelectedProduct.variants.nodes.map((v) => {
                                      const isChosen = v.id === repSelectedVariantId;
                                      return (
                                        <s-button
                                          key={v.id}
                                          variant={isChosen ? 'primary' : 'secondary'}
                                          onClick={() => setRepSelectedVariantId(v.id)}
                                          disabled={!v.availableForSale}
                                        >
                                          {getVariantLabel(v) || v.title} {!v.availableForSale ? '(Out)' : ''}
                                        </s-button>
                                      );
                                    })}
                                  </s-stack>
                                </s-stack>
                              )}

                              {/* Replacement Quantity */}
                              <s-stack direction="inline" gap="base" alignItems="center">
                                <s-text size="small" type="strong">Replacement Quantity:</s-text>
                                <s-stack direction="inline" gap="small-100" alignItems="center">
                                  <s-button
                                    variant="secondary"
                                    onClick={() => setRepQuantity(Math.max(1, repQuantity - 1))}
                                  >
                                    -
                                  </s-button>
                                  <s-box padding="small-200" background="surface" borderRadius="base" minInlineSize="32px">
                                    <s-text type="strong" alignment="center">{repQuantity}</s-text>
                                  </s-box>
                                  <s-button
                                    variant="secondary"
                                    onClick={() => setRepQuantity(repQuantity + 1)}
                                  >
                                    +
                                  </s-button>
                                </s-stack>
                              </s-stack>

                              <s-stack direction="inline" justifyContent="end" gap="small-200">
                                <s-button variant="secondary" onClick={() => setActiveReplaceLineId(null)}>
                                  Cancel
                                </s-button>
                                <s-button variant="primary" onClick={() => handleConfirmReplace(line)}>
                                  Stage Replacement
                                </s-button>
                              </s-stack>
                            </s-stack>
                          )}
                        </s-stack>
                      </s-box>
                    )}
                  </s-stack>
                </s-box>
              );
            })}
          </s-stack>
        </s-stack>
      </s-box>

      {/* ── Section 2: Add New Product ── */}
      <s-box background="transparent" padding="base" borderRadius="base" borderWidth="base">
        <s-stack direction="block" gap="base">
          <s-stack direction="inline" justifyContent="space-between" alignItems="center">
            <s-stack direction="block" gap="small-100">
              <s-text type="strong">Add Additional Products</s-text>
              <s-text size="small" color="subdued">
                Search the catalog to add extra products or gifts to this order.
              </s-text>
            </s-stack>

            <s-button
              variant={showAddSection ? 'secondary' : 'primary'}
              onClick={() => setShowAddSection(!showAddSection)}
              disabled={submitting || isSubmitted}
            >
              {showAddSection ? 'Close Product Search' : '+ Add New Product'}
            </s-button>
          </s-stack>

          {showAddSection && (
            <s-box background="subdued" padding="base" borderRadius="base">
              <s-stack direction="block" gap="base">
                {!addSelectedProduct ? (
                  <s-stack direction="block" gap="small-200">
                    <s-text-field
                      placeholder="Search store catalog by product title..."
                      value={addSearchTerm}
                      onInput={(e) => setAddSearchTerm(e.target.value)}
                    />

                    {searchingAdd && (
                      <s-stack direction="inline" gap="small-200" alignItems="center">
                        <s-spinner size="small" />
                        <s-text size="small" color="subdued">Searching products...</s-text>
                      </s-stack>
                    )}

                    {addResults.length > 0 && (
                      <s-scroll-box maxBlockSize="220px">
                        <s-stack direction="block" gap="small-100">
                          {addResults.map((p) => {
                            const firstPrice = p.variants?.nodes?.[0]?.price;
                            return (
                              <s-box key={p.id} background="surface" padding="small-200" borderRadius="base">
                                <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                                  <s-stack direction="inline" gap="small-200" alignItems="center">
                                    {p.featuredImage?.url && (
                                      <s-box inlineSize="36px" blockSize="36px">
                                        <s-image src={p.featuredImage.url} alt={p.title} aspectRatio="1" />
                                      </s-box>
                                    )}
                                    <s-stack direction="block" gap="none">
                                      <s-text type="strong" size="small">{p.title}</s-text>
                                      {firstPrice && (
                                        <s-text size="small" color="subdued">{formatMoney(firstPrice)}</s-text>
                                      )}
                                    </s-stack>
                                  </s-stack>

                                  <s-button variant="secondary" onClick={() => handleSelectAddProduct(p)}>
                                    Configure & Add
                                  </s-button>
                                </s-stack>
                              </s-box>
                            );
                          })}
                        </s-stack>
                      </s-scroll-box>
                    )}
                  </s-stack>
                ) : (
                  /* Pick variant and quantity to add */
                  <s-stack direction="block" gap="base">
                    <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                      <s-stack direction="block" gap="none">
                        <s-text type="strong">{addSelectedProduct.title}</s-text>
                        <s-text size="small" color="subdued">Choose variant and quantity</s-text>
                      </s-stack>
                      <s-button variant="tertiary" onClick={() => setAddSelectedProduct(null)}>
                        Back to Search
                      </s-button>
                    </s-stack>

                    {/* Variant picker */}
                    {addSelectedProduct.variants?.nodes?.length > 1 && (
                      <s-stack direction="block" gap="small-100">
                        <s-text size="small" type="strong">Select Option / Variant:</s-text>
                        <s-stack direction="inline" gap="small-100" wrap>
                          {addSelectedProduct.variants.nodes.map((v) => {
                            const isChosen = v.id === addSelectedVariantId;
                            return (
                              <s-button
                                key={v.id}
                                variant={isChosen ? 'primary' : 'secondary'}
                                onClick={() => setAddSelectedVariantId(v.id)}
                                disabled={!v.availableForSale}
                              >
                                {getVariantLabel(v) || v.title} {!v.availableForSale ? '(Out of stock)' : ''}
                              </s-button>
                            );
                          })}
                        </s-stack>
                      </s-stack>
                    )}

                    {/* Add quantity counter */}
                    <s-stack direction="inline" gap="base" alignItems="center">
                      <s-text size="small" type="strong">Quantity:</s-text>
                      <s-stack direction="inline" gap="small-100" alignItems="center">
                        <s-button
                          variant="secondary"
                          onClick={() => setAddQuantity(Math.max(1, addQuantity - 1))}
                        >
                          -
                        </s-button>
                        <s-box padding="small-200" background="surface" borderRadius="base" minInlineSize="32px">
                          <s-text type="strong" alignment="center">{addQuantity}</s-text>
                        </s-box>
                        <s-button
                          variant="secondary"
                          onClick={() => setAddQuantity(addQuantity + 1)}
                        >
                          +
                        </s-button>
                      </s-stack>
                    </s-stack>

                    <s-stack direction="inline" justifyContent="end" gap="small-200">
                      <s-button variant="secondary" onClick={() => setAddSelectedProduct(null)}>
                        Cancel
                      </s-button>
                      <s-button variant="primary" onClick={handleConfirmAdd}>
                        + Add to Staged Updates
                      </s-button>
                    </s-stack>
                  </s-stack>
                )}
              </s-stack>
            </s-box>
          )}
        </s-stack>
      </s-box>

      {/* ── Section 3: Staged Changes Review Card ── */}
      {totalStagedCount > 0 && (
        <s-box background="subdued" padding="base" borderRadius="base" borderWidth="base">
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" justifyContent="space-between" alignItems="center">
              <s-stack direction="block" gap="small-100">
                <s-text type="strong">
                  Staged Bulk Updates ({totalStagedCount} item{totalStagedCount !== 1 ? 's' : ''})
                </s-text>
                <s-text size="small" color="subdued">
                  Review all planned additions, quantity updates, and item replacements before applying.
                </s-text>
              </s-stack>

              <s-button variant="tertiary" onClick={handleResetAll} disabled={submitting || isSubmitted}>
                Reset All
              </s-button>
            </s-stack>

            <s-stack direction="block" gap="small-200">
              {/* Added products */}
              {addedItems.map((item) => (
                <s-box key={item.tempId} background="surface" padding="small-200" borderRadius="base" borderWidth="base">
                  <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                    <s-stack direction="inline" gap="small-200" alignItems="center">
                      <s-badge tone="success">+ Add Product</s-badge>
                      <s-text type="strong" size="small">{item.title}</s-text>
                      {item.variantTitle && (
                        <s-text size="small" color="subdued">({item.variantTitle})</s-text>
                      )}
                      <s-badge tone="neutral">Qty: {item.quantity}</s-badge>
                    </s-stack>

                    <s-button variant="tertiary" onClick={() => handleRemoveAdded(item.tempId)}>
                      Undo
                    </s-button>
                  </s-stack>
                </s-box>
              ))}

              {/* Replacements */}
              {Object.keys(replacements).map((lineId) => {
                const rep = replacements[lineId];
                const originalLine = (lines || []).find((l) => l.id === lineId);
                return (
                  <s-box key={lineId} background="surface" padding="small-200" borderRadius="base" borderWidth="base">
                    <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                      <s-stack direction="inline" gap="small-200" alignItems="center">
                        <s-badge tone="warning">➔ Replace Item</s-badge>
                        <s-text size="small" color="subdued">{originalLine?.title || 'Original Item'}</s-text>
                        <s-text size="small" type="strong">➔ {rep.newTitle}</s-text>
                        <s-badge tone="neutral">Qty: {rep.quantity}</s-badge>
                      </s-stack>

                      <s-button variant="tertiary" onClick={() => handleUndoReplace(lineId)}>
                        Undo
                      </s-button>
                    </s-stack>
                  </s-box>
                );
              })}

              {/* Quantity adjustments */}
              {modifiedQtyLines.map((line) => {
                const nextQty = qtyChanges[line.id];
                const isZero = nextQty === 0;
                return (
                  <s-box key={line.id} background="surface" padding="small-200" borderRadius="base" borderWidth="base">
                    <s-stack direction="inline" justifyContent="space-between" alignItems="center">
                      <s-stack direction="inline" gap="small-200" alignItems="center">
                        <s-badge tone={isZero ? 'critical' : 'info'}>
                          {isZero ? 'Remove Item' : 'Update Qty'}
                        </s-badge>
                        <s-text type="strong" size="small">{line.title}</s-text>
                        <s-text size="small" color="subdued">
                          Qty: {line.currentQuantity} ➔ {nextQty}
                        </s-text>
                      </s-stack>

                      <s-button variant="tertiary" onClick={() => handleUndoQty(line.id)}>
                        Undo
                      </s-button>
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
              Applied {successInfo.actionsApplied ?? totalStagedCount} change{successInfo.actionsApplied !== 1 ? 's' : ''} to your order. The page will reload shortly to reflect updated items and pricing.
            </s-text>
          </s-stack>
        </s-banner>
      )}

      {/* ── Inline Row Errors Display (Direct on Screen, Single Line Per Row, No Download Buttons) ── */}
      {errorsList.length > 0 && (
        <s-banner tone="critical" title="Some items could not be processed">
          <s-stack direction="block" gap="small-200">
            <s-text size="small">
              Please fix the following issue{errorsList.length !== 1 ? 's' : ''}:
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
          disabled={submitting || isSubmitted || totalStagedCount === 0}
          onClick={handleApply}
        >
          {submitting
            ? 'Applying Updates...'
            : isSubmitted
            ? 'Updates Applied'
            : totalStagedCount > 0
            ? `Apply Bulk Updates (${totalStagedCount} change${totalStagedCount !== 1 ? 's' : ''})`
            : 'Apply Bulk Updates'}
        </s-button>
      </s-stack>
    </s-stack>
  );
}

export default BulkUpdateUI;
