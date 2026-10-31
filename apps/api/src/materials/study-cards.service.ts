import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DatabaseService } from '../database/database.module';
import { Prisma, type study_cards } from '../generated/prisma/client';
import { academicId } from '../academic/academic.service';
import { Profile } from '../auth/auth.types';
import { available, LibraryService } from './library.service';
import {
  CreateStudyCardDto,
  StudyCardListDto,
  StudyCardRevisionDto,
  StudyCardScopeDto,
  UpdateStudyCardDto,
} from './study-cards.dto';

/** A practice round loads at most this many cards, newest first. */
export const MAX_PRACTICE_CARDS = 200;

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
    const user_id = academicId(actor.id),
      version_id = academicId(rawVersionId),
      annotationId = academicId(body.annotationId);
    return this.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`hucescholar:reading:${user_id}`}, 0))`;
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
      user_id: academicId(actor.id),
      ...(query.versionId ? { version_id: academicId(query.versionId) } : {}),
      ...(query.courseId
        ? {
            document_versions: {
              version_courses: { some: { course_id: academicId(query.courseId) } },
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
  private async owned(tx: Prisma.TransactionClient, actor: Profile, rawId: string) {
    const user_id = academicId(actor.id);
    await tx.$queryRaw`SELECT 1 AS locked FROM pg_advisory_xact_lock(hashtextextended(${`hucescholar:reading:${user_id}`}, 0))`;
    const card = await tx.study_cards.findFirst({ where: { id: academicId(rawId), user_id } });
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
