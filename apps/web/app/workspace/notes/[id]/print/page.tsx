import type { Metadata } from 'next';
import { NotePrint } from '../../../../../components/notes/note-print';
export const metadata: Metadata = { title: 'In vở ghi — HUCEScholar' };
export const dynamic = 'force-dynamic';
export default async function NotebookPrintPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ pages?: string | string[] }>;
}) {
  const { id } = await params;
  const raw = (await searchParams).pages;
  const pages =
    typeof raw === 'string'
      ? raw
          .split(',')
          .filter((value) => /^[1-9]\d{0,18}$/.test(value))
          .slice(0, 500)
      : null;
  return <NotePrint notebookId={id} pageIds={pages?.length ? pages : null} />;
}
