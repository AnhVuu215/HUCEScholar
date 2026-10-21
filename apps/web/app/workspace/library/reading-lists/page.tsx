import type { Metadata } from 'next';
import { LibraryWorkspace } from '../../../../components/library/library-workspace';
import { ReadingListBrowser } from '../../../../components/reading-lists/reading-list-browser';
export const metadata: Metadata = { title: 'Danh sách đọc — HUCEScholar' };
export const dynamic = 'force-dynamic';
export default async function ReadingListsPage({
  searchParams,
}: {
  searchParams: Promise<{ courseId?: string | string[] }>;
}) {
  const courseId = (await searchParams).courseId;
  return (
    <LibraryWorkspace
      readingLists
      title="Danh sách đọc"
      description="Tài liệu giảng viên sắp xếp cho từng môn."
    >
      <ReadingListBrowser
        initialCourse={
          typeof courseId === 'string' && /^[1-9]\d{0,18}$/.test(courseId) ? courseId : undefined
        }
      />
    </LibraryWorkspace>
  );
}
