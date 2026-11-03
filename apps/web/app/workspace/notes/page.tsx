import type { Metadata } from 'next';
import { LibraryWorkspace } from '../../../components/library/library-workspace';
import { NotesShelf } from '../../../components/notes/notes-shelf';
export const metadata: Metadata = { title: 'Vở ghi — HUCEScholar' };
export const dynamic = 'force-dynamic';
export default function NotesPage() {
  return (
    <LibraryWorkspace
      notes
      title="Vở ghi"
      description="Vở ghi chép tự do của riêng bạn: viết tay, gõ chữ, dán ảnh, trang trí và trích dẫn tài liệu."
    >
      <NotesShelf />
    </LibraryWorkspace>
  );
}
