import type { Metadata } from 'next';
import { LibraryWorkspace } from '../../../../../components/library/library-workspace';
import { LibraryReader } from '../../../../../components/library/library-reader';
export const metadata: Metadata = { title: 'Đọc học liệu — HUCEScholar' };
export const dynamic = 'force-dynamic';
export default async function ReaderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <LibraryWorkspace
      title="Đọc học liệu"
      description="Đọc theo phiên bản; quyền truy cập được kiểm tra tại máy chủ."
    >
      <LibraryReader key={id} id={id} />
    </LibraryWorkspace>
  );
}
