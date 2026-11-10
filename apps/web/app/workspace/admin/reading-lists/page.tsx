import type { Metadata } from 'next';
import { RoleWorkspace } from '../../../../components/auth/role-workspace';
import { ReadingListEditor } from '../../../../components/reading-lists/reading-list-editor';
export const metadata: Metadata = { title: 'Soạn danh sách đọc — HUCEScholar' };
export const dynamic = 'force-dynamic';
export default function AdminReadingListsPage() {
  return (
    <RoleWorkspace
      role="ADMIN"
      title="Soạn danh sách đọc"
      description="Sắp tài liệu đã công bố theo tuần hoặc chủ đề cho từng môn."
      activeSection="readingEditor"
    >
      <ReadingListEditor />
    </RoleWorkspace>
  );
}
