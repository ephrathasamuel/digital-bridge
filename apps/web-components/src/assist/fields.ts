// Finds and describes form fields on any page (LinkedIn, a job board, a government form) for the help bar.
import type { SpokenKind } from '../voice/spokenInput';

export type FormField = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | HTMLElement;

const SKIP_INPUTS = new Set(['hidden', 'submit', 'button', 'reset', 'image', 'file', 'range', 'color']);
const DICTATE_INPUTS = new Set(['', 'text', 'email', 'tel', 'search', 'url', 'number']);

export function isFormField(el: Element | null): el is FormField {
  if (!el) return false;
  if (el instanceof HTMLInputElement) return !SKIP_INPUTS.has(el.type);
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) return true;
  return el instanceof HTMLElement && (el.isContentEditable || el.getAttribute('role') === 'textbox');
}

/** Fields that take typed words: voice answers and Amharic typing can go into these (never passwords). */
export function canTakeText(el: FormField): boolean {
  if (el instanceof HTMLInputElement) return DICTATE_INPUTS.has(el.type) && !el.readOnly && !el.disabled;
  if (el instanceof HTMLTextAreaElement) return !el.readOnly && !el.disabled;
  return !(el instanceof HTMLSelectElement) && el.isContentEditable;
}

const clean = (text: string | null | undefined) => (text ?? '').replace(/\s+/g, ' ').trim();

function textOfIds(ids: string | null, doc: Document): string {
  return clean((ids ?? '').split(/\s+/).map((id) => (id ? doc.getElementById(id)?.textContent : '')).join(' '));
}

/** The field's name as a screen reader would say it, with the usual fallbacks used by real sites. */
export function fieldLabel(el: FormField): string {
  const doc = el.ownerDocument;
  const fromIds = textOfIds(el.getAttribute('aria-labelledby'), doc);
  if (fromIds) return fromIds;
  const aria = clean(el.getAttribute('aria-label'));
  if (aria) return aria;
  const labels = 'labels' in el && el.labels ? Array.from(el.labels).map((l) => clean(l.textContent)).filter(Boolean) : [];
  if (labels.length) return labels.join(' ');
  const wrapping = clean(el.closest('label')?.textContent);
  if (wrapping) return wrapping;
  return clean(el.getAttribute('title') || el.getAttribute('placeholder') || el.getAttribute('name'));
}

export function fieldHint(el: FormField): string {
  return textOfIds(el.getAttribute('aria-describedby'), el.ownerDocument);
}

export function fieldValue(el: FormField): string {
  if (el instanceof HTMLSelectElement) return clean(el.selectedOptions[0]?.textContent);
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio')) return el.checked ? '✓' : '';
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) return el.value;
  return clean(el.textContent);
}

export function isRequired(el: FormField): boolean {
  return ('required' in el && Boolean((el as HTMLInputElement).required)) || el.getAttribute('aria-required') === 'true';
}

/** How spoken words are tidied for this field: "zero nine one one" becomes 0911 in a phone field. */
export function spokenKindOf(type: string, autocomplete: string): SpokenKind {
  if (type === 'tel' || /\btel\b/.test(autocomplete)) return 'tel';
  if (type === 'email' || /\bemail\b/.test(autocomplete)) return 'email';
  if (/one-time-code/.test(autocomplete)) return 'code';
  return 'text';
}

export function spokenKindFor(el: FormField): SpokenKind {
  return spokenKindOf(el instanceof HTMLInputElement ? el.type : '', el.getAttribute('autocomplete') ?? '');
}

/** Words read aloud for a field: its name, hint, whether it is required, and what it holds now. */
export function composeFieldText(
  parts: { label: string; hint: string; value: string; required: boolean },
  words: { template: string; required: string; empty: string; unnamed: string },
): string {
  const hint = [parts.required ? words.required : '', parts.hint ? `${parts.hint}.` : ''].filter(Boolean).join(' ');
  return words.template
    .replace('{label}', parts.label || words.unnamed)
    .replace('{hint}', hint)
    .replace('{value}', parts.value.trim() || words.empty)
    .replace(/\s{2,}/g, ' ')
    .replace(/\.\s*\./g, '.')
    .trim();
}

/**
 * Puts text into a field the way typing would, so sites built with React, Vue or Angular (LinkedIn included) notice
 * the change. Text is added after what is already there. Never submits the form.
 */
export function insertText(el: FormField, text: string): void {
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const next = el.value && !/\s$/.test(el.value) ? `${el.value} ${text}` : `${el.value}${text}`;
    const proto = el instanceof HTMLInputElement ? HTMLInputElement.prototype : HTMLTextAreaElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(el, next);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
    return;
  }
  if (el.isContentEditable) {
    el.focus();
    // execCommand is deprecated but is still the only way rich text editors treat inserted text as typing.
    if (!el.ownerDocument.execCommand?.('insertText', false, text)) el.append(text);
  }
}
