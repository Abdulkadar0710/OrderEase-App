import { useState, useEffect } from 'preact/hooks';
import { cancelOrder, getOrderDetails } from '../../utils/api';
import { useOrderEdit } from '../../context/OrderEditContext.jsx';

/**
 * Component to display order cancellation action with confirmation modal.
 */
export function CancelOrder({ isCancelled: propIsCancelled, order: propOrder, orderId: propOrderId }) {
  const shopifyOrder = typeof shopify !== 'undefined' ? shopify.order?.value : null;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [alreadyCancelled, setAlreadyCancelled] = useState(false);
  const { isCancelled: contextIsCancelled, setIsCancelled } = useOrderEdit();

  const isOrderCancelled = Boolean(
    success ||
    alreadyCancelled ||
    contextIsCancelled ||
    propIsCancelled ||
    shopifyOrder?.cancelledAt ||
    propOrder?.cancelledAt
  );

  useEffect(() => {
    if (isOrderCancelled) {
      setAlreadyCancelled(true);
      return;
    }
    const targetId = propOrderId || shopifyOrder?.id || propOrder?.id;
    if (targetId) {
      getOrderDetails({ orderId: targetId })
        .then((res) => {
          if (res?.order?.cancelledAt) {
            setAlreadyCancelled(true);
            if (typeof setIsCancelled === 'function') {
              setIsCancelled(true);
            }
          }
        })
        .catch(() => {});
    }
  }, [shopifyOrder?.id, propOrderId, propOrder?.id, isOrderCancelled]);

  const handleCancel = async () => {
    if (isOrderCancelled) return;
    try {
      setSubmitting(true);
      setError(null);
      const targetId = shopifyOrder?.id || propOrderId || propOrder?.id;
      await cancelOrder({ orderId: targetId });
      setSuccess(true);
      setAlreadyCancelled(true);
      if (typeof setIsCancelled === 'function') {
        setIsCancelled(true);
      }
    } catch (err) {
      console.error(err);
      const msg = err instanceof Error ? err.message : 'Could not cancel order';
      if (
        msg.toLowerCase().includes('already') ||
        msg.toLowerCase().includes('cancelled') ||
        msg.toLowerCase().includes('canceled')
      ) {
        setAlreadyCancelled(true);
        if (typeof setIsCancelled === 'function') {
          setIsCancelled(true);
        }
        setError('This order is already cancelled.');
      } else {
        setError(msg);
      }
    } finally {
      setSubmitting(false);
      setShowConfirm(false);
    }
  };

  if (success) {
    return (
      <s-box padding="base">
        <s-banner tone="success">
          Order Cancellation Confirmed! Your order has been successfully cancelled and your full automated refund has been processed.
        </s-banner>
      </s-box>
    );
  }

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
                disabled={submitting || success || isOrderCancelled}
              >
                {isOrderCancelled ? 'Order Cancelled' : 'Cancel Order'}
              </s-button>
            </s-stack>

            <s-text size="small" color={isOrderCancelled ? "critical" : "subdued"}>
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
                disabled={submitting}
              >
                No, keep my shipment
              </s-button>
              <s-button
                variant="primary"
                tone="critical"
                loading={submitting}
                disabled={submitting || isOrderCancelled}
                onClick={handleCancel}
              >
                Yes, confirm cancellation
              </s-button>
            </s-stack>
          </s-stack>
        </s-box>
      )}

      {error && <s-banner tone="critical">{error}</s-banner>}
    </s-stack>
  );
}
