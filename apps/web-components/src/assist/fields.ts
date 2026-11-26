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

/** Text of the elements named by aria-labelledby / aria-describedby, looked up in the same shadow root as the field. */
function textOfIds(ids: string | null, el: Element): string {
  const root = el.getRootNode() as Document | ShadowRoot;
  return clean((ids ?? '').split(/\s+/).map((id) => (id ? root.getElementById?.(id)?.textContent : '')).join(' '));
}

/** The field's name as a screen reader would say it, with the usual fallbacks used by real sites. */
export function fieldLabel(el: FormField): string {
  const fromIds = textOfIds(el.getAttribute('aria-labelledby'), el);
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
  return textOfIds(el.getAttribute('aria-describedby'), el);
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
  const saysRequired = /required|ግዴታ/i.test(parts.label);
  const hint = [parts.required && !saysRequired ? words.required : '', parts.hint ? `${parts.hint}.` : '']
    .filter(Boolean)
    .join(' ');
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

// ---------- Read as I move: any focused item, and table cells ----------

export type TableCell = HTMLTableCellElement;

export function tableCellOf(el: Element | null): TableCell | null {
  const cell = el?.closest?.('td, th');
  return cell instanceof HTMLTableCellElement ? cell : null;
}

/** The column heading for a cell: the first row's cell in the same column, or the thead cell. */
export function columnHeader(cell: TableCell): string {
  const table = cell.closest('table');
  if (!table) return '';
  const headRow = table.tHead?.rows[0] ?? table.rows[0];
  const head = headRow?.cells[cell.cellIndex];
  return head && head !== cell ? clean(head.textContent) : '';
}

/** Neighbour cell in a direction, or null at the table edge. */
export function neighbourCell(cell: TableCell, key: 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'): TableCell | null {
  const row = cell.parentElement as HTMLTableRowElement | null;
  const table = cell.closest('table');
  if (!row || !table) return null;
  if (key === 'ArrowLeft') return row.cells[cell.cellIndex - 1] ?? null;
  if (key === 'ArrowRight') return row.cells[cell.cellIndex + 1] ?? null;
  const next = table.rows[row.rowIndex + (key === 'ArrowDown' ? 1 : -1)];
  return next?.cells[Math.min(cell.cellIndex, next.cells.length - 1)] ?? null;
}

export interface DescribeWords {
  field: { template: string; required: string; empty: string; unnamed: string };
  button: string;
  link: string;
  cell: string;
  headCell: string;
  emptyCell: string;
  /** Said for a tick box or a choice instead of "your answer: empty" ("ticked" / "not ticked"). */
  checked?: string;
  unchecked?: string;
}

const fill = (template: string, vars: Record<string, string>) =>
  Object.entries(vars).reduce((text, [k, v]) => text.replace(`{${k}}`, v), template);

const CELL_CONTROLS = 'select, textarea, input:not([type="hidden"]), button, a[href], [role="button"]';

/** What to read aloud when an item gets focus: a form field, a button, a link, a table cell, or its text. */
export function describeElement(el: Element, words: DescribeWords): string {
  if (el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio') && words.checked && words.unchecked) {
    const hint = fieldHint(el);
    return [fieldLabel(el) || words.field.unnamed, hint, el.checked ? words.checked : words.unchecked].filter(Boolean).join('. ') + '.';
  }
  if (isFormField(el)) {
    return composeFieldText({ label: fieldLabel(el), hint: fieldHint(el), value: fieldValue(el), required: isRequired(el) }, words.field);
  }
  const cell = el instanceof HTMLTableCellElement ? el : null;
  if (cell) {
    const row = (cell.parentElement as HTMLTableRowElement | null)?.rowIndex ?? 0;
    const column = columnHeader(cell);
    // A cell holding a control (a list, a tick box, a button) is read as that control, never as the list's raw text.
    const control = cell.querySelector<HTMLElement>(CELL_CONTROLS);
    const text = control ? describeElement(control, words).replace(/\.$/, '') : clean(cell.textContent) || words.emptyCell;
    if (!column) return fill(words.headCell, { text });
    return fill(words.cell, { text, column, row: String(row + 1) });
  }
  const name = clean(el.getAttribute('aria-label')) || textOfIds(el.getAttribute('aria-labelledby'), el) || clean(el.textContent);
  if (el instanceof HTMLButtonElement || el.getAttribute('role') === 'button') return fill(words.button, { text: name });
  if (el instanceof HTMLAnchorElement) return fill(words.link, { text: name });
  return name;
}

/**
 * Whether the arrow key already has a job where focus is: moving the cursor in text, choosing in a radio
 * group, changing a number. In a one line text box only left and right move the cursor, so up and down move on.
 */
export function keepsArrow(node: Element, key: string): boolean {
  if (node instanceof HTMLInputElement) {
    if (['checkbox', 'button', 'submit', 'reset'].includes(node.type)) return false;
    if (['', 'text', 'email', 'tel', 'search', 'url', 'password'].includes(node.type)) return key === 'ArrowLeft' || key === 'ArrowRight';
    return true; // radio, number, range, date and the like
  }
  // A closed list does not trap the arrows: Space, Enter or Alt+Down open it, and the arrows then choose inside it.
  return node instanceof HTMLTextAreaElement || (node instanceof HTMLElement && node.isContentEditable);
}
