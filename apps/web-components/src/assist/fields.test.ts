import { describe, expect, it } from 'vitest';
import { composeFieldText, spokenKindOf } from './fields';

const words = { template: '{label}. {hint} Your answer: {value}.', required: 'Required.', empty: 'empty', unnamed: 'This field has no name' };

describe('help bar field reading', () => {
  it('reads name, required, hint and value', () => {
    expect(composeFieldText({ label: 'Phone number', hint: 'For example 0911 234 567', value: '', required: true }, words))
      .toBe('Phone number. Required. For example 0911 234 567. Your answer: empty.');
  });

  it('does not say required twice when the label already says it', () => {
    expect(composeFieldText({ label: 'Full name (required)', hint: '', value: 'Hana', required: true }, words))
      .toBe('Full name (required). Your answer: Hana.');
  });

  it('names fields that have no label', () => {
    expect(composeFieldText({ label: '', hint: '', value: 'x', required: false }, words)).toBe('This field has no name. Your answer: x.');
  });

  it('reads Amharic templates too', () => {
    const am = { template: '{label}። {hint} መልስዎ፦ {value}።', required: 'ግዴታ ነው።', empty: 'ባዶ', unnamed: '' };
    expect(composeFieldText({ label: 'ስም (ግዴታ)', hint: '', value: '', required: true }, am)).toBe('ስም (ግዴታ)። መልስዎ፦ ባዶ።');
  });

  it('tidies spoken answers by field type', () => {
    expect(spokenKindOf('tel', '')).toBe('tel');
    expect(spokenKindOf('text', 'email')).toBe('email');
    expect(spokenKindOf('text', 'one-time-code')).toBe('code');
    expect(spokenKindOf('text', 'given-name')).toBe('text');
  });
});
