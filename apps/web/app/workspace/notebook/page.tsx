import type { Metadata } from 'next';
import { LibraryWorkspace } from '../../../components/library/library-workspace';
import { LibraryNotebook } from '../../../components/library/library-notebook';
export const metadata: Metadata = { title: 'Sổ tay — HUCEScholar' };
export default function NotebookPage() {
  return (
    <LibraryWorkspace
      notebook
      title="Sổ tay"
      description="Tìm lại ghi chú và đoạn tô của bạn trên mọi tài liệu, lọc theo môn."
    >
      <LibraryNotebook />
    </LibraryWorkspace>
  );
}
