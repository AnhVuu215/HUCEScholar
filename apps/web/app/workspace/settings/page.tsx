import Link from 'next/link';
import { AccountWorkspace } from '../../../components/account/account-workspace';
import { ChangePasswordForm } from '../../../components/auth/change-password-form';
import { ReaderPreferencesForm } from '../../../components/account/reader-preferences';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Cài đặt — HUCEScholar' };
export default function SettingsPage() {
  return (
    <AccountWorkspace settings>
      <p>
        <Link href="/workspace/profile">Về hồ sơ của tôi</Link>
      </p>
      <ChangePasswordForm />
      <ReaderPreferencesForm />
    </AccountWorkspace>
  );
}
