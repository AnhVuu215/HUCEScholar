'use client';

import React, { forwardRef } from 'react';
import type { ComponentPropsWithRef } from 'react';

type ButtonProps = ComponentPropsWithRef<'button'> & {
  variant?: 'primary' | 'secondary' | 'quiet' | 'danger';
  size?: 'default' | 'form';
  pending?: boolean;
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'default',
    pending = false,
    type = 'button',
    className = '',
    disabled,
    children,
    ...props
  },
  ref
) {
  const classes = `${variant}-button control-${size} ${className}`.trim();
  return (
    <button
      {...props}
      ref={ref}
      type={type}
      className={classes}
      disabled={disabled || pending}
      aria-busy={pending || undefined}
    >
      {pending ? (
        <>
          <span aria-hidden="true" className="button-spinner" />
          <span style={{ opacity: 0 }}>{children}</span>
        </>
      ) : (
        children
      )}
    </button>
  );
});

export default Button;
