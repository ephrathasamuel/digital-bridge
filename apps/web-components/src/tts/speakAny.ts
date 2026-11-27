import type { Lang } from '@db/shared-schemas';
import { spokenLang } from '../i18n/extraPack';
import { speakText, stopSpeaking } from '../voice/speech';
import { deviceVoiceFirst, fetchRemoteSpeech } from './voiceSource';

/**
 * Speaks any text with the best voice there is, in the same order as Read aloud: a device voice first when the
 * person's Voice choice allows it, else Digital Bridge clips, a downloaded browser voice or the voice server, and the
 * device voice as the last try. Used to read a person's own answer back (phones rarely have Amharic, Oromo,
 * Tigrinya or Somali voices, so the device voice alone often said nothing).
 */
let audio: HTMLAudioElement | null = null;

export async function speakAny(lang: Lang, text: string, onEnd?: () => void): Promise<boolean> {
  stopAny();
  if (!text.trim()) return false;
  const voiceLang = spokenLang(lang);
  if (deviceVoiceFirst() && speakText(lang, text, onEnd)) return true;
  const url = await fetchRemoteSpeech(text, voiceLang);
  if (url) {
    const clip = new Audio(url);
    audio = clip;
    const done = () => {
      URL.revokeObjectURL(url);
      if (audio === clip) audio = null;
      onEnd?.();
    };
    clip.onended = done;
    clip.onerror = done;
    try {
      await clip.play();
      return true;
    } catch {
      done();
      return false;
    }
  }
  return speakText(lang, text, onEnd);
}

export function stopAny(): void {
  stopSpeaking();
  audio?.pause();
  audio = null;
}
