'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { listNotebooks, notesPath, type Notebook } from '../../lib/notes';

/**
 * CANVAS-01: when the Sổ tay or the calendar is filtered by a course, the owner's notebooks
 * linked to that course are offered next to it. Nothing shows without a course or a match.
 */
export function CourseNotebooks({ courseId }: { courseId: string | undefined }) {
  const [found, setFound] = useState<{ courseId: string; items: Notebook[] } | null>(null);
  useEffect(() => {
    if (!courseId) return;
    const controller = new AbortController();
    listNotebooks({ courseId }, controller.signal)
      .then((result) => setFound({ courseId, items: result.items.slice(0, 6) }))
      .catch(() => undefined);
    return () => controller.abort();
  }, [courseId]);
  const items = courseId && found?.courseId === courseId ? found.items : [];
  if (!items.length) return null;
  return (
    <p className="field-hint course-notebooks">
      Vở ghi của môn này:{' '}
      {items.map((notebook, index) => (
        <span key={notebook.id}>
          {index > 0 && ', '}
          <Link href={notesPath(notebook.id)}>{notebook.title}</Link>
        </span>
      ))}
    </p>
  );
}
