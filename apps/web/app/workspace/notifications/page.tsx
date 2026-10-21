import type { Metadata } from 'next';
import { LibraryWorkspace } from '../../../components/library/library-workspace';
import { NotificationList } from '../../../components/notifications/notification-list';
export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Thông báo — HUCEScholar' };
export default function Page() {
  return (
    <LibraryWorkspace
      account
      title="Thông báo"
      description="Kết quả kiểm tra file, duyệt học liệu và báo cáo của bạn."
    >
      <NotificationList />
    </LibraryWorkspace>
  );
}
