'use client';
import { useId, useRef, useState } from 'react';
import { ApiError } from '../../lib/auth';
import { calendarError, importCalendar, type CalendarImportResult } from '../../lib/calendar';

const MAX_BYTES = 512 * 1024;

/**
 * CAL-07: adds the sessions and tasks of an `.ics` file from another calendar. Each event is added
 * once, so importing the same file again changes nothing; what does not fit is listed.
 */
export function CalendarImport({ imported }: { imported: () => void }) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<CalendarImportResult | null>(null);
  async function upload(file: File) {
    setError('');
    setResult(null);
    if (file.size > MAX_BYTES) {
      setError('File lớn hơn 512 KB. Xuất một khoảng ngày ngắn hơn từ lịch kia rồi thử lại.');
      return;
    }
    setPending(true);
    try {
      const done = await importCalendar(file);
      setResult(done);
      if (done.created) imported();
    } catch (failure) {
      setError(
        failure instanceof ApiError
          ? failure.status === 413
            ? 'File lớn hơn 512 KB.'
            : calendarError(failure)
          : 'Chưa nhập được file. Kiểm tra kết nối rồi thử lại.',
      );
    } finally {
      setPending(false);
      if (input.current) input.current.value = '';
    }
  }
  return (
    <aside className="calendar-tasks calendar-import" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Nhập từ lịch khác</h2>
      <p className="field-hint">
        Chọn file <code>.ics</code> xuất từ Google Calendar, Outlook hay ứng dụng khác. Lịch học và
        việc cần làm được thêm với màu xám; nhập lại cùng file không tạo bản trùng.
      </p>
      <div className="form-field">
        <label htmlFor={`${id}-file`}>File lịch (.ics)</label>
        <input
          ref={input}
          id={`${id}-file`}
          type="file"
          accept=".ics,text/calendar"
          disabled={pending}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>
      {pending && <p role="status">Đang nhập lịch…</p>}
      {error && (
        <p role="alert" className="form-error">
          {error}
        </p>
      )}
      {result && (
        <div role="status" className="calendar-import-result">
          <p>
            Đã thêm {result.created} mục
            {result.existing ? `, ${result.existing} mục đã có từ lần nhập trước` : ''}
            {result.skippedCount ? `, bỏ qua ${result.skippedCount} mục` : ''}.
          </p>
          {(result.notes.length > 0 || result.skipped.length > 0) && (
            <ul>
              {result.notes.map((n, i) => (
                <li key={`n${i}`}>
                  {n.title}: {n.reason}
                </li>
              ))}
              {result.skipped.map((s, i) => (
                <li key={`s${i}`}>
                  Bỏ qua {s.title ? `“${s.title}”` : ''}: {s.reason}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </aside>
  );
}
