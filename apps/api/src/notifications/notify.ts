import { Prisma } from '../generated/prisma/client';

export type NotificationKind =
  | 'FILE_SAFE'
  | 'FILE_FAILED'
  | 'SOURCE_READY'
  | 'SOURCE_FAILED'
  | 'REVIEW_APPROVED'
  | 'REVIEW_CHANGES_REQUIRED'
  | 'REVIEW_REJECTED'
  | 'REPORT_RESOLVED'
  | 'REPORT_DISMISSED'
  | 'CALENDAR_REMINDER'
  | 'READING_DEADLINE_SOON'
  | 'READING_DEADLINE_CHANGED';

/**
 * Records one notice in the caller's transaction, so it commits or rolls back with the state
 * change. `eventKey` (e.g. `file:12`) is unique per recipient: a retried job notifies once.
 * Only the version title and a reason code are stored, never note content or admin free text.
 */
export async function notify(
  tx: Prisma.TransactionClient,
  event: {
    userId: bigint;
    kind: NotificationKind;
    eventKey: string;
    versionId: bigint;
    detail?: string | null;
    /** Reading deadlines: the due time the notice is about. */
    eventAt?: Date | null;
  },
) {
  const version = await tx.document_versions.findUnique({
    where: { id: event.versionId },
    select: { document_id: true, title: true },
  });
  if (!version) return 0;
  const { count } = await tx.notifications.createMany({
    data: [
      {
        user_id: event.userId,
        kind: event.kind,
        event_key: event.eventKey,
        document_id: version.document_id,
        version_id: event.versionId,
        title: version.title,
        detail: event.detail ?? null,
        event_at: event.eventAt ?? null,
      },
    ],
    skipDuplicates: true,
  });
  return count;
}
