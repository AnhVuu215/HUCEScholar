'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { formatSize, notebooksUsage } from '../../lib/notes';

type Usage = Awaited<ReturnType<typeof notebooksUsage>>;

/** CANVAS-01: how much of the image allowance the owner's notebooks use. */
export function NotebookUsage() {
  const [usage, setUsage] = useState<Usage | null>(null),
    [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    notebooksUsage(controller.signal)
      .then(setUsage)
      .catch(() => !controller.signal.aborted && setFailed(true));
    return () => controller.abort();
  }, []);
  return (
    <section className="content-section profile-editor" aria-label="Dung lượng vở ghi">
      <h2>Dung lượng vở ghi</h2>
      {usage ? (
        <>
          <p>
            Ảnh trong vở: {formatSize(usage.imageBytes)} / {formatSize(usage.imageLimit)} (
            {usage.imageCount} ảnh).
          </p>
          <progress
            max={usage.imageLimit}
            value={Math.min(usage.imageBytes, usage.imageLimit)}
            aria-label="Dung lượng ảnh đã dùng"
          />
          <p className="field-hint">
            {usage.notebooks} vở. Xóa hẳn vở trong Thùng rác hoặc xóa ảnh khỏi trang để giải phóng
            dung lượng. <Link href="/workspace/notes">Mở Vở ghi</Link>
          </p>
        </>
      ) : failed ? (
        <p role="alert" className="form-error">
          Không tải được dung lượng vở ghi.
        </p>
      ) : (
        <p className="field-hint">Đang tải…</p>
      )}
    </section>
  );
}
