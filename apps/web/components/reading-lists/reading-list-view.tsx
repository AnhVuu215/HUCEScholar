'use client';
import Link from 'next/link';
import { formatDue, type ReadingItem } from '../../lib/reading-lists';
import { materialTypes } from '../../lib/materials';

/** Items grouped by their section label, in the lecturer's order. */
export function groupBySection(items: ReadingItem[]) {
  const groups: { section: string; items: ReadingItem[] }[] = [];
  for (const item of items) {
    const last = groups.at(-1);
    if (last && last.section === item.section) last.items.push(item);
    else groups.push({ section: item.section, items: [item] });
  }
  return groups;
}

/** Readable items marked read, out of the readable ones (COURSE-02). */
export function readCount(items: ReadingItem[]) {
  const readable = items.filter((i) => i.material);
  return { read: readable.filter((i) => i.read).length, total: readable.length };
}

/** `onRead` adds the reader's own "Đã đọc" box to each readable item. */
export function ReadingListItems({
  items,
  onRead,
}: {
  items: ReadingItem[];
  onRead?: (item: ReadingItem, read: boolean) => void;
}) {
  if (!items.length) return <p className="field-hint">Danh sách chưa có tài liệu.</p>;
  return (
    <>
      {groupBySection(items).map((group, index) => (
        <section key={`${group.section}-${index}`} className="reading-section">
          {group.section && <h4>{group.section}</h4>}
          <ol className="reading-items">
            {group.items.map((item) => (
              <li key={item.position} data-read={item.read || undefined}>
                {item.material ? (
                  <>
                    <Link href={`/workspace/library/versions/${item.versionId}`}>
                      {item.material.title}
                    </Link>
                    <p className="field-hint">
                      {materialTypes[item.material.materialType]} · Phiên bản{' '}
                      {item.material.versionNo}
                      {item.material.authors ? ` · ${item.material.authors}` : ''}
                    </p>
                    {item.material.newerVersionId && (
                      <p className="field-hint">
                        Đã có bản mới hơn.{' '}
                        <Link href={`/workspace/library/versions/${item.material.newerVersionId}`}>
                          Xem bản mới
                        </Link>
                        . Giảng viên chọn phiên bản {item.material.versionNo}.
                      </p>
                    )}
                    {onRead && (
                      <label className="eligibility-check reading-read">
                        <input
                          type="checkbox"
                          checked={item.read}
                          aria-label={`Đã đọc: ${item.material.title}`}
                          onChange={(e) => onRead(item, e.target.checked)}
                        />{' '}
                        Đã đọc
                      </label>
                    )}
                  </>
                ) : (
                  <p>Tài liệu không còn khả dụng với tài khoản của bạn.</p>
                )}
                {item.dueOn && <p className="reading-due">Hạn đọc: {formatDue(item.dueOn)}</p>}
                {item.note && <p className="reading-note">{item.note}</p>}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}
