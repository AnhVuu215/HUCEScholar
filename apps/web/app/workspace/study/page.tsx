import type { Metadata } from 'next';
import { LibraryWorkspace } from '../../../components/library/library-workspace';
import { StudyDeck } from '../../../components/study/study-deck';
export const metadata: Metadata = { title: 'Thẻ ôn tập — HUCEScholar' };
export const dynamic = 'force-dynamic';
export default function StudyPage() {
  return (
    <LibraryWorkspace
      study
      title="Thẻ ôn tập"
      description="Câu hỏi bạn tự viết từ đoạn tô, để tự kiểm tra."
    >
      <StudyDeck />
    </LibraryWorkspace>
  );
}
