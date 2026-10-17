'use client';

import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type InstallEvent = Event & {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};
export type InstallStatus =
  'idle' | 'prompting' | 'accepted' | 'dismissed' | 'failed' | 'installed' | 'standalone';
const InstallContext = createContext<{
  status: InstallStatus;
  available: boolean;
  install(): Promise<void>;
} | null>(null);

// The offer belongs to the document, so keep it above App Router page transitions.
export function InstallProvider({ children }: { children: ReactNode }) {
  const [offer, setOffer] = useState<InstallEvent | null>(null);
  const [status, setStatus] = useState<InstallStatus>('idle');
  const pending = useRef(false);
  useEffect(() => {
    const media = window.matchMedia('(display-mode: standalone)');
    const standalone = () => {
      if (media.matches || (navigator as Navigator & { standalone?: boolean }).standalone) {
        setStatus('standalone');
        setOffer(null);
      }
    };
    const available = (event: Event) => {
      event.preventDefault();
      setOffer(event as InstallEvent);
      setStatus((current) =>
        current === 'standalone' || current === 'installed' ? current : 'idle',
      );
    };
    const installed = () => {
      setStatus((current) => (current === 'standalone' ? current : 'installed'));
      setOffer(null);
    };
    standalone();
    media.addEventListener('change', standalone);
    window.addEventListener('beforeinstallprompt', available);
    window.addEventListener('appinstalled', installed);
    return () => {
      media.removeEventListener('change', standalone);
      window.removeEventListener('beforeinstallprompt', available);
      window.removeEventListener('appinstalled', installed);
    };
  }, []);

  async function install() {
    if (!offer || pending.current || status === 'installed' || status === 'standalone') return;
    pending.current = true;
    setStatus('prompting');
    try {
      await offer.prompt();
      const choice = await offer.userChoice;
      setStatus((current) =>
        current === 'installed' || current === 'standalone' ? current : choice.outcome,
      );
    } catch {
      setStatus((current) =>
        current === 'installed' || current === 'standalone' ? current : 'failed',
      );
    } finally {
      pending.current = false;
      setOffer(null);
    }
  }

  return (
    <InstallContext.Provider value={{ status, available: !!offer, install }}>
      {children}
    </InstallContext.Provider>
  );
}

export function useInstall() {
  const context = useContext(InstallContext);
  if (!context) throw new Error('InstallProvider required');
  return context;
}
