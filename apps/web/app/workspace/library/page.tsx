import type { Metadata } from 'next';
import { LibraryWorkspace } from '../../../components/library/library-workspace';
import { LibraryCatalog } from '../../../components/library/library-catalog';
export const metadata: Metadata = { title: 'Kho học liệu — HUCEScholar' };
export const dynamic = 'force-dynamic';
export default function LibraryPage() {
  return (
    <LibraryWorkspace
      title="Kho học liệu"
      description="Tìm học liệu theo môn, xem nguồn và đọc phiên bản đã công bố."
    >
      <LibraryCatalog />
    </LibraryWorkspace>
  );
}
