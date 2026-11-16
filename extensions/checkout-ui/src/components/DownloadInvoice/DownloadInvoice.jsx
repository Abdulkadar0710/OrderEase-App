import { useState } from 'preact/hooks';
import { getInvoiceLink } from '../../utils/api.js';
import { getExtensionOrderId, formatOrderId } from '../../utils/shopifyHelpers.js';

export function DownloadInvoice({ orderId: propOrderId }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [invoiceUrl, setInvoiceUrl] = useState(null);
  const orderId = formatOrderId(propOrderId) || getExtensionOrderId();

  const handleDownload = async () => {
    // Open a blank tab synchronously on click to satisfy browser user gesture requirements
    // and avoid popup blocker interference when redirecting after async fetch.
    let newTab = null;
    try {
      if (typeof window !== 'undefined' && typeof window.open === 'function') {
        newTab = window.open('about:blank', '_blank');
      }
    } catch (e) {
      console.warn('Could not pre-open blank tab:', e);
    }

    try {
      setLoading(true);
      setError(null);
      const res = await getInvoiceLink({ orderId });
      const url = res.url || res.invoiceUrl;

      if (!url) {
        throw new Error('No invoice link was returned.');
      }
      
      setInvoiceUrl(url);

      // If the blank tab was successfully opened, navigate it to the PDF in that new tab
      if (newTab && !newTab.closed) {
        try {
          newTab.location.href = url;
        } catch (e) {
          console.warn('Failed to assign new tab URL:', e);
        }
      }
    } catch (err) {
      if (newTab && !newTab.closed) {
        try {
          newTab.close();
        } catch (e) {
          // ignore
        }
      }
      console.error('Failed to download invoice:', err);
      setError(err instanceof Error ? err.message : 'Could not generate official invoice PDF at this time.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <s-stack direction="block" gap="base">
      <s-box background="surface" padding="base" borderRadius="base" borderWidth="base">
        <s-stack direction="block" gap="small-200">
          <s-stack direction="inline" alignItems="center" justifyContent="space-between" gap="base">
            <s-stack direction="inline" alignItems="center" gap="small-300">
              <s-box padding="small-200" background="subdued" borderRadius="base">
                <s-icon type="order" size="base" tone="neutral" />
              </s-box>
              <s-text type="strong">Official Itemized Invoice PDF</s-text>
            </s-stack>

            {invoiceUrl ? (
              <s-button
                variant="primary"
                href={invoiceUrl}
                target="_blank"
              >
                Open Invoice PDF
              </s-button>
            ) : (
              <s-button
                variant="secondary"
                loading={loading}
                disabled={loading}
                onClick={handleDownload}
              >
                {loading ? 'Generating PDF...' : 'Download PDF'}
              </s-button>
            )}
          </s-stack>

          <s-text size="small" color="subdued">
            Generate a formatted, itemized commercial tax invoice and accounting receipt for your records.
          </s-text>

          {invoiceUrl && (
            <s-banner tone="success">
              Invoice PDF generated!{' '}
              <s-link href={invoiceUrl} target="_blank">Click here to view or download PDF</s-link>.
            </s-banner>
          )}
        </s-stack>
      </s-box>

      {error && <s-banner tone="critical">{error}</s-banner>}
    </s-stack>
  );
}
