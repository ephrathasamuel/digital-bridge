import React, { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import type { Lang } from '@db/shared-schemas';
import { t } from '../i18n';
import { ui } from '../wizard/ui';
import { spokenLang } from '../i18n/extraPack';
import { BROWSER_VOICES, browserVoiceInstalled, installBrowserVoice } from './browserVoice';

/**
 * Offered in the "reading on screen" panel when the device has no voice: downloads the open MMS voice for the
 * language into this browser, only when the person asks (never on page load, it is about 115 MB).
 */
export const VoiceDownload: React.FC<{ lang: Lang; announce?: (message: string) => void; onReady: () => void }> = ({
  lang, announce, onReady,
}) => {
  const voiceLang = spokenLang(lang);
  const [state, setState] = useState<'checking' | 'offer' | 'loading' | 'failed' | 'installed'>('checking');
  const [percent, setPercent] = useState(0);

  useEffect(() => {
    let live = true;
    void browserVoiceInstalled(voiceLang).then((ok) => live && setState(ok ? 'installed' : 'offer'));
    return () => {
      live = false;
    };
  }, [voiceLang]);

  if (state === 'checking' || state === 'installed') return null;

  const download = async () => {
    setState('loading');
    setPercent(0);
    try {
      let shown = -10;
      await installBrowserVoice(voiceLang, (p) => {
        setPercent(p);
        if (p >= shown + 25) {
          shown = p;
          announce?.(t(lang, 'voice.downloading', { percent: p }));
        }
      });
      announce?.(t(lang, 'voice.ready'));
      setState('installed');
      onReady();
    } catch {
      setState('failed');
      announce?.(t(lang, 'voice.failed'));
    }
  };

  return (
    <div className="mt-3 rounded-xl bg-stone-50 p-3">
      {state === 'loading' ? (
        <>
          <label className="block text-sm font-semibold text-ink" htmlFor={`db-voice-progress-${voiceLang}`}>
            {t(lang, 'voice.downloading', { percent })}
          </label>
          <progress id={`db-voice-progress-${voiceLang}`} className="mt-2 w-full" max={100} value={percent} />
        </>
      ) : (
        <>
          <button type="button" onClick={() => void download()} className={ui.btnPill}>
            <Download aria-hidden="true" focusable="false" className="h-5 w-5 shrink-0" />
            {t(lang, 'voice.download', { size: BROWSER_VOICES[voiceLang] })}
          </button>
          {state === 'failed' && (
            <p role="alert" className="mt-2 text-sm font-semibold text-terracotta-dark">
              {t(lang, 'voice.failed')}
            </p>
          )}
        </>
      )}
      <p className="mt-2 text-sm text-stone-700">{t(lang, 'voice.downloadNote')}</p>
    </div>
  );
};
