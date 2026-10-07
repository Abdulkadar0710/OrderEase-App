import { useState, useEffect } from 'preact/hooks';
import { cancelOrder, getOrderDetails } from '../../utils/api';
import { getExtensionOrderId, formatOrderId } from '../../utils/shopifyHelpers.js';

export function CancelOrder({ orderId: propOrderId, isCancelled: propIsCancelled, onCancelled }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [alreadyCancelled, setAlreadyCancelled] = useState(false);

  const orderId = formatOrderId(propOrderId) || getExtensionOrderId();

  const isOrderCancelled = Boolean(success || alreadyCancelled || propIsCancelled);

  useEffect(() => {
    if (isOrderCancelled) {
      setAlreadyCancelled(true);
      return;
    }
    if (orderId) {
      getOrderDetails({ orderId })
        .then((res) => {
          if (res?.order?.cancelledAt) {
            setAlreadyCancelled(true);
            if (typeof onCancelled === 'function') {
              onCancelled();
            }
          }
        })
        .catch(() => {});
    }
  }, [orderId, isOrderCancelled]);

  const handleCancel = async () => {
    if (isOrderCancelled) return;
    try {
      setLoading(true);
      setError(null);
      await cancelOrder({ orderId });
      setSuccess(true);
      setAlreadyCancelled(true);
      if (typeof onCancelled === 'function') {
        onCancelled();
      }
    } catch (err) {
      console.error('Failed to cancel order:', err);
      const msg = err instanceof Error ? err.message : 'Could not submit order cancellation request at this time.';
      if (
        msg.toLowerCase().includes('already') ||
        msg.toLowerCase().includes('cancelled') ||
        msg.toLowerCase().includes('canceled')
      ) {
        setAlreadyCancelled(true);
        if (typeof onCancelled === 'function') {
          onCancelled();
        }
        setError('This order is already cancelled.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
      setShowConfirm(false);
    }
  };

  return (
    <s-stack direction="block" gap="base">
      {isOrderCancelled && (
        <s-banner tone="critical" title="Order Cancelled">
          This order has already been cancelled and your refund has been processed.
        </s-banner>
      )}

      {!showConfirm ? (
        <s-box background="surface" padding="base" borderRadius="base" borderWidth="base">
          <s-stack direction="block" gap="small-200">
            <s-stack direction="inline" alignItems="center" justifyContent="space-between" gap="base">
              <s-stack direction="inline" alignItems="center" gap="small-300">
                <s-box padding="small-200" background="subdued" borderRadius="base">
                  <s-icon type="x" size="base" tone="critical" />
                </s-box>
                <s-text type="strong">Request Entire Order Cancellation</s-text>
              </s-stack>

              <s-button
                variant="tertiary"
                tone="critical"
                onClick={() => !isOrderCancelled && setShowConfirm(true)}
                disabled={loading || success || isOrderCancelled}
              >
                {isOrderCancelled ? 'Order Cancelled' : 'Cancel Order'}
              </s-button>
            </s-stack>

            <s-text size="small" color={isOrderCancelled ? 'critical' : 'subdued'}>
              {isOrderCancelled
                ? 'This order is already cancelled. No further cancellation action can be taken.'
                : 'Canceling will halt all packaging and shipment processing immediately and initiate an automated full refund to your payment method.'}
            </s-text>
          </s-stack>
        </s-box>
      ) : (
        <s-box background="subdued" padding="base" borderRadius="base" borderWidth="base">
          <s-stack direction="block" gap="base">
            <s-stack direction="inline" alignItems="center" gap="small-200">
              <s-icon type="x" size="base" tone="critical" />
              <s-stack direction="block" gap="none">
                <s-text type="strong">Are you completely sure you want to cancel this order?</s-text>
                <s-text size="small" color="subdued">
                  This destructive action cannot be undone once confirmed. Your full refund will appear on your card statement within 3 to 5 business days.
                </s-text>
              </s-stack>
            </s-stack>

            <s-stack direction="inline" gap="small-200" justifyContent="end">
              <s-button
                variant="secondary"
                onClick={() => setShowConfirm(false)}
                disabled={loading}
              >
                No, keep my shipment
              </s-button>
              <s-button
                variant="primary"
                tone="critical"
                loading={loading}
                disabled={loading || isOrderCancelled}
                onClick={handleCancel}
              >
                Yes, confirm cancellation
              </s-button>
            </s-stack>
          </s-stack>
        </s-box>
      )}

      {error && <s-banner tone="critical">{error}</s-banner>}
      {success && (
        <s-banner tone="success">
          Your order has been successfully cancelled and your full automated refund has been processed.
        </s-banner>
      )}
    </s-stack>
  );
}
