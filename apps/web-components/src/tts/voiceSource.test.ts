import { afterEach, describe, expect, it, vi } from 'vitest';
import { deviceVoiceFirst, fetchRemoteSpeech, parseVoiceSource, setVoiceConfig, getVoiceConfig } from './voiceSource';

const audio = (status = 200, type = 'audio/mpeg') =>
  vi.fn().mockResolvedValue(new Response(status === 200 ? new Blob(['x'], { type }) : null, { status, headers: { 'content-type': type } }));

describe('read aloud voice source', () => {
  afterEach(() => vi.restoreAllMocks());

  it('accepts only known sources and defaults to auto', () => {
    expect(parseVoiceSource('server')).toBe('server');
    expect(parseVoiceSource('nonsense')).toBe('auto');
    expect(parseVoiceSource(null)).toBe('auto');
  });

  it('uses a voice-url as the custom source when the page sets no voice attribute', () => {
    setVoiceConfig({ source: 'auto', customUrl: 'https://tts.example/speak' });
    expect(getVoiceConfig().source).toBe('custom');
    expect(deviceVoiceFirst()).toBe(false);
    setVoiceConfig({ source: 'auto' });
    expect(deviceVoiceFirst()).toBe(true);
  });

  it('asks our API for Amharic speech and returns playable audio', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:voice');
    const fetcher = audio();
    const url = await fetchRemoteSpeech('ሰላም', 'am', { source: 'server', apiUrl: 'https://api.example/api/v1/' }, fetcher);
    expect(url).toBe('blob:voice');
    expect(fetcher.mock.calls[0][0]).toBe('https://api.example/api/v1/voice/speak');
    expect(JSON.parse(fetcher.mock.calls[0][1].body)).toEqual({ text: 'ሰላም', lang: 'am' });
  });

  it('fills {text} and {lang} in a custom GET url', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:voice');
    const fetcher = audio();
    await fetchRemoteSpeech('hi there', 'en', { source: 'custom', customUrl: 'https://tts.example/?t={text}&l={lang}' }, fetcher);
    expect(fetcher.mock.calls[0][0]).toBe('https://tts.example/?t=hi%20there&l=en');
    expect(fetcher.mock.calls[0][1].method).toBe('GET');
  });

  it('never calls out for device only, and falls back quietly on errors or non audio replies', async () => {
    const fetcher = audio();
    expect(await fetchRemoteSpeech('x', 'en', { source: 'device', apiUrl: 'https://api.example' }, fetcher)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
    expect(await fetchRemoteSpeech('x', 'en', { source: 'server', apiUrl: 'https://a.example' }, vi.fn().mockRejectedValue(new TypeError('offline')))).toBeNull();
    expect(await fetchRemoteSpeech('x', 'en', { source: 'server', apiUrl: 'https://b.example' }, audio(200, 'application/json'))).toBeNull();
  });

  it('stops asking an API that has no voice provider (501)', async () => {
    const fetcher = audio(501, 'application/json');
    const cfg = { source: 'server' as const, apiUrl: 'https://none.example' };
    expect(await fetchRemoteSpeech('x', 'en', cfg, fetcher)).toBeNull();
    expect(await fetchRemoteSpeech('y', 'en', cfg, fetcher)).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
