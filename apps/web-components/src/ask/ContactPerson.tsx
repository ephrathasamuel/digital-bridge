import React, { useEffect, useId, useRef, useState } from 'react';
import { AlertCircle, CheckCircle2, Send } from 'lucide-react';
import {
  HELP_CONTACT_LIMITS, validateHelpContact,
  type HelpContactError, type HelpContactField, type HelpContactReceipt, type HelpContactRequest, type I18nKey, type Lang,
} from '@db/shared-schemas';
import { ApiClient } from '../api/ApiClient';
import { makeT } from '../i18n';
import { cleanId, cx, ui } from '../wizard/ui';
import { flushOutbox, sendContact, type ContactSender } from './contactApi';

export interface ContactPersonProps {
  lang: Lang;
  apiUrl?: string;
  partnerId?: string;
  /** The last question asked in the Ask box, so the learner does not type it again (3.3.7). */
  initialMessage?: string;
  /** Writes to the Ask box's one live region (4.1.3). */
  announce: (text: string) => void;
}

const ERROR_KEYS: Record<HelpContactField, Record<HelpContactError, I18nKey>> = {
  contact: { required: 'contact.contactRequired', invalid: 'contact.contactInvalid' },
  message: { required: 'contact.messageRequired', invalid: 'contact.messageRequired' },
  consent: { required: 'contact.consentRequired', invalid: 'contact.consentRequired' },
};
const FIELD_ORDER: HelpContactField[] = ['contact', 'message', 'consent'];

/**
 * "Contact a person": a short form in the Ask box that sends a message to the help team (POST /api/v1/help/contact).
 * Consent is required. Offline, the message is kept on this device and sent when the connection is back.
 */
export const ContactPerson: React.FC<ContactPersonProps> = ({ lang, apiUrl, partnerId = 'alx-demo', initialMessage = '', announce }) => {
  const t = makeT(lang);
  const idBase = `contact-${cleanId(useId())}`;
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [message, setMessage] = useState(initialMessage);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Partial<Record<HelpContactField, HelpContactError>>>({});
  const [sending, setSending] = useState(false);
  const [receipt, setReceipt] = useState<HelpContactReceipt | null>(null);
  const [queued, setQueued] = useState(false);
  const summaryRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef<HTMLParagraphElement>(null);
  const fieldRefs = {
    contact: useRef<HTMLInputElement>(null),
    message: useRef<HTMLTextAreaElement>(null),
    consent: useRef<HTMLInputElement>(null),
  };

  // A fresh client per attempt: ApiClient stays in mock mode after one network failure, which would block retries.
  const sender: ContactSender = (payload) => new ApiClient({ apiUrl, partnerId }).contactPerson(payload);

  // Send messages kept while offline: now, and whenever the connection comes back (ENGINEERING_RULES.md 7).
  useEffect(() => {
    if (!apiUrl) return undefined;
    const flush = () => void flushOutbox(sender);
    flush();
    window.addEventListener('online', flush);
    return () => window.removeEventListener('online', flush);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiUrl, partnerId]);

  const ids = {
    summary: `${idBase}-summary`,
    name: `${idBase}-name`,
    contact: `${idBase}-contact`,
    contactHint: `${idBase}-contact-hint`,
    message: `${idBase}-message`,
    messageHint: `${idBase}-message-hint`,
    consent: `${idBase}-consent`,
    consentHint: `${idBase}-consent-hint`,
  };
  const errorId = (field: HelpContactField) => `${idBase}-${field}-error`;
  const describedBy = (field: HelpContactField, hint: string) => (errors[field] ? `${hint} ${errorId(field)}` : hint);
  const errorText = (field: HelpContactField) => {
    const code = errors[field];
    return code ? t(ERROR_KEYS[field][code]) : '';
  };
  const fieldError = (field: HelpContactField) =>
    errors[field] ? (
      <p id={errorId(field)} className={ui.error}>
        <AlertCircle aria-hidden="true" focusable="false" className="h-4 w-4 mt-0.5 shrink-0" />
        {errorText(field)}
      </p>
    ) : null;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (sending) return;
    const payload: HelpContactRequest = { name, contact, message, lang, consent };
    const checked = validateHelpContact(payload);
    if (!checked.ok) {
      setErrors(checked.errors);
      announce(t('contact.fixErrors'));
      requestAnimationFrame(() => summaryRef.current?.focus());
      return;
    }
    setErrors({});
    setSending(true);
    announce(t('contact.sending'));
    const result = await sendContact(sender, { ...checked.value, consent: true });
    setSending(false);
    if (result.status === 'rejected') {
      announce(t('contact.failed'));
      return;
    }
    if (result.status === 'sent') {
      setReceipt(result.receipt);
      announce(t('contact.sent', { ref: result.receipt.reference }));
    } else {
      setQueued(true);
      announce(t('contact.queued'));
    }
    requestAnimationFrame(() => doneRef.current?.focus());
  };

  if (receipt || queued) {
    return (
      <div className="rounded-xl border-2 border-ink bg-white p-4 mb-4">
        <p ref={doneRef} tabIndex={-1} data-db-contact-done="" className="flex items-start gap-2 font-semibold focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-terracotta-dark">
          <CheckCircle2 aria-hidden="true" focusable="false" className="h-5 w-5 mt-0.5 shrink-0" />
          {receipt ? t('contact.sent', { ref: receipt.reference }) : t('contact.queued')}
        </p>
      </div>
    );
  }

  const invalid = FIELD_ORDER.filter((field) => errors[field]);

  return (
    <form noValidate aria-labelledby={`${idBase}-heading`} onSubmit={submit} className="rounded-xl border-2 border-sand bg-white p-4 mb-4">
      <h3 id={`${idBase}-heading`} className="font-bold mb-1">{t('contact.open')}</h3>
      <p className="mb-3">{t('contact.intro')}</p>

      {invalid.length > 0 && (
        <div ref={summaryRef} id={ids.summary} role="alert" tabIndex={-1} className={cx(ui.notice, 'flex-col border-red-800')}>
          <h4 className="flex items-center gap-2 font-bold">
            <AlertCircle aria-hidden="true" focusable="false" className="h-5 w-5 shrink-0" />
            {t('contact.fixErrors')}
          </h4>
          <ul className="list-disc pl-6">
            {invalid.map((field) => (
              <li key={field}>
                <a
                  href={`#${ids[field]}`}
                  className="underline font-semibold"
                  onClick={(event) => {
                    // Fragment links do not move focus inside a shadow root, so focus the field directly.
                    event.preventDefault();
                    fieldRefs[field].current?.focus();
                  }}
                >
                  {errorText(field)}
                </a>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className={ui.field}>
        <label htmlFor={ids.name} className={ui.label}>{t('contact.name')}</label>
        <input
          id={ids.name}
          type="text"
          autoComplete="name"
          maxLength={HELP_CONTACT_LIMITS.name}
          value={name}
          onChange={(event) => setName(event.target.value)}
          className={ui.input}
        />
      </div>

      <div className={ui.field}>
        <label htmlFor={ids.contact} className={ui.label}>{t('contact.contact')}</label>
        <p id={ids.contactHint} className={ui.hint}>{t('contact.contactHint')}</p>
        {fieldError('contact')}
        <input
          ref={fieldRefs.contact}
          id={ids.contact}
          type="text"
          inputMode="email"
          autoComplete="email"
          required
          maxLength={HELP_CONTACT_LIMITS.contact}
          value={contact}
          onChange={(event) => setContact(event.target.value)}
          aria-describedby={describedBy('contact', ids.contactHint)}
          aria-invalid={errors.contact ? true : undefined}
          className={cx(ui.input, errors.contact && ui.inputInvalid)}
        />
      </div>

      <div className={ui.field}>
        <label htmlFor={ids.message} className={ui.label}>{t('contact.message')}</label>
        <p id={ids.messageHint} className={ui.hint}>{t('contact.messageHint')}</p>
        {fieldError('message')}
        <textarea
          ref={fieldRefs.message}
          id={ids.message}
          required
          rows={4}
          maxLength={HELP_CONTACT_LIMITS.message}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          aria-describedby={describedBy('message', ids.messageHint)}
          aria-invalid={errors.message ? true : undefined}
          className={cx(ui.input, errors.message && ui.inputInvalid)}
        />
      </div>

      <div className={ui.field}>
        {fieldError('consent')}
        <div className={ui.checkRow}>
          <input
            ref={fieldRefs.consent}
            id={ids.consent}
            type="checkbox"
            required
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            aria-describedby={describedBy('consent', ids.consentHint)}
            aria-invalid={errors.consent ? true : undefined}
            className={ui.checkbox}
          />
          <div>
            <label htmlFor={ids.consent} className="font-semibold">{t('contact.consent')}</label>
            <p id={ids.consentHint} className={ui.hint}>{t('contact.consentHint')}</p>
          </div>
        </div>
      </div>

      <button type="submit" aria-disabled={sending || undefined} className={ui.btnPrimary}>
        <Send aria-hidden="true" focusable="false" className="h-5 w-5 shrink-0" />
        {t('contact.send')}
      </button>
    </form>
  );
};
