'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { Role } from '../../lib/auth';
import { libraryError } from '../../lib/library';
import { draftList, materialError, type DraftList } from '../../lib/materials';
import { reviewError, reviewList, type ReviewList } from '../../lib/moderation';
import { personalList, type PersonalList } from '../../lib/personal-library';
import {
  dueDay,
  followedReadingLists,
  formatDue,
  readingListError,
  type FollowedCourse,
} from '../../lib/reading-lists';
import {
  adminReports,
  reportCategories,
  reportError,
  type AdminReportList,
} from '../../lib/reports';

type Loaded<T> = { data: T | null; error: string; retry: () => void };

/** Loads one home section; a failure in one section never blanks the others. */
function useSection<T>(load: (signal: AbortSignal) => Promise<T>, message: (e: unknown) => string) {
  const [state, setState] = useState<{ data: T | null; error: string }>({ data: null, error: '' });
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data, error: '' });
      })
      .catch((e: unknown) => {
        if (!controller.signal.aborted) setState({ data: null, error: message(e) });
      });
    return () => controller.abort();
  }, [load, message, attempt]);
  const retry = useCallback(() => {
    setState({ data: null, error: '' });
    setAttempt((n) => n + 1);
  }, []);
  return { ...state, retry } satisfies Loaded<T>;
}

function SectionState<T>({
  section,
  loading,
  retryLabel,
  children,
}: {
  section: Loaded<T>;
  loading: string;
  retryLabel: string;
  children: (data: T) => React.ReactNode;
}) {
  if (section.error)
    return (
      <div role="alert">
        <p>{section.error}</p>
        <button type="button" className="secondary-button" onClick={section.retry}>
          {retryLabel}
        </button>
      </div>
    );
  if (!section.data) return <p role="status">{loading}</p>;
  return <>{children(section.data)}</>;
}

const loadRecent = (signal: AbortSignal) => personalList('recent', 1, signal);

function ContinueReading() {
  const recent = useSection<PersonalList>(loadRecent, libraryError);
  return (
    <section className="content-section home-section" aria-labelledby="home-continue">
      <h2 id="home-continue">Học tiếp</h2>
      <SectionState section={recent} loading="Đang tải tài liệu đọc gần đây…" retryLabel="Tải lại">
        {(data) => {
          const [latest, ...others] = data.items;
          if (!latest)
            return (
              <p>
                Bạn chưa đọc tài liệu nào. <Link href="/workspace/library">Mở kho học liệu</Link> để
                bắt đầu; trang đọc được lưu lại để học tiếp.
              </p>
            );
          return (
            <>
              <article className="home-continue-card" aria-label="Tài liệu đọc gần nhất">
                <h3>{latest.material?.title ?? 'Tài liệu không còn khả dụng'}</h3>
                {latest.material ? (
                  <>
                    <p className="field-hint">
                      Phiên bản {latest.material.versionNo}
                      {latest.material.current ? '' : ' · Bản công bố trước'} · Đã đọc đến trang{' '}
                      {latest.pageNumber}
                    </p>
                    <Link
                      className="primary-button"
                      href={`/workspace/library/versions/${latest.material.versionId}`}
                    >
                      Đọc tiếp trang {latest.pageNumber}
                    </Link>
                  </>
                ) : (
                  <p className="field-hint">
                    Tài liệu đã bị ẩn hoặc bạn không còn quyền đọc. Ghi chú riêng vẫn được giữ.
                  </p>
                )}
              </article>
              {others.some((entry) => entry.material) && (
                <ul className="home-list" aria-label="Đọc gần đây khác">
                  {others
                    .filter((entry) => entry.material)
                    .slice(0, 3)
                    .map((entry) => (
                      <li key={entry.versionId}>
                        <Link href={`/workspace/library/versions/${entry.material!.versionId}`}>
                          {entry.material!.title}
                        </Link>
                        <span className="field-hint">
                          {' '}
                          · Phiên bản {entry.material!.versionNo} · Trang {entry.pageNumber}
                        </span>
                      </li>
                    ))}
                </ul>
              )}
              <p>
                <Link href="/workspace/personal-library">Xem thư viện của tôi</Link>
              </p>
            </>
          );
        }}
      </SectionState>
    </section>
  );
}

const loadFollowed = (signal: AbortSignal) => followedReadingLists(signal);

function FollowedReadingLists() {
  const followed = useSection<FollowedCourse[]>(loadFollowed, readingListError);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return (
    <section className="content-section home-section" aria-labelledby="home-reading">
      <h2 id="home-reading">Danh sách đọc đang theo dõi</h2>
      <SectionState
        section={followed}
        loading="Đang tải tiến độ đọc…"
        retryLabel="Tải lại tiến độ đọc"
      >
        {(items) =>
          items.length ? (
            <ul className="home-list home-reading" aria-label="Tiến độ theo môn">
              {items.map(({ course, total, read, next }) => (
                <li key={course.id}>
                  <Link href={`/workspace/library/reading-lists?courseId=${course.id}`}>
                    {course.code} · {course.name}
                  </Link>
                  <span className="field-hint">
                    {' '}
                    ·{' '}
                    {total
                      ? read === total
                        ? `Đã đọc hết ${total} tài liệu`
                        : `Đã đọc ${read}/${total} tài liệu`
                      : 'Chưa có danh sách đọc đã công bố'}
                  </span>
                  {next && (
                    <p className={dueDay(next.dueOn) < today ? 'home-overdue' : 'field-hint'}>
                      {dueDay(next.dueOn) < today ? 'Quá hạn' : 'Hạn gần nhất'}{' '}
                      {formatDue(next.dueOn)}:{' '}
                      <Link href={`/workspace/library/versions/${next.versionId}`}>
                        {next.title}
                      </Link>
                    </p>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <p>
              Bạn chưa theo dõi môn nào. Mở{' '}
              <Link href="/workspace/library/reading-lists">Danh sách đọc</Link>, chọn môn rồi bật
              &quot;Hiện hạn đọc của môn này trên Lịch học&quot; để thấy tiến độ ở đây.
            </p>
          )
        }
      </SectionState>
    </section>
  );
}

const fileStates: Record<string, string> = {
  MISSING: 'Chưa có file tài liệu',
  CHECKING: 'Đang kiểm tra an toàn',
  SAFE: 'File đã kiểm tra',
  FAILED: 'Không đạt kiểm tra an toàn',
};
const draftsWith = (reviewStatus: string) => (signal: AbortSignal) =>
  draftList(new URLSearchParams({ reviewStatus, page: '1', limit: '3' }), signal);
const loadChanges = draftsWith('CHANGES_REQUIRED');
const loadDrafts = draftsWith('DRAFT');

function DraftGroup({ title, list, empty }: { title: string; list: DraftList; empty: string }) {
  return (
    <div className="home-group">
      <h3>
        {title} · {list.total}
      </h3>
      {list.items.length ? (
        <ul className="home-list">
          {list.items.map((item) => (
            <li key={item.id}>
              <strong>{item.title || 'Chưa đặt tiêu đề'}</strong>
              <span className="field-hint">
                {' '}
                · Phiên bản {item.versionNo} · {fileStates[item.fileState]}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="field-hint">{empty}</p>
      )}
    </div>
  );
}

function MaterialTasks({ role }: { role: 'LECTURER' | 'STUDENT' }) {
  const changes = useSection<DraftList>(loadChanges, materialError);
  const drafts = useSection<DraftList>(loadDrafts, materialError);
  const href = `/workspace/${role.toLowerCase()}/materials`;
  return (
    <section className="content-section home-section" aria-labelledby="home-materials">
      <h2 id="home-materials">
        {role === 'LECTURER' ? 'Học liệu cần xử lý' : 'Tài liệu đóng góp của bạn'}
      </h2>
      <SectionState
        section={changes}
        loading="Đang tải yêu cầu sửa…"
        retryLabel="Tải lại yêu cầu sửa"
      >
        {(list) => (
          <DraftGroup title="Cần sửa theo yêu cầu" list={list} empty="Không có tài liệu cần sửa." />
        )}
      </SectionState>
      <SectionState section={drafts} loading="Đang tải bản nháp…" retryLabel="Tải lại bản nháp">
        {(list) => (
          <DraftGroup title="Bản nháp đang soạn" list={list} empty="Không có bản nháp đang soạn." />
        )}
      </SectionState>
      <p>
        <Link href={href}>Mở học liệu của tôi</Link>
      </p>
    </section>
  );
}

const loadPending = (signal: AbortSignal) =>
  reviewList(new URLSearchParams({ status: 'PENDING', page: '1', limit: '5' }), signal);

function ModerationQueue() {
  const pending = useSection<ReviewList>(loadPending, reviewError);
  return (
    <section className="content-section home-section" aria-labelledby="home-moderation">
      <h2 id="home-moderation">Yêu cầu chờ duyệt</h2>
      <SectionState section={pending} loading="Đang tải hàng chờ…" retryLabel="Tải lại hàng chờ">
        {(list) =>
          list.items.length ? (
            <>
              <p>{list.total} yêu cầu đang chờ. Cũ nhất ở trên.</p>
              <ul className="home-list">
                {list.items.map((item) => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    <span className="field-hint">
                      {' '}
                      · Gửi {new Date(item.submittedAt).toLocaleString('vi-VN')}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>Không có yêu cầu chờ duyệt.</p>
          )
        }
      </SectionState>
      <p>
        <Link href="/workspace/admin/moderation">Mở kiểm duyệt học liệu</Link>
      </p>
    </section>
  );
}

const loadReports = (signal: AbortSignal) =>
  adminReports(new URLSearchParams({ status: 'OPEN', page: '1', limit: '5' }), signal);

function OpenReports() {
  const reports = useSection<AdminReportList>(loadReports, reportError);
  return (
    <section className="content-section home-section" aria-labelledby="home-reports">
      <h2 id="home-reports">Báo cáo đang mở</h2>
      <SectionState section={reports} loading="Đang tải báo cáo…" retryLabel="Tải lại báo cáo">
        {(list) =>
          list.items.length ? (
            <>
              <p>{list.total} báo cáo chưa nhận xem xét. Cũ nhất ở trên.</p>
              <ul className="home-list">
                {list.items.map((item) => (
                  <li key={item.id}>
                    <strong>{item.title}</strong>
                    <span className="field-hint"> · {reportCategories[item.category]}</span>
                  </li>
                ))}
              </ul>
            </>
          ) : (
            <p>Không có báo cáo đang mở.</p>
          )
        }
      </SectionState>
      <p>
        <Link href="/workspace/admin/reports">Mở báo cáo tài liệu</Link>
      </p>
    </section>
  );
}

/** First page after sign-in: the work this role should pick up next, from real data only. */
export function RoleHome({ role }: { role: Role }) {
  return (
    <div className="role-home">
      <ContinueReading />
      <FollowedReadingLists />
      {role === 'ADMIN' ? (
        <>
          <ModerationQueue />
          <OpenReports />
        </>
      ) : (
        <MaterialTasks role={role} />
      )}
    </div>
  );
}
