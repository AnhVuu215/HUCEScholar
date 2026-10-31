'use client';
import { useId, useState } from 'react';
import { ApiError } from '../../lib/auth';
import { calendarError, exportCalendar } from '../../lib/calendar';

/**
 * CAL-05: download the calendar as an `.ics` file to import into Google Calendar or another app.
 * The file leaves HUCEScholar, so notes and document titles stay out unless the owner ticks them in.
 */
export function CalendarExport() {
  const id = useId();
  const [details, setDetails] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState('');
  async function save() {
    setPending(true);
    setMessage('');
    try {
      const file = await exportCalendar(details);
      const url = URL.createObjectURL(file.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = file.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      setMessage('Đã tạo file lịch. Mở Google Calendar → Cài đặt → Nhập và xuất để nhập file.');
    } catch (failure) {
      setMessage(
        failure instanceof ApiError
          ? calendarError(failure)
          : 'Chưa tải được file lịch. Kiểm tra kết nối rồi thử lại.',
      );
    } finally {
      setPending(false);
    }
  }
  return (
    <aside className="calendar-tasks calendar-export" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Xuất sang lịch khác</h2>
      <p className="field-hint">
        Tải một file <code>.ics</code> gồm mọi lịch học, kể cả chuỗi lặp, và việc cần làm có hạn
        chưa xong. File là bản chụp tại lúc tải; sửa lịch ở đây sau đó không tự cập nhật sang lịch
        kia.
      </p>
      <label className="calendar-check">
        <input type="checkbox" checked={details} onChange={(e) => setDetails(e.target.checked)} />
        Kèm ghi chú và tên tài liệu liên kết
      </label>
      <p className="field-hint">
        {details
          ? 'Ghi chú, tên tài liệu và đường dẫn tới trang sẽ nằm trong file và ở lịch bạn nhập vào.'
          : 'Chỉ có tiêu đề và thời gian.'}
      </p>
      <button
        type="button"
        className="secondary-button"
        disabled={pending}
        onClick={() => void save()}
      >
        {pending ? 'Đang tạo…' : 'Tải file .ics'}
      </button>
      {message && (
        <p role="status" className="field-hint">
          {message}
        </p>
      )}
    </aside>
  );
}
