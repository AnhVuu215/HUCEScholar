import type { Metadata } from 'next';
import { LibraryWorkspace } from '../../../components/library/library-workspace';
import { PersonalLibrary } from '../../../components/library/personal-library';
export const metadata: Metadata = { title: 'Thư viện của tôi — HUCEScholar' };
export default function Page() {
  return (
    <LibraryWorkspace
      personal
      title="Thư viện của tôi"
      description="Tài liệu đã lưu và tiến độ đọc riêng của bạn."
    >
      <PersonalLibrary />
    </LibraryWorkspace>
  );
}
