import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { I18N, validateHelpContact, type HelpContactRequest } from '@db/shared-schemas';
import { ApiRequestError } from '../api/ApiClient';
import { CONTACT_OUTBOX_KEY, flushOutbox, readOutbox, sendContact } from './contactApi';

const base: HelpContactRequest = { contact: '0911 234 567', message: 'I cannot find the sign language option.', lang: 'en', consent: true };
const receipt = { reference: 'HELP-1A2B3C4D', receivedAt: '2026-11-23T10:00:00.000Z' };

describe('validateHelpContact', () => {
  it('accepts an Ethiopian phone and returns it in +251 form', () => {
    const result = validateHelpContact({ ...base, name: '  Hana  ' });
    expect(result).toEqual({ ok: true, value: { name: 'Hana', contact: '+251911234567', contactKind: 'phone', message: base.message, lang: 'en' } });
  });

  it('accepts an email and an Amharic message', () => {
    const result = validateHelpContact({ ...base, contact: 'Hana@Example.com', message: 'የምልክት ቋንቋ አማራጭ አላገኘሁም።', lang: 'am' });
    expect(result).toMatchObject({ ok: true, value: { contact: 'hana@example.com', contactKind: 'email', lang: 'am' } });
  });

  it('accepts a phone typed in Ethiopic numerals', () => {
    expect(validateHelpContact({ ...base, contact: '0፱፲፩' }).ok).toBe(false);
    expect(validateHelpContact({ ...base, contact: '0፱11 234 567' })).toMatchObject({ ok: true, value: { contact: '+251911234567' } });
  });

  it('explains each problem: missing contact, bad contact, empty message, no consent', () => {
    expect(validateHelpContact({ ...base, contact: ' ', message: '', consent: false })).toEqual({
      ok: false, errors: { contact: 'required', message: 'required', consent: 'required' },
    });
    expect(validateHelpContact({ ...base, contact: '12345' })).toEqual({ ok: false, errors: { contact: 'invalid' } });
  });

  it('has every contact string in English and Amharic', () => {
    const keys = Object.keys(I18N.en).filter((key) => key.startsWith('contact.'));
    expect(keys.length).toBeGreaterThan(10);
    for (const key of keys) expect((I18N.am as Record<string, string>)[key]).toMatch(/[ሀ-፿]/);
  });
});

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe('Contact a person outbox', () => {
  beforeEach(() => vi.stubGlobal('window', { localStorage: new MemoryStorage() }));
  afterEach(() => vi.unstubAllGlobals());

  it('returns the reference when the help team receives the message', async () => {
    const send = vi.fn().mockResolvedValue(receipt);
    expect(await sendContact(send, base)).toEqual({ status: 'sent', receipt });
    expect(readOutbox()).toEqual([]);
  });

  it('keeps the message on the device when offline, then sends it and clears the device', async () => {
    expect(await sendContact(vi.fn().mockResolvedValue(null), base)).toEqual({ status: 'queued' });
    expect(await sendContact(vi.fn().mockRejectedValue(new ApiRequestError('busy', 429)), base)).toEqual({ status: 'queued' });
    expect(readOutbox()).toHaveLength(2);

    const send = vi.fn().mockResolvedValue(receipt);
    expect(await flushOutbox(send)).toBe(2);
    expect(send).toHaveBeenCalledWith(base);
    expect(window.localStorage.getItem(CONTACT_OUTBOX_KEY)).toBeNull();
  });

  it('does not keep or retry a message the server refused', async () => {
    const send = vi.fn().mockRejectedValue(new ApiRequestError('bad', 422));
    expect(await sendContact(send, base)).toEqual({ status: 'rejected', httpStatus: 422 });
    expect(readOutbox()).toEqual([]);
  });

  it('keeps only the messages that still could not be sent', async () => {
    await sendContact(vi.fn().mockResolvedValue(null), base);
    await sendContact(vi.fn().mockResolvedValue(null), { ...base, message: 'second' });
    const send = vi.fn().mockResolvedValueOnce(receipt).mockResolvedValueOnce(null);
    expect(await flushOutbox(send)).toBe(1);
    expect(readOutbox()).toEqual([{ ...base, message: 'second' }]);
  });
});
