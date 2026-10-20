'use client';

import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}
interface SelectFieldProps {
  id: string;
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  disabled?: boolean;
  error?: string;
  hint?: string;
  size?: 'default' | 'form';
  name?: string;
}

export function SelectField({
  id,
  label,
  value,
  options,
  onChange,
  disabled = false,
  error,
  hint,
  size = 'form',
  name,
}: SelectFieldProps) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const search = useRef({ text: '', time: 0 });
  const selected = options.findIndex((option) => option.value === value);
  const visible = open && !disabled;
  const listId = `${id}-options`;
  const enabled = options
    .map((option, index) => (!option.disabled ? index : -1))
    .filter((index) => index >= 0);

  function show(index = selected) {
    setActive(enabled.includes(index) ? index : (enabled[0] ?? -1));
    search.current = { text: '', time: 0 };
    setOpen(true);
  }
  function choose(index: number) {
    const option = options[index];
    if (!option || option.disabled || disabled) return;
    if (option.value !== value) onChange(option.value);
    setOpen(false);
    trigger.current?.focus();
  }

  useLayoutEffect(() => {
    if (!visible) return;
    function position() {
      const button = trigger.current,
        list = popup.current;
      if (!button || !list) return;
      const rect = button.getBoundingClientRect();
      const viewport = window.visualViewport;
      const left = viewport?.offsetLeft ?? 0,
        top = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? innerWidth,
        height = viewport?.height ?? innerHeight;
      if (rect.bottom < top || rect.top > top + height) {
        setOpen(false);
        return;
      }
      const below = Math.max(0, top + height - rect.bottom - 12);
      const above = Math.max(0, rect.top - top - 12);
      const up = below < Math.min(280, list.scrollHeight) && above > below;
      const available = Math.min(280, up ? above : below);
      const listWidth = Math.min(Math.max(rect.width, 200), Math.max(0, width - 16));
      list.style.width = `${listWidth}px`;
      list.style.maxHeight = `${available}px`;
      list.style.left = `${Math.max(left + 8, Math.min(rect.left, left + width - listWidth - 8))}px`;
      list.style.top = `${up ? Math.max(top + 8, rect.top - Math.min(list.scrollHeight, available) - 6) : rect.bottom + 6}px`;
    }
    position();
    const observer = new ResizeObserver(position);
    if (trigger.current) observer.observe(trigger.current);
    window.addEventListener('resize', position);
    window.addEventListener('scroll', position, true);
    window.visualViewport?.addEventListener('resize', position);
    window.visualViewport?.addEventListener('scroll', position);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', position);
      window.removeEventListener('scroll', position, true);
      window.visualViewport?.removeEventListener('resize', position);
      window.visualViewport?.removeEventListener('scroll', position);
    };
  }, [visible, options.length]);

  useEffect(() => {
    if (!visible) return;
    function outside(event: PointerEvent) {
      if (
        event.target instanceof Node &&
        !trigger.current?.contains(event.target) &&
        !popup.current?.contains(event.target)
      )
        setOpen(false);
    }
    document.addEventListener('pointerdown', outside);
    return () => document.removeEventListener('pointerdown', outside);
  }, [visible]);

  useEffect(() => {
    if (visible)
      popup.current
        ?.querySelector(`[data-option-index="${active}"]`)
        ?.scrollIntoView({ block: 'nearest' });
  }, [visible, active]);

  function keyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const key = event.key;
    if (key === 'Tab') {
      setOpen(false);
      return;
    }
    if (key === 'Escape' && visible) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (key === 'Enter' || key === ' ') {
      event.preventDefault();
      if (visible) choose(active);
      else show();
      return;
    }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key)) {
      event.preventDefault();
      if (key === 'Home') {
        show(enabled[0]);
        return;
      }
      if (key === 'End') {
        show(enabled.at(-1));
        return;
      }
      const current = enabled.indexOf(visible ? active : selected);
      const next =
        key === 'ArrowDown' ? Math.min(enabled.length - 1, current + 1) : Math.max(0, current - 1);
      if (!visible) show(enabled[next]);
      else setActive(enabled[next] ?? -1);
      return;
    }
    if (key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      const now = Date.now();
      const previous = now - search.current.time < 700 ? search.current.text : '';
      const text = (previous + key).toLocaleLowerCase('vi');
      search.current = { text, time: now };
      const start = visible ? active : selected;
      const order = [...enabled.filter((i) => i > start), ...enabled.filter((i) => i <= start)];
      const match = order.find((i) => options[i].label.toLocaleLowerCase('vi').startsWith(text));
      if (match !== undefined) {
        setActive(match);
        setOpen(true);
      }
    }
  }

  return (
    <div className={`select-field select-field--${size}`}>
      <label id={`${id}-label`} htmlFor={id}>
        {label}
      </label>
      {name && <input type="hidden" name={name} value={value} disabled={disabled} />}
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-labelledby={`${id}-label`}
        aria-expanded={visible}
        aria-controls={visible ? listId : undefined}
        aria-haspopup="listbox"
        aria-activedescendant={visible && options[active] ? `${id}-option-${active}` : undefined}
        aria-invalid={!!error || undefined}
        aria-describedby={error || hint ? `${id}-message` : undefined}
        disabled={disabled}
        className="select-field-trigger"
        onClick={() => (visible ? setOpen(false) : show())}
        onKeyDown={keyDown}
        onBlur={() => setOpen(false)}
      >
        <span>{options[selected]?.label ?? 'Chọn giá trị'}</span>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="m6 9 6 6 6-6"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </button>
      {(error || hint) && (
        <p id={`${id}-message`} className="field-hint" role={error ? 'alert' : undefined}>
          {error || hint}
        </p>
      )}
      {visible &&
        createPortal(
          <div
            ref={popup}
            id={listId}
            role="listbox"
            aria-labelledby={`${id}-label`}
            className="select-field-popup"
            onMouseDown={(event) => event.preventDefault()}
          >
            {options.map((option, index) => (
              <div
                key={option.value}
                id={`${id}-option-${index}`}
                role="option"
                aria-selected={option.value === value}
                aria-disabled={option.disabled || undefined}
                data-active={index === active}
                data-option-index={index}
                onPointerMove={() => !option.disabled && setActive(index)}
                onClick={() => choose(index)}
              >
                <span>{option.label}</span>
                {option.value === value && (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="m5 12 4 4L19 6"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                )}
              </div>
            ))}
          </div>,
          document.body,
        )}
    </div>
  );
}
