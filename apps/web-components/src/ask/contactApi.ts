import type { HelpContactReceipt, HelpContactRequest } from '@db/shared-schemas';
import { ApiRequestError } from '../api/ApiClient';

/** Messages waiting to be sent while the learner is offline. Removed from the device as soon as they are sent. */
export const CONTACT_OUTBOX_KEY = 'db-help-contact-outbox';

/** Delivers one message: a receipt when sent, null when it could not be delivered (ApiClient.contactPerson). */
export type ContactSender = (payload: HelpContactRequest) => Promise<HelpContactReceipt | null>;

export type ContactResult =
  | { status: 'sent'; receipt: HelpContactReceipt }
  | { status: 'queued' }
  | { status: 'rejected'; httpStatus: number };

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function readOutbox(): HelpContactRequest[] {
  try {
    const raw = storage()?.getItem(CONTACT_OUTBOX_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? (list as HelpContactRequest[]) : [];
  } catch {
    return [];
  }
}

function writeOutbox(list: HelpContactRequest[]): void {
  try {
    const store = storage();
    if (!store) return;
    if (list.length) store.setItem(CONTACT_OUTBOX_KEY, JSON.stringify(list));
    else store.removeItem(CONTACT_OUTBOX_KEY);
  } catch {
    // Storage blocked: the form keeps its text, so nothing the learner typed is lost.
  }
}

/** null means "try again later"; a 4xx other than 429 means the server refused this data. */
async function attempt(send: ContactSender, payload: HelpContactRequest): Promise<ContactResult | null> {
  try {
    const receipt = await send(payload);
    return receipt ? { status: 'sent', receipt } : null;
  } catch (error) {
    if (error instanceof ApiRequestError && error.status !== 429) return { status: 'rejected', httpStatus: error.status };
    return null;
  }
}

/** Sends a message, or keeps it on this device when it cannot be delivered now (ENGINEERING_RULES.md 0.6, offline first). */
export async function sendContact(send: ContactSender, payload: HelpContactRequest): Promise<ContactResult> {
  const result = await attempt(send, payload);
  if (result) return result;
  writeOutbox([...readOutbox(), payload]);
  return { status: 'queued' };
}

/** Tries every waiting message once. Returns how many were sent. Refused messages are dropped, not retried forever. */
export async function flushOutbox(send: ContactSender): Promise<number> {
  const waiting = readOutbox();
  if (!waiting.length) return 0;
  const left: HelpContactRequest[] = [];
  let sent = 0;
  for (const payload of waiting) {
    const result = await attempt(send, payload);
    if (!result) left.push(payload);
    else if (result.status === 'sent') sent += 1;
  }
  writeOutbox(left);
  return sent;
}
