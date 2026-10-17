'use client';

import { useId } from 'react';
import { highlightColors, type HighlightColor } from '../../lib/highlights';
import styles from './highlight-palette.module.css';

export function HighlightPalette({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (color: HighlightColor) => void;
}) {
  const name = useId();
  return (
    <fieldset className={styles.palette} disabled={disabled}>
      <legend>Màu tô sáng</legend>
      <div className={styles.choices}>
        {Object.entries(highlightColors).map(([color, label]) => (
          <label className={styles.option} key={color}>
            <input
              type="radio"
              name={name}
              value={color}
              checked={value === color}
              onChange={() => onChange(color as HighlightColor)}
            />
            <span className={styles.swatch} style={{ backgroundColor: color }} aria-hidden="true">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none">
                <path
                  d="m5 12 4 4L19 6"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span>{label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
