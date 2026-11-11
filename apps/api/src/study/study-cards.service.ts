import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.module';
import { Prisma, type study_cards } from '../generated/prisma/client';
import { Profile } from '../auth/auth.types';
import { available, LibraryService } from '../library/library.service';
import {
  CreateStudyCardDto,
  ReviewStudyCardDto,
  StudyCardExportDto,
  StudyCardListDto,
  StudyCardRevisionDto,
  StudyCardScopeDto,
  StudyScheduleDto,
  UpdateStudyCardDto,
} from './study-cards.dto';
import { addDays, dayText, dayValue, localDay, MAX_REVIEW_BOX, nextReview } from './study-schedule';
import { exportStudyCards, MAX_EXPORT_CARDS, type ExportCardDocument } from './study-card-export';
import { parseId } from '../common/ids';
import { lockKey } from '../common/locks';

/** A practice round loads at most this many cards, newest first. */
export const MAX_PRACTICE_CARDS = 200;
/** The calendar's month grid spans six weeks; this leaves room without an unbounded scan. */
const MAX_SCHEDULE_DAYS = 92;
/** STUDY-04: the review chart covers the last 30 days, today included. */
export const STATS_DAYS = 30;
/** Consecutive review days are counted back at most this far. */
const MAX_STREAK_DAYS = 400;

const stale = () =>
  new ConflictException({
    code: 'STUDY_CARD_CONFLICT',
    message: 'Thẻ đã thay đổi ở lượt khác. Tải lại trước khi cập nhật.',
  });
const cardItem = (c: study_cards & { document_versions?: { title: string } }) => ({
  id: String(c.id),
  versionId: String(c.version_id),
  pageNumber: c.page_number,
  highlightId: c.annotation_id ? String(c.annotation_id) : null,
  quote: c.quote,
  question: c.question,
  answer: c.answer,
  revision: c.revision,
  updatedAt: c.updated_at.toISOString(),
  reviewBox: c.review_box,
  dueOn: dayText(c.due_on),
  lastReviewedAt: c.last_reviewed_at?.toISOString() ?? null,
  ...(c.document_versions ? { title: c.document_versions.title } : {}),
});

/**
 * STUDY-01. Cards are private to their owner and, like notes, usable only while the owner can
 * still read the source version: otherwise they are retained but not returned or editable.
 */
@Injectable()
export class StudyCardsService {
  constructor(
    private readonly db: DatabaseService,
    private readonly library: LibraryService,
  ) {}
  async create(actor: Profile, rawVersionId: string, body: CreateStudyCardDto) {
    const user_id = parseId(actor.id),
      version_id = parseId(rawVersionId),
      annotationId = parseId(body.annotationId);
    return this.db.$transaction(async (tx) => {
      await lockKey(tx, `reading:${user_id}`);
      await this.library.access(tx, actor, version_id);
      const existing = await tx.study_cards.findUnique({
        where: { user_id_request_id: { user_id, request_id: body.requestId } },
      });
      if (existing) {
        if (
          existing.version_id !== version_id ||
          existing.annotation_id !== annotationId ||
          existing.question !== body.question ||
          existing.answer !== body.answer
        )
          throw new ConflictException({
            code: 'STUDY_CARD_REQUEST_REUSED',
            message: 'Yêu cầu tạo thẻ đã được dùng. Tải lại để đối soát.',
          });
        return { item: cardItem(existing) };
      }
      // Only from one's own highlight on this version; the quote is copied as the source.
      const highlight = await tx.annotations.findFirst({
        where: { id: annotationId, user_id, version_id, kind: 'TEXT_HIGHLIGHT' },
      });
      const quote =
        highlight?.anchor && typeof highlight.anchor === 'object' && 'quote' in highlight.anchor
          ? String(highlight.anchor.quote)
          : '';
      if (!highlight || !quote) throw new NotFoundException('Không tìm thấy đoạn tô.');
      const card = await tx.study_cards.create({
        data: {
          request_id: body.requestId,
          user_id,
          version_id,
          page_number: highlight.page_number,
          annotation_id: highlight.id,
          quote: quote.slice(0, 2000),
          question: body.question,
          answer: body.answer,
        },
      });
      return { item: cardItem(card) };
    });
  }
  /** The owner's cards on versions they can read now; unreadable ones are only counted. */
  /** Cards in the filter, and those of them whose version the owner can still read. */
  private scope(actor: Profile, query: StudyCardScopeDto) {
    const scope: Prisma.study_cardsWhereInput = {
      user_id: parseId(actor.id),
      ...(query.versionId ? { version_id: parseId(query.versionId) } : {}),
      ...(query.courseId
        ? {
            document_versions: {
              version_courses: { some: { course_id: parseId(query.courseId) } },
            },
          }
        : {}),
    };
    const readable: Prisma.study_cardsWhereInput = {
      AND: [scope, { document_versions: available() }],
    };
    return { scope, readable };
  }
  async list(actor: Profile, query: StudyCardListDto) {
    const { scope, readable } = this.scope(actor, query);
    const [rows, total, all] = await this.db.$transaction(
      [
        this.db.study_cards.findMany({
          where: readable,
          include: { document_versions: { select: { title: true } } },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          skip: (query.page - 1) * query.limit,
          take: query.limit,
        }),
        this.db.study_cards.count({ where: readable }),
        this.db.study_cards.count({ where: scope }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return {
      items: rows.map(cardItem),
      total,
      unavailable: all - total,
      page: query.page,
      limit: query.limit,
    };
  }
  /** STUDY-02: the documents and courses that have readable cards, for the filter menus. */
  async filters(actor: Profile) {
    const { readable } = this.scope(actor, {});
    return this.db.$transaction(
      async (tx) => {
        const counts = await tx.study_cards.groupBy({
          by: ['version_id'],
          where: readable,
          _count: { _all: true },
        });
        const ids = counts.map((c) => c.version_id);
        const versions = await tx.document_versions.findMany({
          where: { id: { in: ids } },
          select: { id: true, title: true },
        });
        const courses = await tx.courses.findMany({
          where: { version_courses: { some: { version_id: { in: ids } } } },
          orderBy: [{ code: 'asc' }, { id: 'asc' }],
          select: { id: true, code: true, name: true },
        });
        const count = new Map(counts.map((c) => [c.version_id, c._count._all]));
        return {
          documents: versions
            .map((v) => ({ versionId: String(v.id), title: v.title, cards: count.get(v.id)! }))
            .sort(
              (a, b) =>
                a.title.localeCompare(b.title, 'vi') ||
                Number(BigInt(a.versionId) - BigInt(b.versionId)),
            ),
          courses: courses.map((c) => ({ id: String(c.id), code: c.code, name: c.name })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  /** STUDY-02: every readable card in the filter for one round, up to MAX_PRACTICE_CARDS. */
  async practice(actor: Profile, query: StudyCardScopeDto) {
    const { readable } = this.scope(actor, query);
    const [rows, total] = await this.db.$transaction(
      [
        this.db.study_cards.findMany({
          where: readable,
          include: { document_versions: { select: { title: true } } },
          orderBy: [{ created_at: 'desc' }, { id: 'desc' }],
          take: MAX_PRACTICE_CARDS,
        }),
        this.db.study_cards.count({ where: readable }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items: rows.map(cardItem), total };
  }
  /** STUDY-03: the readable cards due today or overdue, longest overdue first. */
  async due(actor: Profile, query: StudyCardScopeDto) {
    const { readable } = this.scope(actor, query);
    const where: Prisma.study_cardsWhereInput = {
      AND: [readable, { due_on: { lte: dayValue(localDay(new Date())) } }],
    };
    const [rows, total] = await this.db.$transaction(
      [
        this.db.study_cards.findMany({
          where,
          include: { document_versions: { select: { title: true } } },
          orderBy: [{ due_on: 'asc' }, { id: 'asc' }],
          take: MAX_PRACTICE_CARDS,
        }),
        this.db.study_cards.count({ where }),
      ],
      { isolationLevel: 'RepeatableRead' },
    );
    return { items: rows.map(cardItem), total };
  }
  /** STUDY-03: cards due now, and how many fall due on each later day in the range. */
  async schedule(actor: Profile, query: StudyScheduleDto) {
    const today = localDay(new Date());
    const invalid = () => new BadRequestException('Khoảng ngày không hợp lệ.');
    const from = query.from ?? today;
    // The DTO checks the shape only: 2026-13-45 reaches here and must not throw a RangeError.
    if (Number.isNaN(dayValue(from).getTime())) throw invalid();
    const to = query.to ?? addDays(from, 30);
    const days = (dayValue(to).getTime() - dayValue(from).getTime()) / 86_400_000;
    if (!Number.isInteger(days) || days < 0 || days > MAX_SCHEDULE_DAYS) throw invalid();
    const { readable } = this.scope(actor, query);
    return this.db.$transaction(
      async (tx) => {
        const dueNow = await tx.study_cards.count({
          where: { AND: [readable, { due_on: { lte: dayValue(today) } }] },
        });
        const later = await tx.study_cards.groupBy({
          by: ['due_on'],
          where: {
            AND: [
              readable,
              { due_on: { gt: dayValue(today), gte: dayValue(from), lte: dayValue(to) } },
            ],
          },
          orderBy: { due_on: 'asc' },
          _count: { _all: true },
        });
        return {
          today,
          dueNow,
          days: later.map((row) => ({ date: dayText(row.due_on), count: row._count._all })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  /** STUDY-03: the first answer of the day sets the next date; a retry changes nothing. */
  async review(actor: Profile, rawId: string, body: ReviewStudyCardDto) {
    return this.db.$transaction(async (tx) => {
      const card = await this.owned(tx, actor, rawId);
      if (card.last_review_request === body.requestId) return { item: cardItem(card) };
      const today = localDay(new Date());
      if (dayText(card.due_on) > today)
        throw new ConflictException({
          code: 'STUDY_CARD_NOT_DUE',
          message: 'Thẻ này chưa đến hạn ôn.',
        });
      const next = nextReview(card.review_box, body.result, today);
      const updated = await tx.study_cards.update({
        where: { id: card.id },
        data: {
          review_box: next.box,
          due_on: dayValue(next.dueOn),
          last_reviewed_at: new Date(),
          last_review_request: body.requestId,
        },
      });
      // STUDY-04: history for the owner's own statistics; a retry returned above, so once only.
      await tx.study_card_reviews.create({
        data: {
          user_id: card.user_id,
          card_id: card.id,
          reviewed_on: dayValue(today),
          result: body.result,
          box_after: next.box,
        },
      });
      return { item: cardItem(updated) };
    });
  }
  /**
   * STUDY-04: the owner's review history: answers per day over the last STATS_DAYS days, totals
   * since the first review, the run of consecutive review days, and where the readable cards
   * stand in the schedule. History covers every review, including those of deleted cards.
   */
  async stats(actor: Profile) {
    const user_id = parseId(actor.id);
    const today = localDay(new Date());
    const from = addDays(today, 1 - STATS_DAYS);
    const { readable } = this.scope(actor, {});
    return this.db.$transaction(
      async (tx) => {
        const recent = await tx.study_card_reviews.groupBy({
          by: ['reviewed_on', 'result'],
          where: { user_id, reviewed_on: { gte: dayValue(from) } },
          orderBy: { reviewed_on: 'asc' },
          _count: { _all: true },
        });
        const totals = await tx.study_card_reviews.groupBy({
          by: ['result'],
          where: { user_id },
          _count: { _all: true },
        });
        const reviewDays = await tx.study_card_reviews.findMany({
          where: { user_id, reviewed_on: { gte: dayValue(addDays(today, -MAX_STREAK_DAYS)) } },
          distinct: ['reviewed_on'],
          orderBy: { reviewed_on: 'desc' },
          select: { reviewed_on: true },
        });
        const boxes = await tx.study_cards.groupBy({
          by: ['review_box'],
          where: readable,
          _count: { _all: true },
        });
        const days = new Map<string, { date: string; known: number; again: number }>();
        for (const row of recent) {
          const date = dayText(row.reviewed_on);
          const entry = days.get(date) ?? { date, known: 0, again: 0 };
          entry[row.result === 'KNOWN' ? 'known' : 'again'] += row._count._all;
          days.set(date, entry);
        }
        const total = (result: string) =>
          totals.find((row) => row.result === result)?._count._all ?? 0;
        // A run still counts until the end of the day after its last review.
        const seen = new Set(reviewDays.map((row) => dayText(row.reviewed_on)));
        let cursor = seen.has(today) ? today : addDays(today, -1);
        let streak = 0;
        while (seen.has(cursor)) {
          streak++;
          cursor = addDays(cursor, -1);
        }
        const perBox = new Map(boxes.map((row) => [row.review_box, row._count._all]));
        return {
          today,
          from,
          days: [...days.values()],
          totals: { known: total('KNOWN'), again: total('AGAIN') },
          streak,
          reviewedToday: seen.has(today),
          boxes: Array.from({ length: MAX_REVIEW_BOX + 1 }, (_, box) => ({
            box,
            cards: perBox.get(box) ?? 0,
          })),
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  /** STUDY-04: the readable cards in the filter as one file, grouped by document. */
  async export(actor: Profile, query: StudyCardExportDto) {
    const { readable } = this.scope(actor, query);
    return this.db.$transaction(
      async (tx) => {
        const total = await tx.study_cards.count({ where: readable });
        if (total > MAX_EXPORT_CARDS)
          throw new ConflictException({
            code: 'EXPORT_TOO_LARGE',
            message: `Có hơn ${MAX_EXPORT_CARDS} thẻ. Chọn môn hoặc tài liệu để xuất từng phần.`,
          });
        const rows = await tx.study_cards.findMany({
          where: readable,
          include: {
            document_versions: { select: { title: true, authors: true, version_no: true } },
          },
          orderBy: [{ version_id: 'asc' }, { page_number: 'asc' }, { id: 'asc' }],
        });
        const documents = new Map<bigint, ExportCardDocument>();
        for (const row of rows) {
          const doc = documents.get(row.version_id) ?? {
            title: row.document_versions.title,
            authors: row.document_versions.authors,
            versionNo: row.document_versions.version_no,
            cards: [],
          };
          doc.cards.push({
            question: row.question,
            answer: row.answer,
            quote: row.quote,
            pageNumber: row.page_number,
            reviewBox: row.review_box,
            dueOn: dayText(row.due_on),
          });
          documents.set(row.version_id, doc);
        }
        const filters: string[] = [];
        if (query.courseId) {
          const course = await tx.courses.findUnique({
            where: { id: parseId(query.courseId) },
            select: { code: true, name: true },
          });
          if (course) filters.push(`môn ${course.code} · ${course.name}`);
        }
        if (query.versionId) {
          const versionId = parseId(query.versionId);
          // A version the owner cannot read is not named, even in their own file.
          const doc = documents.get(versionId);
          filters.push(doc ? `tài liệu ${doc.title}` : 'một tài liệu');
        }
        return exportStudyCards(
          [...documents.values()].sort((a, b) => a.title.localeCompare(b.title, 'vi')),
          { filters: filters.join('; ') || 'mọi thẻ', exportedAt: new Date() },
          query.format,
        );
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  /** STUDY-03: "Ôn lại từ đầu": the card is due today as if it had never been reviewed. */
  async resetSchedule(actor: Profile, rawId: string) {
    return this.db.$transaction(async (tx) => {
      const card = await this.owned(tx, actor, rawId);
      const updated = await tx.study_cards.update({
        where: { id: card.id },
        data: {
          review_box: 0,
          due_on: dayValue(localDay(new Date())),
          last_reviewed_at: null,
          last_review_request: null,
        },
      });
      return { item: cardItem(updated) };
    });
  }
  private async owned(tx: Prisma.TransactionClient, actor: Profile, rawId: string) {
    const user_id = parseId(actor.id);
    await lockKey(tx, `reading:${user_id}`);
    const card = await tx.study_cards.findFirst({ where: { id: parseId(rawId), user_id } });
    if (!card) throw new NotFoundException('Không tìm thấy thẻ ôn tập.');
    await this.library.access(tx, actor, card.version_id);
    return card;
  }
  async update(actor: Profile, rawId: string, body: UpdateStudyCardDto) {
    return this.db.$transaction(async (tx) => {
      const card = await this.owned(tx, actor, rawId);
      if (card.revision !== body.revision) throw stale();
      const updated = await tx.study_cards.update({
        where: { id: card.id },
        data: {
          question: body.question,
          answer: body.answer,
          revision: { increment: 1 },
          updated_at: new Date(),
        },
      });
      return { item: cardItem(updated) };
    });
  }
  async remove(actor: Profile, rawId: string, body: StudyCardRevisionDto) {
    await this.db.$transaction(async (tx) => {
      const card = await this.owned(tx, actor, rawId);
      if (card.revision !== body.revision) throw stale();
      await tx.study_cards.delete({ where: { id: card.id } });
    });
  }
}
