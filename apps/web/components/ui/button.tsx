'use client';

import type { ComponentPropsWithRef } from 'react';

type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  size?: 'default' | 'form';
  pending?: boolean;
};

export function Button({
  variant = 'secondary',
  size = 'default',
  pending = false,
  type = 'button',
  className = '',
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      type={type}
      className={`${variant}-button control-${size} ${className}`.trim()}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    />
  );
}
