'use client';
import { useEffect, useState } from 'react';
import {
  materialError,
  materialVersions,
  publicationHistory,
  reviewStatuses,
  publicationLabel,
  type DraftList,
  type MaterialDraft,
  type PublicationHistory,
} from '../../lib/materials';
export function VersionHistory({ current }: { current: MaterialDraft }) {
  const [data, setData] = useState<DraftList | null>(null),
    [page, setPage] = useState(1),
    [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(''),
    [selected, setSelected] = useState<{ id: string; number: number } | null>(null);
  const [history, setHistory] = useState<PublicationHistory | null>(null),
    [historyPage, setHistoryPage] = useState(1),
    [historyError, setHistoryError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    void materialVersions(current.id, page, controller.signal)
      .then((result) => {
        if (!controller.signal.aborted) {
          setData(result);
          setError('');
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(materialError(e));
      });
    return () => controller.abort();
  }, [current.id, current.versionId, current.revision, page, attempt]);
  useEffect(() => {
    if (!selected) return;
    const controller = new AbortController();
    void publicationHistory(current.id, historyPage, controller.signal, selected.id)
      .then((result) => {
        if (!controller.signal.aborted) {
          setHistory(result);
          setHistoryError('');
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setHistoryError(materialError(e));
      });
    return () => controller.abort();
  }, [current.id, current.revision, selected, historyPage, attempt]);
  return (
    <section className="draft-pdf" aria-label="Lịch sử phiên bản">
      <h3>Lịch sử phiên bản</h3>
      <p className="field-hint">
        Mỗi bản giữ PDF, ghi chú và lần xét duyệt riêng. Bản nháp không xuất hiện cho người đọc.
      </p>
      {error ? (
        <p role="alert">{error}</p>
      ) : !data ? (
        <p role="status">Đang tải phiên bản…</p>
      ) : (
        <>
          <ol className="publication-history">
            {data.items.map((v) => (
              <li key={v.versionId}>
                <strong>
                  Phiên bản {v.versionNo} · {publicationLabel(v)}
                </strong>
                <p>{v.title}</p>
                <p className="field-hint">
                  Cập nhật {new Date(v.updatedAt).toLocaleString('vi-VN')}
                </p>
                {v.publicationMethod === 'LECTURER_SELF' ? (
                  <p className="field-hint">Cách công bố: giảng viên tự công bố.</p>
                ) : null}
                <button
                  type="button"
                  className="text-button"
                  onClick={() => {
                    setSelected({ id: v.versionId, number: v.versionNo });
                    setHistory(null);
                    setHistoryError('');
                    setHistoryPage(1);
                  }}
                >
                  {v.publicationMethod === 'LECTURER_SELF'
                    ? 'Xem lịch sử yêu cầu phiên bản'
                    : 'Xem lần duyệt phiên bản'}{' '}
                  {v.versionNo}
                </button>
              </li>
            ))}
          </ol>
          <div className="users-pagination">
            <button
              type="button"
              className="secondary-button"
              disabled={page <= 1}
              onClick={() => {
                setData(null);
                setPage((p) => p - 1);
              }}
            >
              Phiên bản trước
            </button>
            <button
              type="button"
              className="secondary-button"
              disabled={page * data.limit >= data.total}
              onClick={() => {
                setData(null);
                setPage((p) => p + 1);
              }}
            >
              Phiên bản sau
            </button>
          </div>
        </>
      )}
      {selected && (
        <div>
          <h4>Lần xét duyệt · Phiên bản {selected.number}</h4>
          {historyError ? (
            <p role="alert">{historyError}</p>
          ) : !history ? (
            <p role="status">Đang tải lần duyệt…</p>
          ) : (
            <>
              {!history.items.length ? (
                <p>Chưa có lần gửi duyệt.</p>
              ) : (
                <ol className="publication-history">
                  {history.items.map((r) => (
                    <li key={r.id}>
                      <strong>
                        {r.status === 'WITHDRAWN'
                          ? 'Đã rút'
                          : r.status === 'PENDING'
                            ? 'Chờ duyệt'
                            : reviewStatuses[r.status as keyof typeof reviewStatuses]}
                      </strong>
                      <p className="field-hint">
                        Gửi {new Date(r.submittedAt).toLocaleString('vi-VN')}
                      </p>
                      {r.reason && <p className="publication-reason">{r.reason}</p>}
                    </li>
                  ))}
                </ol>
              )}
              <div className="users-pagination">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={historyPage <= 1}
                  onClick={() => {
                    setHistory(null);
                    setHistoryPage((p) => p - 1);
                  }}
                >
                  Lần duyệt trước
                </button>
                <button
                  type="button"
                  className="secondary-button"
                  disabled={historyPage * history.limit >= history.total}
                  onClick={() => {
                    setHistory(null);
                    setHistoryPage((p) => p + 1);
                  }}
                >
                  Lần duyệt sau
                </button>
              </div>
            </>
          )}
        </div>
      )}
      {(error || historyError) && (
        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            setError('');
            setHistoryError('');
            setAttempt((n) => n + 1);
          }}
        >
          Thử tải lịch sử phiên bản
        </button>
      )}
    </section>
  );
}
