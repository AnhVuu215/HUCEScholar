'use client';

import { useEffect } from 'react';

export function PwaRegistration() {
  useEffect(() => {
    if (
      (process.env.NODE_ENV !== 'production' && process.env.NEXT_PUBLIC_ENABLE_PWA !== '1') ||
      !window.isSecureContext ||
      !('serviceWorker' in navigator)
    )
      return;
    // Progressive enhancement: registration failure must not block online work.
    void navigator.serviceWorker
      .register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(() => {});
  }, []);
  return null;
}
