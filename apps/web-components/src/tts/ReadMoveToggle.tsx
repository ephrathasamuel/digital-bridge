import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Navigation } from 'lucide-react';
import type { Lang } from '@db/shared-schemas';
import { t } from '../i18n';
import { ui } from '../wizard/ui';
import { spokenLang } from '../i18n/extraPack';
import { speakText } from '../voice/speech';
import { describeElement, keepsArrow, neighbourCell, tableCellOf } from '../assist/fields';
import { deviceVoiceFirst, fetchRemoteSpeech } from './voiceSource';

/** Remembered across steps and visits, like the other help settings. */
const STORE = 'db-read-move';
/** Everything a person can reach on the step (the same items the Tab key reaches). */
const STOPS = 'a[href], button, input:not([type="hidden"]), select, textarea, summary, [tabindex]:not([tabindex="-1"])';
function readSaved(): boolean {
  try {
    return localStorage.getItem(STORE) === 'on';
  } catch {
    return false;
  }
}

export interface ReadMoveToggleProps {
  lang: Lang;
  announce: (message: string) => void;
  /** Any element inside the step or widget; the area the arrows move through is its closest <section>. */
  anchor: React.RefObject<HTMLElement | null>;
  /** Where the caption panel renders (after all help buttons, so focus order stays the same on every step). */
  panelSlot?: HTMLElement | null;
}

/**
 * Read as I move (the help bar's mode, inside the widget): the arrow keys step through the boxes and buttons of the
 * step, and each one is highlighted and read aloud as it is reached, by arrow or by Tab. A caption panel shows the
 * words, so it also works with the sound off. Voices: the device voice for the language, else the voice server, else
 * words only (never an English voice for another language).
 */
export const ReadMoveToggle: React.FC<ReadMoveToggleProps> = ({ lang, announce, anchor, panelSlot }) => {
  const [on, setOn] = useState(readSaved);
  const [caption, setCaption] = useState('');
  const runRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const markedRef = useRef<Element | null>(null);

  const silence = () => {
    runRef.current += 1;
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
    audioRef.current?.pause();
    audioRef.current = null;
  };

  const say = async (text: string) => {
    silence();
    setCaption(text);
    if (!text) return;
    const run = runRef.current;
    if (deviceVoiceFirst() && speakText(lang, text)) return;
    const url = await fetchRemoteSpeech(text, spokenLang(lang));
    if (run !== runRef.current) {
      if (url) URL.revokeObjectURL(url);
      return; // the person already moved on
    }
    if (url) {
      const audio = new Audio(url);
      audioRef.current = audio;
      audio.onended = () => URL.revokeObjectURL(url);
      void audio.play().catch(() => undefined);
      return;
    }
    if (!deviceVoiceFirst()) speakText(lang, text); // server first, the device voice if it failed; else words only
  };

  const words = () => ({
    field: { template: t(lang, 'assist.fieldText'), required: t(lang, 'assist.required'), empty: t(lang, 'assist.empty'), unnamed: t(lang, 'assist.unnamed') },
    button: t(lang, 'assist.button'),
    link: t(lang, 'assist.link'),
    cell: t(lang, 'assist.cell'),
    headCell: t(lang, 'assist.headCell'),
    emptyCell: t(lang, 'assist.emptyCell'),
    checked: t(lang, 'vc.checked'),
    unchecked: t(lang, 'vc.unchecked'),
  });

  const unmark = () => {
    markedRef.current?.removeAttribute('data-vc-reading');
    markedRef.current = null;
  };

  useEffect(() => {
    try {
      localStorage.setItem(STORE, on ? 'on' : 'off');
    } catch {
      // Storage blocked: the setting lasts until the page closes.
    }
    const step = anchor.current?.closest('section');
    if (!on || !step) return;

    const visible = (node: Element) => {
      const box = node.getBoundingClientRect();
      return box.width > 0 && box.height > 0 && !(node as HTMLInputElement).disabled;
    };
    const onFocus = (event: FocusEvent) => {
      const target = event.target as Element | null;
      if (!target || target.closest('[data-db-read-move-panel]')) return;
      unmark();
      target.setAttribute('data-vc-reading', 'true');
      markedRef.current = target;
      void say(describeElement(target, words()));
    };
    const onKey = (event: KeyboardEvent) => {
      if (!event.key.startsWith('Arrow') || event.altKey || event.ctrlKey || event.metaKey) return;
      const current = (step.getRootNode() as ShadowRoot | Document).activeElement ?? null;
      if (current && keepsArrow(current, event.key)) return; // arrows keep their normal job inside fields and lists
      const key = event.key as 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight';
      const forward = key === 'ArrowDown' || key === 'ArrowRight';
      const cell = tableCellOf(current);
      let next: HTMLElement | null | undefined = cell ? neighbourCell(cell, key) : null;
      if (!next) {
        const list = Array.from(step.querySelectorAll<HTMLElement>(STOPS)).filter(visible);
        const index = current ? list.indexOf(current as HTMLElement) : -1;
        next = index < 0 ? (forward ? list[0] : list[list.length - 1]) : list[index + (forward ? 1 : -1)];
      }
      if (!next) return;
      event.preventDefault();
      next.focus();
      next.scrollIntoView?.({ block: 'nearest' });
    };
    step.addEventListener('focusin', onFocus);
    step.addEventListener('keydown', onKey);
    return () => {
      step.removeEventListener('focusin', onFocus);
      step.removeEventListener('keydown', onKey);
      unmark();
      silence();
    };
  }, [on, lang]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => {
    const next = !on;
    setOn(next);
    if (next) {
      void say(t(lang, 'assist.readMoveHint'));
    } else {
      silence();
      setCaption('');
      announce(t(lang, 'help.stopped'));
    }
  };

  const panel = on ? (
    <div data-db-read-move-panel="" className="mt-3 basis-full rounded-2xl border-2 border-terracotta bg-white p-4 shadow-card">
      <p className="text-sm font-semibold text-terracotta-dark">{t(lang, 'assist.readMove')}</p>
      {/* The screen reader already reads the focused item, so the caption is for eyes only (no live region). */}
      <p className="mt-2 text-[1.375rem] leading-relaxed text-ink" data-db-read-move-caption="">{caption}</p>
    </div>
  ) : null;

  return (
    <>
      <button
        type="button"
        onClick={toggle}
        aria-pressed={on}
        data-db-action="read-move"
        className={ui.btnPillToggle(on)}
      >
        <Navigation aria-hidden="true" focusable="false" className="h-5 w-5 shrink-0" />
        {t(lang, 'assist.readMove')}
      </button>
      {panel && (panelSlot ? createPortal(panel, panelSlot) : panel)}
    </>
  );
};
