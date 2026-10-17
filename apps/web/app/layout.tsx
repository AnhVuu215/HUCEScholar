import type { Metadata, Viewport } from 'next';
import './globals.css';
import { PwaRegistration } from '../components/pwa/registration';
import { InstallProvider } from '../components/pwa/install-provider';
import { HistoryLeaveGuard } from '../components/history-leave-guard';

export const metadata: Metadata = {
  title: 'HUCEScholar — Không gian học liệu',
  description: 'Nền tảng học liệu HUCEScholar dành cho cộng đồng HUCE. Dự án đang phát triển.',
  robots: { index: false, follow: false },
  icons: { icon: '/icon.svg', apple: '/icons/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#001e42',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="vi">
      <body>
        <InstallProvider>
          <HistoryLeaveGuard />
          <PwaRegistration />
          {children}
        </InstallProvider>
      </body>
    </html>
  );
}
