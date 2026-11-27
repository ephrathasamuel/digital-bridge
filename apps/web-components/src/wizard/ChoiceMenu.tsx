import React, { useEffect, useId, useRef, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cx, ui } from './ui';

export interface Choice {
  value: string;
  label: string;
  lang?: string;
}

/**
 * Our own picker instead of a native <select>: phones showed the plain system dialog, which ignored the colour
 * mode and the large touch targets. A button opens a list of choices right below it, in the page flow (it pushes
 * content down instead of covering it, and never runs past the screen edge). Disclosure pattern: the button has
 * aria-expanded, each choice is a button with aria-pressed, Escape closes and returns focus, arrows move between
 * choices.
 */
export const ChoiceMenu: React.FC<{
  label: string;
  value: string;
  choices: Choice[];
  onChoose: (value: string) => void;
  icon?: React.ReactNode;
  action?: string;
}> = ({ label, value, choices, onChoose, icon, action }) => {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const current = choices.find((c) => c.value === value) ?? choices[0];

  useEffect(() => {
    if (!open) return;
    const selected = listRef.current?.querySelector<HTMLButtonElement>('button[aria-pressed="true"]');
    (selected ?? listRef.current?.querySelector<HTMLButtonElement>('button'))?.focus();
  }, [open]);

  const close = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  const onListKey = (e: React.KeyboardEvent) => {
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    // Inside the widget's shadow root, the focused element is known to the root, not to document.
    const root = listRef.current?.getRootNode() as Document | ShadowRoot | undefined;
    const index = buttons.indexOf(root?.activeElement as HTMLButtonElement);
    const move = (to: number) => {
      e.preventDefault();
      buttons[(to + buttons.length) % buttons.length]?.focus();
    };
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'ArrowDown') move(index + 1);
    else if (e.key === 'ArrowUp') move(index - 1);
    else if (e.key === 'Home') move(0);
    else if (e.key === 'End') move(buttons.length - 1);
  };

  return (
    <div className="basis-full sm:basis-auto">
      <button
        ref={buttonRef}
        type="button"
        aria-expanded={open}
        aria-controls={listId}
        data-db-action={action}
        onClick={() => setOpen(!open)}
        className={cx(ui.btnSecondary, 'w-full max-w-full flex-nowrap sm:w-auto')}
      >
        {icon}
        <span className="shrink-0 font-semibold">{label}:</span>
        {/* One line: a long name ends with "…"; the whole name is in the list. */}
        <span lang={current?.lang} className="min-w-0 flex-1 truncate text-start">{current?.label}</span>
        <ChevronDown aria-hidden="true" focusable="false" className={cx('h-5 w-5 shrink-0 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="list"
          aria-label={label}
          onKeyDown={onListKey}
          className="mt-2 max-h-[min(22rem,60vh)] space-y-2 overflow-y-auto rounded-2xl border-2 border-stone-500 bg-white p-2 shadow-card"
        >
          {choices.map((choice) => {
            const selected = choice.value === value;
            return (
              <li key={choice.value}>
                <button
                  type="button"
                  aria-pressed={selected}
                  lang={choice.lang}
                  onClick={() => {
                    onChoose(choice.value);
                    close();
                  }}
                  className={cx(
                    'flex min-h-[48px] w-full items-center gap-3 rounded-xl border-2 px-3 py-2 text-start text-base font-semibold',
                    selected ? 'border-ink bg-sand-light text-ink' : 'border-transparent text-ink hover:border-stone-500',
                    'focus-visible:outline focus-visible:outline-[3px] focus-visible:outline-offset-2 focus-visible:outline-terracotta-dark',
                  )}
                >
                  {/* The chosen one gets a check mark from the aria-pressed style, so it never depends on colour. */}
                  <span className="min-w-0 break-words">{choice.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
};
