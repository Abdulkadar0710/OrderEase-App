import { formatMoney } from '../../utils/formatMoney';

/**
 * Shows a warning banner when a balance is due after order editing,
 * providing a link to complete payment on the status/checkout page.
 */
export function BalanceDueRedirect({ balanceDue, statusPageUrl }) {
  if (!balanceDue) return null;

  const formattedAmount = formatMoney(balanceDue);
  const currencySuffix = balanceDue.currencyCode && !formattedAmount.includes(balanceDue.currencyCode)
    ? ` ${balanceDue.currencyCode}`
    : '';

  return (
    <s-banner tone="warning">
      {`Balance due of ${formattedAmount}${currencySuffix}. We've emailed you an invoice. `}
      {statusPageUrl && <s-link href={statusPageUrl} target="_top">Click here to complete payment</s-link>}
    </s-banner>
  );
}

