import type { Metadata } from 'next';
import { LibraryWorkspace } from '../../../components/library/library-workspace';
import { CalendarBoard } from '../../../components/calendar/calendar-board';
export const metadata: Metadata = { title: 'Lịch học — HUCEScholar' };
export const dynamic = 'force-dynamic';
export default function CalendarPage() {
  return (
    <LibraryWorkspace
      calendar
      title="Lịch học"
      description="Buổi học và việc cần làm của riêng bạn, mở thẳng đúng trang tài liệu."
    >
      <CalendarBoard />
    </LibraryWorkspace>
  );
}
