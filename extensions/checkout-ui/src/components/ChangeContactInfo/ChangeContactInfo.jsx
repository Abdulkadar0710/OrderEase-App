import { useState } from 'preact/hooks';
import { updateContactInfo } from '../../utils/api.js';
import { getExtensionOrderId, formatOrderId, safeNavigate } from '../../utils/shopifyHelpers.js';

// Proper email validation with strict TLD, domain label, and RFC 5322 compliance
function isValidEmail(email) {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  if (trimmed.length === 0 || trimmed.length > 254) return false;

  // Must not contain whitespace
  if (/\s/.test(trimmed)) return false;

  // Exactly one @ symbol
  const parts = trimmed.split('@');
  if (parts.length !== 2) return false;

  const [localPart, domainPart] = parts;
  if (!localPart || !domainPart) return false;
  if (localPart.length > 64) return false;

  // Local part cannot start or end with a dot, or have consecutive dots
  if (localPart.startsWith('.') || localPart.endsWith('.') || localPart.includes('..')) {
    return false;
  }

  // Local part valid characters (RFC 5322 unquoted)
  const localRegex = /^[a-zA-Z0-9!#$%&'*+/=?^_`{|}~.-]+$/;
  if (!localRegex.test(localPart)) {
    return false;
  }

  // Domain cannot start or end with a dot or hyphen, or have consecutive dots
  if (domainPart.startsWith('.') || domainPart.endsWith('.') || domainPart.includes('..')) {
    return false;
  }

  const domainLabels = domainPart.split('.');
  // Domain must contain at least a domain name and a TLD (e.g. example.com)
  if (domainLabels.length < 2) {
    return false;
  }

  // Top-Level Domain (TLD) must be alphabetic only and between 2 and 63 characters long
  const tld = domainLabels[domainLabels.length - 1];
  if (!/^[a-zA-Z]{2,63}$/.test(tld)) {
    return false;
  }

  // Each subdomain/domain label must be 1 to 63 alphanumeric chars (hyphens allowed in middle)
  for (let i = 0; i < domainLabels.length - 1; i++) {
    const label = domainLabels[i];
    if (!label || label.length > 63) return false;
    if (!/^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label)) {
      return false;
    }
  }

  return true;
}

// Phone validation — ITU-T E.164 standard (7–15 digits)
function isValidPhone(phone) {
  if (!phone || typeof phone !== 'string') return false;
  const trimmed = phone.trim();
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return false;
  }
  return /^\+?[\d\s\-()]+$/.test(trimmed);
}

/**
 * Component to allow customers to edit email or mobile phone number associated with their order.
 */
export function ChangeContactInfo({ orderId: propOrderId }) {
  const orderId = formatOrderId(propOrderId) || getExtensionOrderId();

  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [emailError, setEmailError] = useState(null);
  const [phoneError, setPhoneError] = useState(null);
  const [success, setSuccess] = useState(false);

  const emailDirty = email.trim() !== '';
  const phoneDirty = phone.trim() !== '';

  function validate() {
    if (!emailDirty && !phoneDirty) {
      return { general: 'Please fill in at least an email address or phone number to update.' };
    }
    if (emailDirty && !isValidEmail(email)) {
      return {
        email: 'Please enter a valid email address format (e.g., name@example.com).',
        general: 'Please enter a valid email address format (e.g., name@example.com).'
      };
    }
    if (phoneDirty && !isValidPhone(phone)) {
      return {
        phone: 'Please enter a valid telephone number format (7–15 digits).',
        general: 'Please enter a valid telephone number format (7–15 digits).'
      };
    }
    return null;
  }

  const handleSave = async () => {
    setError(null);
    setEmailError(null);
    setPhoneError(null);
    setSuccess(false);

    const validationResult = validate();
    if (validationResult) {
      if (validationResult.general) setError(validationResult.general);
      if (validationResult.email) setEmailError(validationResult.email);
      if (validationResult.phone) setPhoneError(validationResult.phone);
      return;
    }

    setSubmitting(true);
    try {
      await updateContactInfo({
        orderId,
        email: emailDirty ? email.trim() : undefined,
        phone: phoneDirty ? phone.trim() : undefined,
      });

      setSuccess(true);
      setEmail('');
      setPhone('');
      setEmailError(null);
      setPhoneError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update notification preferences.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <s-stack direction="block" gap="base">
      <s-box background="surface" padding="base" borderRadius="base" borderWidth="base">
        <s-stack direction="block" gap="base">
          <s-stack direction="block" gap="small-100">
            <s-text type="strong">Customer Notification & Contact Preferences</s-text>
            <s-text size="small" color="subdued">
              We will send important shipping tracking alerts, out-for-delivery driver notices, and receipt updates directly to the new contact methods specified below. Leave any field blank to preserve existing details.
            </s-text>
          </s-stack>

          {success && (
            <s-banner tone="success">
              Notification and contact preferences updated successfully!
            </s-banner>
          )}

          {error && (
            <s-banner tone="critical">{error}</s-banner>
          )}

          <s-stack direction="block" gap="small-300">
            <s-stack direction="block" gap="small-100">
              <s-text-field
                label="New Email Address for shipping receipts"
                type="email"
                value={email}
                disabled={submitting}
                placeholder="e.g., name@example.com"
                onInput={(e) => {
                  const target = e.currentTarget;
                  if (target && 'value' in target) {
                    setEmail(String(target.value));
                    setSuccess(false);
                    setError(null);
                    setEmailError(null);
                  }
                }}
              />
              {emailError && (
                <s-text size="small" tone="critical">{emailError}</s-text>
              )}
            </s-stack>

            <s-stack direction="block" gap="small-100">
              <s-text-field
                label="New Mobile Phone Number for SMS dispatch alerts"
                type="tel"
                value={phone}
                disabled={submitting}
                placeholder="e.g., +1 (555) 234-5678"
                onInput={(e) => {
                  const target = e.currentTarget;
                  if (target && 'value' in target) {
                    setPhone(String(target.value));
                    setSuccess(false); 
                    setError(null);
                    setPhoneError(null);
                  }
                }}
              />
              {phoneError && (
                <s-text size="small" tone="critical">{phoneError}</s-text>
              )}
            </s-stack>
          </s-stack>

          <s-stack direction="inline" justifyContent="end">
            <s-button
              variant="primary"
              disabled={submitting || (!emailDirty && !phoneDirty)}
              loading={submitting}
              onClick={handleSave}
            >
              Save Notification Preferences
            </s-button>
          </s-stack>
        </s-stack>
      </s-box>
    </s-stack>
  );
}

