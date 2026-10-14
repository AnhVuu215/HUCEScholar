'use client';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { personalList, type PersonalListKind, type PersonalList } from '../../lib/personal-library';
import { libraryError } from '../../lib/library';
import { SaveMaterial } from './save-material';
export function PersonalLibrary() {
  const [kind, setKind] = useState<PersonalListKind>('saved'),
    [page, setPage] = useState(1),
    [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<PersonalList | null>(null),
    [error, setError] = useState(''),
    [notice, setNotice] = useState('');
  const feedback = useRef<HTMLParagraphElement>(null),
    restoreFocus = useRef(false);
  function focusFeedback() {
    if (restoreFocus.current) {
      restoreFocus.current = false;
      requestAnimationFrame(() => feedback.current?.focus());
    }
  }
  useEffect(() => {
    const controller = new AbortController();
    void personalList(kind, page, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          if (!result.items.length && page > 1) {
            setPage(page - 1);
            return;
          }
          setData(result);
          setError('');
          focusFeedback();
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) {
          setError(libraryError(e));
          setData(null);
          focusFeedback();
        }
      });
    return () => controller.abort();
  }, [kind, page, attempt]);
  function reload(message = '') {
    setNotice(message);
    restoreFocus.current = true;
    setData(null);
    setError('');
    setAttempt((n) => n + 1);
  }
  function select(value: PersonalListKind) {
    restoreFocus.current = false;
    setNotice('');
    setData(null);
    setError('');
    setPage(1);
    setKind(value);
    setAttempt((n) => n + 1);
  }
  return (
    <section className="content-section personal-library" aria-labelledby="personal-title">
      <div className="user-form-actions" aria-label="Danh sách thư viện cá nhân">
        <button
          type="button"
          className={kind === 'saved' ? 'primary-button' : 'secondary-button'}
          aria-pressed={kind === 'saved'}
          onClick={() => select('saved')}
        >
          Đã lưu
        </button>
        <button
          type="button"
          className={kind === 'recent' ? 'primary-button' : 'secondary-button'}
          aria-pressed={kind === 'recent'}
          onClick={() => select('recent')}
        >
          Đọc gần đây
        </button>
      </div>
      <h2 id="personal-title">
        {kind === 'saved' ? 'Tài liệu đã lưu' : 'Phiên bản đã đọc gần đây'}
      </h2>
      <p className="field-hint">
        {kind === 'saved'
          ? 'Đọc từ đây mở bản công bố hiện hành. Bỏ lưu không xóa ghi chú hoặc tiến độ.'
          : 'Mỗi lượt mở lại giữ đúng phiên bản và trang đã lưu. Bản cũ được ghi nhãn riêng.'}
      </p>
      <p role="status" ref={feedback} tabIndex={-1}>
        {notice && `${notice} `}
        {data
          ? `${data.total} mục · Trang ${data.page}/${Math.max(1, Math.ceil(data.total / data.limit))}`
          : error
            ? 'Chưa tải được thư viện.'
            : 'Đang tải thư viện…'}
      </p>
      {error ? (
        <div role="alert">
          <p>{error}</p>
          <button className="secondary-button" onClick={() => reload()}>
            Thử tải thư viện
          </button>
        </div>
      ) : !data ? null : (
        <>
          {!data.items.length ? (
            <p>
              {kind === 'saved'
                ? 'Chưa lưu tài liệu nào. Mở tài liệu trong kho và chọn Lưu tài liệu.'
                : 'Chưa có tiến độ đọc đã lưu. Bắt đầu đọc một tài liệu trong kho.'}{' '}
              <Link href="/workspace/library">Mở kho học liệu</Link>
            </p>
          ) : (
            <ul className="library-list">
              {data.items.map((entry) => {
                const material = entry.material;
                return (
                  <li key={kind === 'saved' ? entry.documentId : entry.versionId}>
                    <article aria-label={material?.title ?? 'Tài liệu không còn khả dụng'}>
                      <h3>{material?.title ?? 'Tài liệu không còn khả dụng'}</h3>
                      {material ? (
                        <>
                          <p>{material.authors || 'Chưa ghi tác giả'}</p>
                          <p className="field-hint">
                            Phiên bản {material.versionNo} ·{' '}
                            {material.current ? 'Bản công bố hiện hành' : 'Bản cũ đã duyệt'}
                          </p>
                          {kind === 'recent' && <p>Đã đọc đến trang {entry.pageNumber}</p>}
                          <p className="field-hint">
                            {kind === 'saved' ? 'Đã lưu' : 'Đã đọc'} ·{' '}
                            {new Date(entry.savedAt ?? entry.readAt!).toLocaleString('vi-VN')}
                          </p>
                          <Link
                            className="primary-button"
                            href={`/workspace/library/versions/${material.versionId}`}
                          >
                            {kind === 'saved' ? 'Đọc tài liệu' : 'Đọc tiếp'}
                          </Link>
                        </>
                      ) : (
                        <p>
                          Liên kết cá nhân được giữ. Tài liệu chưa đủ điều kiện đọc ở thời điểm này.
                        </p>
                      )}
                      {kind === 'saved' && (
                        <SaveMaterial
                          documentId={entry.documentId}
                          initiallySaved={true}
                          changed={reload}
                        />
                      )}
                    </article>
                  </li>
                );
              })}
            </ul>
          )}
          <div className="users-pagination personal-pagination">
            <button
              className="secondary-button"
              disabled={page <= 1}
              onClick={() => {
                restoreFocus.current = true;
                setNotice('');
                setData(null);
                setPage((n) => n - 1);
              }}
            >
              Trang trước
            </button>
            <button
              className="secondary-button"
              disabled={page * data.limit >= data.total}
              onClick={() => {
                restoreFocus.current = true;
                setNotice('');
                setData(null);
                setPage((n) => n + 1);
              }}
            >
              Trang sau
            </button>
          </div>
        </>
      )}
    </section>
  );
}
