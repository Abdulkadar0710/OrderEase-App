import { useState, useEffect } from 'preact/hooks';
import { formatMoney } from '../../utils/formatMoney';
import { addProductToOrder, checkVariantQuantity } from '../../utils/api';

/** Format a variant's selected options as "Size: M, Color: Blue". */
function variantLabel(variant) {
  const options = (variant.selectedOptions || [])
    .filter((o) => o.value !== 'Default Title')
    .map((o) => `${o.name}: ${o.value}`)
    .join(', ');
  return options || variant.title;
}

/**
 * Lets the customer pick a variant and quantity for the selected product,
 * then submits the add-to-order request.
 */
export function VariantPicker({ product, orderId, onBack, onAdded }) {
  const variants = product.variants?.nodes ?? [];
  const [selectedVariantId, setSelectedVariantId] = useState(
    variants[0]?.id ?? null,
  );
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [liveInventory, setLiveInventory] = useState(null);
  const [stockConfirmation, setStockConfirmation] = useState(null);

  const hasMultipleVariants = variants.length > 1;
  const selectedVariant = variants.find((v) => v.id === selectedVariantId) || variants[0];

  // Fetch real-time inventory whenever selected variant changes
  useEffect(() => {
    if (!selectedVariantId) return;

    let isCurrent = true;
    checkVariantQuantity(selectedVariantId).then((res) => {
      if (isCurrent && res && typeof res.quantityAvailable === 'number') {
        setLiveInventory(res.quantityAvailable);
      }
    });

    return () => {
      isCurrent = false;
    };
  }, [selectedVariantId, selectedVariant]);

  const availableStock = liveInventory;
  const isOutOfStock = selectedVariant?.availableForSale === false || (availableStock !== null && availableStock <= 0);
  const isQuantityExceeded = availableStock !== null && availableStock > 0 && quantity > availableStock;

  const handleSelectVariant = (variantId) => {
    setSelectedVariantId(variantId);
    setStockConfirmation(null);
    setError(null);
  };

  const handleQuantityChange = (val) => {
    setQuantity(Math.max(1, isNaN(val) ? 1 : val));
    setStockConfirmation(null);
    setError(null);
  };

  const handleCancelConfirmation = () => {
    setStockConfirmation(null);
  };

  const handleConfirmAdd = () => {
    if (!stockConfirmation) return;
    const targetQty = stockConfirmation.availableQty;
    setQuantity(targetQty);
    handleAdd(true, targetQty);
  };

  async function handleAdd(isConfirmed = false, customQty = null) {
    if (!selectedVariantId) return;

    setSubmitting(true);
    setError(null);

    try {
      let avail = availableStock;

      try {
        const inventory = await checkVariantQuantity(selectedVariantId);
        if (inventory) {
          if (!inventory.availableForSale) {
            throw new Error('This item is currently out of stock.');
          }
          if (typeof inventory.quantityAvailable === 'number') {
            avail = inventory.quantityAvailable;
            setLiveInventory(avail);
          }
        }
      } catch (checkErr) {
        if (checkErr instanceof Error && checkErr.message === 'This item is currently out of stock.') {
          throw checkErr;
        }
      }

      if (avail !== null && avail !== undefined) {
        if (avail <= 0) {
          throw new Error('This item is currently out of stock.');
        }
        if (quantity > avail && !isConfirmed) {
          setStockConfirmation({ requestedQty: quantity, availableQty: avail });
          setSubmitting(false);
          return;
        }
      }

      const qtyToAdd = isConfirmed && customQty !== null 
        ? customQty 
        : (isConfirmed && stockConfirmation ? stockConfirmation.availableQty : quantity);

      const result = await addProductToOrder({
        orderId,
        variantId: selectedVariantId,
        quantity: qtyToAdd,
        confirmAvailableQuantity: isConfirmed,
      });

      const messageToToast = (isConfirmed || (avail !== null && quantity > avail))
        ? `Added ${qtyToAdd} quantity to your order.`
        : 'Product added to order';

      if (typeof shopify !== 'undefined' && shopify.toast?.show) {
        shopify.toast.show(messageToToast);
      }
      onAdded(
        result,
        (isConfirmed || (avail !== null && quantity > avail))
          ? `This product is not available in the required quantity of ${quantity}. Added available quantity of ${qtyToAdd} to your order.`
          : result.quantityMessage || null
      );
    } catch (err) {
      const availFromErr = err.availableQuantity;
      if (typeof availFromErr === 'number' && availFromErr > 0 && !isConfirmed) {
        setLiveInventory(availFromErr);
        setStockConfirmation({ requestedQty: quantity, availableQty: availFromErr });
      } else {
        const msg = err instanceof Error ? err.message : String(err) || 'Failed to add product';
        setError(msg);
        if (typeof shopify !== 'undefined' && shopify.toast?.show) {
          shopify.toast.show(msg);
        }
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <s-stack direction="block" gap="base">
      <s-clickable onClick={onBack}>
        <s-stack direction="inline" alignItems="center" gap="small-200">
          <s-icon type="chevron-left" size="small" tone="neutral" />
          <s-text color="subdued">Back to search</s-text>
        </s-stack>
      </s-clickable>

      <s-stack direction="inline" alignItems="center" gap="small">
        <s-box inlineSize="64px">
          {product.featuredImage ? (
            <s-image
              src={product.featuredImage.url}
              alt={product.featuredImage.altText || product.title}
              aspectRatio="1"
              borderRadius="base"
            />
          ) : (
            <s-icon type="image" size="large" tone="neutral" />
          )}
        </s-box>
        <s-stack direction="block" gap="none">
          <s-text type="strong">{product.title}</s-text>
          {availableStock !== null && availableStock !== undefined ? (
            <s-text color={availableStock <= 0 ? 'critical' : 'subdued'}>
              {availableStock <= 0 ? 'Out of stock' : `Available in stock: ${availableStock} unit${availableStock === 1 ? '' : 's'}`}
            </s-text>
          ) : null}
        </s-stack>
      </s-stack>

      {hasMultipleVariants && (
        <s-stack direction="block" gap="small-200">
          <s-text color="subdued">Choose an option</s-text>
          <s-scroll-box maxBlockSize="180px" accessibilityLabel="Product options list">
            <s-stack direction="block" gap="small-100">
              {variants.map((variant) => (
                <s-clickable
                  key={variant.id}
                  disabled={!variant.availableForSale}
                  onClick={() => handleSelectVariant(variant.id)}
                >
                  <s-box padding="small-200" background={selectedVariantId === variant.id ? 'subdued' : 'transparent'} borderRadius="base">
                    <s-stack direction="inline" alignItems="center" justifyContent="space-between">
                      <s-stack direction="inline" alignItems="center" gap="small-200">
                        <s-icon
                          type={selectedVariantId === variant.id ? 'check-circle-filled' : 'circle'}
                          size="small"
                          tone={selectedVariantId === variant.id ? 'success' : 'neutral'}
                        />
                        <s-text color={variant.availableForSale ? undefined : 'subdued'}>
                          {variantLabel(variant)}
                          {!variant.availableForSale ? ' (sold out)' : ''}
                        </s-text>
                      </s-stack>
                      <s-text color="subdued">{formatMoney(variant.price)}</s-text>
                    </s-stack>
                  </s-box>
                </s-clickable>
              ))}
            </s-stack>
          </s-scroll-box>
        </s-stack>
      )}

      <s-number-field
        label="Quantity"
        value={String(quantity)}
        min={1}
        max={availableStock && availableStock > 0 ? availableStock : 999}
        disabled={submitting || isOutOfStock}
        onInput={(e) => {
          const target = e.currentTarget;
          if (target && 'value' in target) {
            handleQuantityChange(Number(target.value));
          }
        }}
      />

      {isQuantityExceeded && !stockConfirmation ? (
        <s-banner tone="warning">
          This product is not available in the required quantity of {quantity}. Only {availableStock} unit{availableStock === 1 ? '' : 's'} available in stock.
        </s-banner>
      ) : null}

      {stockConfirmation && (
        <s-banner tone="warning">
          <s-stack direction="block" gap="small-200">
            <s-text type="strong">Confirm Available Quantity</s-text>
            <s-text>
              Only {stockConfirmation.availableQty} unit{stockConfirmation.availableQty === 1 ? '' : 's'} are available in stock (you requested {stockConfirmation.requestedQty}). Would you like to add the available {stockConfirmation.availableQty} unit{stockConfirmation.availableQty === 1 ? '' : 's'} to your order?
            </s-text>
            <s-stack direction="inline" gap="small-200" justifyContent="end">
              <s-button
                variant="tertiary"
                disabled={submitting}
                onClick={handleCancelConfirmation}
              >
                Cancel
              </s-button>
              <s-button
                variant="primary"
                disabled={submitting}
                loading={submitting}
                onClick={handleConfirmAdd}
              >
                Add {stockConfirmation.availableQty} to order
              </s-button>
            </s-stack>
          </s-stack>
        </s-banner>
      )}

      {isOutOfStock ? (
        <s-banner tone="critical">
          This product is currently out of stock and cannot be added.
        </s-banner>
      ) : null}

      {error ? <s-banner tone="critical">{error}</s-banner> : null}

      {!stockConfirmation && (
        <s-stack direction="inline" justifyContent="end">
          <s-button
            variant="primary"
            disabled={!selectedVariantId || submitting || isOutOfStock}
            loading={submitting}
            onClick={() => handleAdd(false)}
          >
            Add to order
          </s-button>
        </s-stack>
      )}
    </s-stack>
  );
}