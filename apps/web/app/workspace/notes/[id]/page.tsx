import type { Metadata } from 'next';
import { LibraryWorkspace } from '../../../../components/library/library-workspace';
import { NoteEditor } from '../../../../components/notes/note-editor';
export const metadata: Metadata = { title: 'Vở ghi — HUCEScholar' };
export const dynamic = 'force-dynamic';
export default async function NotebookPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const { id } = await params;
  const raw = (await searchParams).page;
  const page = typeof raw === 'string' && /^[1-9]\d{0,18}$/.test(raw) ? raw : null;
  return (
    <LibraryWorkspace
      notes
      title="Vở ghi"
      description="Mọi thay đổi được tự động lưu; chỉ mình bạn xem được vở này."
    >
      <NoteEditor key={id} notebookId={id} initialPageId={page} />
    </LibraryWorkspace>
  );
}
