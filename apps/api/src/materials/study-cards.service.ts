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
  UpdateStudyCardDto,
} from './study-cards.dto';

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
  async list(actor: Profile, query: StudyCardListDto) {
    const user_id = academicId(actor.id);
    const scope: Prisma.study_cardsWhereInput = {
      user_id,
      ...(query.versionId ? { version_id: academicId(query.versionId) } : {}),
    };
    const readable: Prisma.study_cardsWhereInput = { ...scope, document_versions: available() };
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
