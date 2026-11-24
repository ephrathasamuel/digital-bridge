import React, { type ReactNode } from 'react';
import { parseVoiceSource, setVoiceConfig } from '../tts/voiceSource';
import { createRoot, type Root } from 'react-dom/client';
import { DB_EVENTS, isExtraLang, type OnboardingProfile } from '@db/shared-schemas';
import { activeExtraLang, loadExtraPack, machineNote, setExtraPack } from '../i18n/extraPack';
import styles from '../styles/index.css?inline';
import { isVisionMode, setVisionMode } from '../wizard/vision';

const privateSupportKeys = /^(support|supportPreferences|accommodations|adjustmentRequest|filters|needs)$/i;

function hasSupportSharingConsent(value: unknown, visited = new WeakSet<object>()): boolean {
  if (typeof value !== 'object' || value === null || visited.has(value)) return false;
  visited.add(value);
  return Object.entries(value).some(([key, nested]) => {
    if (/^(shareConsent|shareWithEmployers|shareSupportWithEmployer)$/i.test(key) && nested === true) return true;
    return hasSupportSharingConsent(nested, visited);
  });
}

function redactPrivateSupportData(value: unknown, visited = new WeakMap<object, unknown>()): unknown {
  if (typeof value !== 'object' || value === null) return value;
  const existing = visited.get(value);
  if (existing !== undefined) return existing;

  if (Array.isArray(value)) {
    const copy: unknown[] = [];
    visited.set(value, copy);
    value.forEach((item) => copy.push(redactPrivateSupportData(item, visited)));
    return copy;
  }

  const copy: Record<string, unknown> = {};
  visited.set(value, copy);
  for (const [key, nested] of Object.entries(value)) {
    copy[key] = privateSupportKeys.test(key) ? '[redacted]' : redactPrivateSupportData(nested, visited);
  }
  return copy;
}

/**
 * API used by hosted pages that set no api-url. Build with VITE_DB_API_URL=https://your-api.example/api/v1 to point
 * the widgets at your own deployment.
 */
const HOSTED_API_URL: string = import.meta.env.VITE_DB_API_URL || 'https://digital-bridge-api.onrender.com/api/v1';

export abstract class ReactShadowElement extends HTMLElement {
  static version = '1.0.0';
  static get observedAttributes(): string[] {
    return ['api', 'api-url', 'partner-id', 'lang', 'theme', 'mode', 'lti-token', 'session-id', 'audio-base-url', 'vision', 'voice', 'voice-url'];
  }

  private reactRoot?: Root;
  private mountPoint?: HTMLDivElement;
  private noteEl?: HTMLParagraphElement;

  connectedCallback(): void {
    if (!this.shadowRoot) {
      const shadow = this.attachShadow({ mode: 'open' });
      const style = document.createElement('style');
      style.textContent = styles;
      this.mountPoint = document.createElement('div');
      this.mountPoint.setAttribute('part', 'root');
      shadow.append(style, this.mountPoint);
    } else {
      this.mountPoint = this.shadowRoot.querySelector<HTMLDivElement>('[part="root"]') ?? undefined;
    }

    if (!this.mountPoint) {
      throw new Error('The widget shadow root is missing its mount point.');
    }

    this.mountPoint.lang = this.currentLang;
    this.applyVisionAttribute();
    this.applyVoiceAttributes();
    this.reactRoot ??= createRoot(this.mountPoint);
    this.renderWidget();
    void this.prepareRuntime();
    void this.applyExtraLang();
  }

  attributeChangedCallback(): void {
    this.applyVisionAttribute();
    this.applyVoiceAttributes();
    if (this.mountPoint && this.reactRoot) {
      this.mountPoint.lang = this.currentLang;
      this.renderWidget();
      void this.prepareRuntime();
      void this.applyExtraLang();
    }
  }

  /** lang="om|ti|so|sw|aa": load the saved translation from the API, then draw again in that language. */
  private async applyExtraLang(): Promise<void> {
    const wanted = (this.getAttribute('lang') || '').toLowerCase();
    if (!isExtraLang(wanted)) {
      this.showMachineNote(null);
      return;
    }
    if (activeExtraLang() !== wanted) setExtraPack(null);
    const ok = await loadExtraPack(wanted, this.apiUrl);
    if (!ok || !this.mountPoint || (this.getAttribute('lang') || '').toLowerCase() !== wanted) return;
    this.mountPoint.lang = wanted;
    this.showMachineNote(wanted);
    this.renderWidget();
  }

  private showMachineNote(lang: Parameters<typeof machineNote>[0] | null): void {
    if (!lang) {
      this.noteEl?.remove();
      this.noteEl = undefined;
      return;
    }
    if (!this.noteEl) {
      this.noteEl = document.createElement('p');
      this.noteEl.setAttribute('part', 'machine-note');
      this.noteEl.lang = 'en';
      this.noteEl.style.cssText = 'margin:0 0 .5rem;font-size:.875rem';
      this.mountPoint?.before(this.noteEl);
    }
    this.noteEl.textContent = machineNote(lang);
  }

  /** voice="auto|device|server|custom" and voice-url pick where read aloud audio comes from (tts/voiceSource.ts). */
  private applyVoiceAttributes(): void {
    setVoiceConfig({
      source: parseVoiceSource(this.getAttribute('voice')),
      apiUrl: this.apiUrl,
      customUrl: this.getAttribute('voice-url') || undefined,
    });
  }

  disconnectedCallback(): void {
    this.reactRoot?.unmount();
    this.reactRoot = undefined;
    this.mountPoint = undefined;
  }

  /** vision="colorblind-safe" | "high-contrast" | "dark" | "terracotta": colour mode for every widget on the page. */
  private applyVisionAttribute(): void {
    const vision = this.getAttribute('vision');
    if (isVisionMode(vision)) setVisionMode(vision);
  }

  protected get currentLang(): 'en' | 'am' {
    return this.getAttribute('lang') === 'am' ? 'am' : 'en';
  }

  protected get apiUrl(): string | undefined {
    const explicit = this.getAttribute('api') || this.getAttribute('api-url');
    if (explicit) return explicit.replace(/\/+$/, '');
    if (typeof window === 'undefined') return undefined;
    const hostname = window.location.hostname.toLowerCase();
    const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
    return isLocalhost ? undefined : HOSTED_API_URL;
  }

  protected get partnerId(): string {
    return this.getAttribute('partner-id') || 'alx-demo';
  }

  /** Base URL that holds audio/am/manifest.json with recorded Amharic prompts (optional). */
  protected get audioBaseUrl(): string | undefined {
    return this.getAttribute('audio-base-url') || undefined;
  }

  protected get theme(): 'terracotta' | 'high-contrast' {
    return this.getAttribute('theme') === 'high-contrast' ? 'high-contrast' : 'terracotta';
  }

  protected dispatchHostEvent(name: string, detail: unknown, profile?: OnboardingProfile): void {
    // Guide v2 events are created once, by WizardShell (SIGNUP_EVENTS). Here they only get a privacy guard:
    // 'db-signup:support' never leaves the widget unless the learner chose to share support with their provider,
    // and 'db-signup:done' never carries support data.
    if (name === 'db-signup:support' && profile?.support?.tellLearningProvider !== true) return;
    if (name === 'db-signup:done') {
      this.dispatchEvent(new CustomEvent(name, { detail: redactPrivateSupportData(detail), bubbles: true, composed: true }));
      return;
    }
    const safeDetail =
      hasSupportSharingConsent(detail) || profile?.support?.tellLearningProvider === true
        ? detail
        : redactPrivateSupportData(detail);
    this.dispatchEvent(new CustomEvent(name, { detail: safeDetail, bubbles: true, composed: true }));
  }

  protected render(node: ReactNode): void {
    this.reactRoot?.render(node);
  }

  protected abstract renderWidget(): void;
  protected abstract prepareRuntime(): Promise<void>;
}
