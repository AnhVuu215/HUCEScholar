import { AccountWorkspace } from '../../../components/account/account-workspace';
import { ProfileEditor } from '../../../components/account/profile-editor';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Hồ sơ của tôi — HUCEScholar' };
export default function ProfilePage() {
  return (
    <AccountWorkspace>
      <ProfileEditor />
    </AccountWorkspace>
  );
}
