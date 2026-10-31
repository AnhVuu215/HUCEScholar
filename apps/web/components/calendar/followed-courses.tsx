'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { SelectField } from '../ui/select-field';
import {
  deadlineRemindOptions,
  followReadingLists,
  followedReadingLists,
  readingListError,
  type FollowedCourse,
} from '../../lib/reading-lists';

const listHref = (courseId: string) =>
  `/workspace/library/reading-lists?courseId=${encodeURIComponent(courseId)}`;

/**
 * CAL-04b: every course whose reading-list due dates show on this calendar, in one place, with
 * the reader's progress and a way to stop following. Following starts on a course's list page.
 */
export function FollowedCourses({ attempt, changed }: { attempt: number; changed: () => void }) {
  const [courses, setCourses] = useState<FollowedCourse[] | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    followedReadingLists(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) {
          setCourses(items);
          setError('');
        }
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(readingListError(failure));
      });
    return () => controller.abort();
  }, [attempt]);
  async function remind(course: FollowedCourse['course'], value: string) {
    const minutes = value === '' ? null : Number(value);
    setBusy(course.id);
    setNotice('');
    try {
      await followReadingLists(course.id, true, minutes);
      setCourses(
        (v) =>
          v && v.map((c) => (c.course.id === course.id ? { ...c, remindMinutes: minutes } : c)),
      );
      const option = deadlineRemindOptions.find((o) => o.minutes === minutes);
      setNotice(
        option
          ? `${course.code}: nhắc ${option.label.toLowerCase()} mỗi hạn đọc chưa đọc.`
          : `${course.code}: không nhắc hạn đọc.`,
      );
    } catch (failure) {
      setNotice(readingListError(failure));
    } finally {
      setBusy(null);
    }
  }
  async function unfollow(course: FollowedCourse['course']) {
    setBusy(course.id);
    setNotice('');
    try {
      await followReadingLists(course.id, false);
      setCourses((v) => v && v.filter((c) => c.course.id !== course.id));
      setNotice(`Đã bỏ theo dõi ${course.code}. Hạn của môn này không còn trên lịch.`);
      changed();
    } catch (failure) {
      setNotice(readingListError(failure));
    } finally {
      setBusy(null);
    }
  }
  return (
    <aside className="calendar-tasks calendar-followed" aria-labelledby="calendar-followed-title">
      <h2 id="calendar-followed-title">Môn đang theo dõi</h2>
      {notice && (
        <p role="status" className="field-hint">
          {notice}
        </p>
      )}
      {error ? (
        <p role="alert" className="form-error">
          {error}
        </p>
      ) : !courses ? (
        <p role="status">Đang tải môn đang theo dõi…</p>
      ) : courses.length === 0 ? (
        <p className="field-hint">
          Chưa theo dõi môn nào. Mở{' '}
          <Link href="/workspace/library/reading-lists">Danh sách đọc</Link> của một môn và chọn
          theo dõi để thấy hạn đọc trên lịch.
        </p>
      ) : (
        <ul className="calendar-task-list">
          {courses.map(({ course, read, total, remindMinutes }) => (
            <li key={course.id}>
              <div>
                <Link href={listHref(course.id)}>
                  {course.code} · {course.name}
                </Link>
                <span className="field-hint">
                  Đã đọc {read}/{total}
                </span>
                <SelectField
                  id={`calendar-follow-remind-${course.id}`}
                  label={`Nhắc hạn đọc ${course.code}`}
                  value={remindMinutes === null ? '' : String(remindMinutes)}
                  disabled={busy !== null}
                  options={[
                    { value: '', label: 'Không nhắc' },
                    ...deadlineRemindOptions.map((o) => ({
                      value: String(o.minutes),
                      label: o.label,
                    })),
                  ]}
                  onChange={(value) => void remind(course, value)}
                />
                <button
                  type="button"
                  className="text-button"
                  aria-label={`Bỏ theo dõi ${course.code}`}
                  disabled={busy !== null}
                  onClick={() => void unfollow(course)}
                >
                  {busy === course.id ? 'Đang lưu…' : 'Bỏ theo dõi'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
