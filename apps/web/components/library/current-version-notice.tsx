import Link from 'next/link';
import type { LibraryItem } from '../../lib/library';

/** On an earlier version: points to the current one without moving the reader's notes. */
export function CurrentVersionNotice({
  versionNo,
  current,
}: {
  versionNo: number;
  current: NonNullable<LibraryItem['currentVersion']>;
}) {
  return (
    <aside className="version-notice" aria-label="Phiên bản hiện hành">
      <p>
        <strong>Bạn đang đọc phiên bản {versionNo}, là bản công bố trước.</strong> Bản hiện hành là
        phiên bản {current.versionNo}: {current.title}.
      </p>
      <p className="field-hint">
        Ghi chú, đoạn tô và tiến độ đọc của bạn ở phiên bản {versionNo} được giữ nguyên tại đây,
        không tự chuyển sang bản hiện hành.
      </p>
      <Link
        className="secondary-button"
        href={`/workspace/library/versions/${encodeURIComponent(current.versionId)}`}
      >
        Mở phiên bản {current.versionNo}
      </Link>
    </aside>
  );
}
