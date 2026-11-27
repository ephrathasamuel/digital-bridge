import React from 'react';
import { cx } from './ui';

export interface Choice {
  value: string;
  label: string;
  lang?: string;
}

/**
 * A row of choice buttons that scrolls sideways on phones (like the portal's Home / Sign up tabs), instead of a
 * drop down: phones showed the system dialog for <select>, and a long chosen name pushed the page past the screen.
 * Each choice is a button with aria-pressed; the chosen one is filled and gets a check mark. "even" makes every
 * button the same size with up to two lines of text (colours, voices).
 */
export const ChoiceMenu: React.FC<{
  label: string;
  value: string;
  choices: Choice[];
  onChoose: (value: string) => void;
  icon?: React.ReactNode;
  action?: string;
  even?: boolean;
}> = ({ label, value, choices, onChoose, icon, action, even }) => (
  <div role="group" aria-label={label} className="w-full min-w-0 basis-full">
    <p className="mb-1 flex items-center gap-2 text-sm font-semibold text-ink">
      {icon}
      {label}
    </p>
    <div className="flex w-full min-w-0 snap-x gap-2 overflow-x-auto overscroll-x-contain pb-2">
      {choices.map((choice) => {
        const selected = choice.value === value;
        return (
          <button
            key={choice.value}
            type="button"
            lang={choice.lang}
            aria-pressed={selected}
            data-db-action={selected ? undefined : action}
            onClick={() => onChoose(choice.value)}
            className={cx(
              'shrink-0 snap-start rounded-2xl border-2 px-3 py-2 text-sm font-semibold leading-tight',
              'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-terracotta-dark',
              even ? 'flex min-h-[3.5rem] w-56 items-center justify-center text-center' : 'min-h-[44px] whitespace-nowrap',
              selected ? 'border-ink bg-ink text-white' : 'border-terracotta bg-white text-terracotta-dark hover:bg-terracotta-tint',
            )}
          >
            <span className={even ? 'line-clamp-2' : undefined}>{choice.label}</span>
          </button>
        );
      })}
    </div>
  </div>
);
