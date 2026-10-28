'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { libraryCourses } from '../../lib/library';
import {
  followReadingLists,
  publishedReadingLists,
  readingListError,
  type ReadingList,
} from '../../lib/reading-lists';
import { SelectField } from '../ui/select-field';
import { ReadingListItems } from './reading-list-view';

type Courses = { id: string; code: string; name: string }[];

export function ReadingListBrowser({ initialCourse }: { initialCourse?: string }) {
  const [courses, setCourses] = useState<Courses | null>(null);
  const [courseError, setCourseError] = useState('');
  const [courseId, setCourseId] = useState(initialCourse ?? '');
  const [lists, setLists] = useState<{
    course: string;
    following: boolean;
    items: ReadingList[];
  } | null>(null);
  const [saving, setSaving] = useState(false);
  const [followNotice, setFollowNotice] = useState('');
  const [followError, setFollowError] = useState('');
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    void libraryCourses(controller.signal)
      .then((items) => {
        if (!controller.signal.aborted) setCourses(items);
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setCourseError(readingListError(failure));
      });
    return () => controller.abort();
  }, [attempt]);
  useEffect(() => {
    if (!courseId) return;
    const controller = new AbortController();
    void publishedReadingLists(courseId, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted)
          setLists({
            course: `${result.course.code} · ${result.course.name}`,
            following: result.following,
            items: result.items,
          });
      })
      .catch((failure) => {
        if (!controller.signal.aborted) setError(readingListError(failure));
      });
    return () => controller.abort();
  }, [courseId, attempt]);
  async function follow(next: boolean) {
    if (!lists) return;
    // The box flips at once; a failed request puts it back.
    setLists({ ...lists, following: next });
    setSaving(true);
    setFollowNotice('');
    setFollowError('');
    try {
      const saved = await followReadingLists(courseId, next);
      setLists((v) => v && { ...v, following: saved });
      setFollowNotice(
        saved ? 'Hạn đọc của môn này sẽ hiện trên Lịch học.' : 'Đã bỏ hạn đọc khỏi Lịch học.',
      );
    } catch (failure) {
      setLists((v) => v && { ...v, following: !next });
      setFollowError(readingListError(failure));
    } finally {
      setSaving(false);
    }
  }
  function choose(value: string) {
    setLists(null);
    setError('');
    setFollowNotice('');
    setFollowError('');
    setCourseId(value);
    const url = new URL(window.location.href);
    if (value) url.searchParams.set('courseId', value);
    else url.searchParams.delete('courseId');
    window.history.replaceState(window.history.state, '', url);
  }
  return (
    <section className="users-directory reading-lists" aria-labelledby="reading-lists-title">
      <h2 id="reading-lists-title">Danh sách đọc theo môn</h2>
      <p className="field-hint">
        Giảng viên phụ trách môn sắp tài liệu theo tuần hoặc chủ đề. Mỗi mục mở đúng phiên bản giảng
        viên đã chọn.
      </p>
      {courseError ? (
        <div className="users-list-message">
          <p role="alert" className="form-error">
            {courseError}
          </p>
          <button
            className="secondary-button"
            onClick={() => {
              setCourseError('');
              setAttempt((v) => v + 1);
            }}
          >
            Thử tải lại
          </button>
        </div>
      ) : !courses ? (
        <p role="status">Đang tải danh sách môn…</p>
      ) : (
        <SelectField
          id="reading-course"
          label="Môn học"
          value={courseId}
          onChange={choose}
          options={[
            { value: '', label: 'Chọn môn học' },
            ...courses.map((c) => ({ value: c.id, label: `${c.code} · ${c.name}` })),
          ]}
        />
      )}
      {!courseId ? null : error ? (
        <div className="users-list-message">
          <p role="alert" className="form-error">
            {error}
          </p>
          <button
            className="secondary-button"
            onClick={() => {
              setError('');
              setAttempt((v) => v + 1);
            }}
          >
            Thử tải lại
          </button>
        </div>
      ) : !lists ? (
        <p role="status">Đang tải danh sách đọc…</p>
      ) : (
        <div className="reading-follow">
          <label className="eligibility-check">
            <input
              type="checkbox"
              checked={lists.following}
              disabled={saving}
              onChange={(e) => void follow(e.target.checked)}
            />{' '}
            Hiện hạn đọc của môn này trên Lịch học
          </label>
          <p className="field-hint">
            Chỉ bạn thấy lựa chọn này. <Link href="/workspace/calendar">Mở Lịch học</Link>
          </p>
          {followNotice && <p role="status">{followNotice}</p>}
          {followError && (
            <p role="alert" className="form-error">
              {followError}
            </p>
          )}
        </div>
      )}
      {!courseId || error || !lists ? null : lists.items.length === 0 ? (
        <p className="users-list-message">
          Môn {lists.course} chưa có danh sách đọc nào được công bố.
        </p>
      ) : (
        lists.items.map((list) => (
          <article key={list.id} className="reading-list" aria-label={list.title}>
            <h3>{list.title}</h3>
            <p className="field-hint">
              {list.owner.name} · Cập nhật {new Date(list.updatedAt).toLocaleDateString('vi-VN')}
            </p>
            <ReadingListItems items={list.items} />
          </article>
        ))
      )}
    </section>
  );
}
