import type { Metadata } from 'next';
import { LibraryWorkspace } from '../../../../../components/library/library-workspace';
import { LibraryReader } from '../../../../../components/library/library-reader';
import { parseCitationPage } from '../../../../../lib/citations';
export const metadata: Metadata = { title: 'Đọc học liệu — HUCEScholar' };
export const dynamic = 'force-dynamic';
export default async function ReaderPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string | string[]; find?: string | string[] }>;
}) {
  const { id } = await params;
  const { page: rawPage, find } = await searchParams;
  const initialPage = parseCitationPage(rawPage);
  const initialFind = typeof find === 'string' ? find.trim().slice(0, 100) : '';
  return (
    <LibraryWorkspace
      title="Đọc học liệu"
      description="Đọc theo phiên bản; quyền truy cập được kiểm tra tại máy chủ."
    >
      <LibraryReader
        key={`${id}:${JSON.stringify(rawPage)}:${initialFind}`}
        id={id}
        initialPage={initialPage}
        initialFind={initialFind}
      />
    </LibraryWorkspace>
  );
}
