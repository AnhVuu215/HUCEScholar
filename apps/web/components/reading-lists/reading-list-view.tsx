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

export function ReadingListItems({ items }: { items: ReadingItem[] }) {
  if (!items.length) return <p className="field-hint">Danh sách chưa có tài liệu.</p>;
  return (
    <>
      {groupBySection(items).map((group, index) => (
        <section key={`${group.section}-${index}`} className="reading-section">
          {group.section && <h4>{group.section}</h4>}
          <ol className="reading-items">
            {group.items.map((item) => (
              <li key={item.position}>
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
