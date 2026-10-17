# HUCEScholar V2 — Reader và kho học liệu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Mọi task bên dưới là kế hoạch, chưa triển khai.

**Goal:** Chọn chữ để tô/ghi chú/trích dẫn ngay trong reader, tìm lại ghi chú mọi trang và giảm công cụ chiếm diện tích.

**Architecture:** Giữ PDF.js và annotations/version/page hiện hữu. Tách selection toolbar và panel khỏi `ReaderHighlights`, dùng API CRUD hiện tại; thêm một endpoint tìm annotations toàn phiên bản. Các file PDF/Word gốc không thay đổi.

**Tech Stack:** TypeScript, React/Next.js, NestJS, PostgreSQL/Prisma, PDF.js, Jest/Supertest, Playwright, pnpm.

**Spec:** [Workspace V2](../specs/2026-10-17-workspace-v2-design.md), mục reader và đợt B1/B2. Phụ thuộc UI-01/02; focus mode tích hợp NAV-01.

## Global Constraints

- Chỉ annotations riêng owner/version/page; ADMIN không đọc note của người khác. Mỗi request kiểm quyền tài liệu hiện tại ở API.
- Giữ anchor `normalized-pdf-v1`, quote ≤2000 ký tự, tối đa100 quads/trang, note ≤4000 và create requestId chống nhân đôi. Giữ update/delete CAS.
- Bản cũ không tự chuyển anchor sang PDF mới. DOCX vẫn đọc PDF rendition; không sửa Word hoặc PDF gốc.
- Không thêm OCR, AI, public share, đồng bộ offline hoặc xuất PDF trong đợt B. Không lưu note/quote vào URL, localStorage/service worker hoặc analytics.
- Tách draft, selected saved annotation và active page; trang đổi không được đổi ngầm đích lưu bản soạn.
- Danh sách bảng `annotations` đã có `color varchar(7)` và CHECK hex, không whitelist ba màu ở DB. Palette mở rộng ở API/client; **không tạo migration chỉ để thêm màu**.

## Review Focus

1. Click toolbar làm vùng chọn biến mất/đổi trang trước lưu → READ-03 snapshot anchor/page trước chuyển focus.
2. Zoom/xoay/scroll/textlayer render lại làm highlight hoặc popup sai → READ-03 geometry và viewport tests.
3. Một request tạo đã lưu nhưng mất response, retry nhân đôi → READ-03 giữ requestId và reconciliation hiện hữu.
4. ID/cursor version khác hoặc đổi owner lọt dữ liệu → LEARN-01 integration kiểm hai người + ADMIN + mất quyền.
5. Quote đúng chữ nhưng sai trang/link hoặc clipboard thất bại vẫn báo thành công → CITE-01 provenance/link/fallback tests.

## File map

| File hiện có / file mới đề xuất                                                                                                 | Thay đổi                                                                                 |
| ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `apps/web/components/library/library-reader.tsx`                                                                                | Composition panel/focus/find, render lifecycle và deep link trang                        |
| `apps/web/components/library/reader-highlights.tsx`                                                                             | Giữ CRUD/draft/CAS, tách presentation, palette mở rộng                                   |
| `apps/web/components/library/reader-notes.tsx`                                                                                  | Dùng chung panel nhưng giữ note-kind và bản soạn riêng                                   |
| `apps/web/components/library/reader-selection-toolbar.tsx` (mới)                                                                | Selection actions, placement, keyboard fallback                                          |
| `apps/web/components/library/reader-annotation-panel.tsx` (mới)                                                                 | Tabs trang hiện tại/toàn phiên bản, editor và filter                                     |
| `apps/web/components/library/reader-find.tsx` (mới)                                                                             | Tìm chữ/outline, hủy tìm kiếm khi đổi PDF                                                |
| `apps/web/components/library/use-notes-leave-guard.ts`                                                                          | Tái dùng guard; đăng ký draft/pending từ panel mới                                       |
| `apps/web/lib/highlights.ts`, `highlight-geometry.ts`, `reading.ts`                                                             | Types/validation/CRUD và geometry hiện hữu                                               |
| `apps/web/lib/citations.ts` (mới)                                                                                               | Formatter plain text + link nội bộ đúng version/page                                     |
| `apps/web/lib/annotations.ts` (mới)                                                                                             | Client hợp đồng search annotations                                                       |
| `apps/api/src/materials/highlight.dto.ts`                                                                                       | API palette mở rộng                                                                      |
| `apps/api/src/materials/reading.controller.ts`, `reading.dto.ts`, `reading.service.ts`                                          | Thêm search, giữ endpoint theo trang                                                     |
| `apps/web/components/library/library-catalog.tsx` và `lib/library.ts`                                                           | Filter compact, result/context, không thêm fake search                                   |
| `apps/web/app/globals.css` và library `DESIGN_BRIEF.md`                                                                         | Responsive panel, toolbar, focus mode, palette                                           |
| `apps/api/test/reading-v2.integration.spec.ts` (mới)                                                                            | API quyền/pagination                                                                     |
| `tests/citations.spec.ts` (mới), `tests/reader-v2.spec.ts` (mới), `tests/materials.spec.ts`, `tests/highlight-geometry.spec.ts` | Formatter thuần theo pattern geometry tests, hành trình mới và regression guard/geometry |

Nếu tách service khi `ReadingService` quá lớn, chỉ tách query annotations thành `annotation-query.service.ts`; không refactor CRUD/progress không liên quan.

## Contract đề xuất — annotations toàn phiên bản

Giữ nguyên GET notes/highlights bắt buộc `pageNumber` và mọi POST/PATCH/DELETE hiện hữu. Không đổi ý nghĩa query cũ để màn hình cũ tiếp tục dùng được.

```ts
// POST /api/v1/library/versions/:id/annotations/search
// SessionGuard + CsrfGuard; body không chứa userId.
type AnnotationSearch = {
  kind?: 'PAGE_NOTE' | 'TEXT_HIGHLIGHT';
  color?: HighlightColor; // palette hợp lệ; chỉ hợp với kind TEXT_HIGHLIGHT
  query?: string; // trim, tối đa100 ký tự, literal substring
  cursor?: string; // opaque, tối đa256 ký tự
  limit?: number; // 1..50, mặc định20
};
type AnnotationSearchResult = {
  items: Array<PageNote | TextHighlight>;
  nextCursor: string | null;
};
```

- Tìm plain text không phân biệt hoa thường trong content và highlight `anchor.quote`; escape `%`, `_`, `\` nếu dùng SQL LIKE. Không hứa không dấu trong task này.
- `color` kèm `kind=PAGE_NOTE` trả400; chỉ color thì tự giới hạn TEXT_HIGHLIGHT. Filter đổi phải reset cursor/UI list; không trộn response cũ.
- Sort `(page_number ASC, id ASC)` với keyset cursor. Cursor encode tuple/version/filter fingerprint, parse/validate nghiêm; không phải token cấp quyền. Chủ luôn lấy từ session, không từ cursor/body. Cursor không hợp trả400; tài liệu mất quyền dùng quy ước lỗi library hiện hữu.
- Response `PageNote` không anchor; `TextHighlight` có anchor/color như hiện tại; ID chuỗi, revision số. `no-store`; request logging không ghi search body hoặc nội dung annotations.
- Page search là bounded query, không gọi API từng trang PDF. Đo query/index hiện hữu trước khi đề xuất migration; không thêm fulltext engine cho một version.

## Task READ-02 — Palette 8 màu tương thích

- [ ] Giữ `#FFF59D` Vàng, `#A5D6A7` Xanh lá, `#90CAF9` Xanh dương; đề xuất thêm `#F8BBD0` Hồng, `#CE93D8` Tím, `#FFCC80` Cam, `#80CBC4` Xanh ngọc, `#B0BEC5` Xám. Xem contrast trên PDF chữ đen/trang màu trước khóa palette.
- [ ] Cập nhật API whitelist, client decoder và color selector cùng một lát cắt; test mọi màu được tạo/sửa/reload, mã lạ bị400. Không chỉ mở CSS để API từ chối lưu.
- [ ] Trước bật ghi màu mới, kiểm tab/client cũ và rollback: decoder đọc `color: string` kiểm hex6 và có tên dự phòng; input ghi dùng union `HighlightColor`8 màu. Editor gặp màu ngoài palette phải yêu cầu chọn màu trước PATCH, không tự đổi màu. Phát hành decoder tương thích trước rồi mở palette, yêu cầu tải lại tab cũ chưa tương thích; không rollback về decoder ba màu khi đã ghi màu mới.
- [ ] Color swatch có tên, selected marker và focus; không dùng màu làm nhãn duy nhất. Giữ geometry/opacity bảo toàn chữ và màu hiển thị.
- [ ] Unit test API validation + browser ba màu cũ và màu mới. Chạy `pnpm test`, `pnpm test:integration`, `pnpm test:e2e tests/reader-v2.spec.ts` khi fixture mới sẵn sàng.

Nghiệm thu: dữ liệu cũ đọc/sửa được; màu mới đúng sau đăng nhập lại; không migration dữ liệu cũ.

## Task READ-03 — Thao tác trực tiếp và panel gọn

- [ ] Chốt contract selection UI: `{versionId,pageNumber,anchor,viewportRect}` snapshot từ text layer hiện hữu; rect phục vụ hiển thị, không lưu làm anchor. Toolbar chỉ hiện khi chọn chữ hợp lệ của đúng page/version.
- [ ] Thêm Tô sáng/Ghi chú/Trích dẫn gần đoạn chọn. Snapshot selection trước focus/click; toolbar nằm trong viewport khi scroll hoặc chọn sát mép, có fallback nút trong thanh đọc cho keyboard. Selection nhiều trang/2001 ký tự báo lý do, không tự cắt mất phần cuối.
- [ ] Chọn highlight đã lưu → mở editor/palette tại panel, có nhãn trang và quote; list keyboard là đường tương đương khi overlay không có focus. Nhiều highlight chồng nhau cho chọn trong list, không tự chọn sai bản ghi.
- [ ] Tạo note gắn đoạn dùng TEXT_HIGHLIGHT và content tùy chọn; note cả trang vẫn PAGE_NOTE. Đổi màu/nội dung dùng PATCH hiện hữu; không sửa quote/quads bằng PATCH cũ.
- [ ] Panel desktop bên phải khi đủ chỗ; một cột màn hẹp. Mỗi thời điểm chỉ một editor đang hoạt động; chuyển note/highlight hỏi giữ/bỏ khi dirty; đừng tạo hai guard độc lập tranh nhau. Giữ feedback lưu chưa xong/lỗi/409 và retry có requestId.
- [ ] Dùng `tests/helpers/reader-pdf.ts`: tạo multi-page selectable text và scan; test chọn bằng mouse/keyboard, sửa highlight cũ, lỗi timeout sau commit/retry chỉ có một item, xung đột tab giữ nội dung. Test rotation 0/90/180/270 và zoom/fit không đổi trang đích.
- [ ] Regression `tests/materials.spec.ts`, `tests/highlight-geometry.spec.ts` và `tests/lecturer-document-upload.spec.ts` để PDF rendition DOCX vẫn note/highlight bình thường. Chạy `pnpm check`, integration và targeted browser.

Nghiệm thu: đọc → chọn → tô/note → sửa/xóa từ trang hoặc danh sách; bản lưu không đổi file gốc, đang soạn không bị mất bởi điều hướng/menu mới.

## Task CITE-01 — Trích dẫn có nguồn và mở lại đúng chỗ

- [ ] Formatter nhận `{quote,title,authors?,versionNo,versionId,pageNumber,origin}`; quote là plain text từ vùng chọn thật. Output đề xuất: `“{quote}” — {title}; {authors nếu có}; phiên bản {n}; trang PDF {p}. {link}`. Không gọi đây là chuẩn APA/IEEE; thiếu tác giả thì bỏ, không điền giả.
- [ ] Link dùng `/workspace/library/versions/{id}?page={p}` cùng origin được cấu hình/xác minh, không signed URL hoặc quote/note. Reader validate page là integer1..pageCount sau tải PDF; link sai trang báo rõ và không lưu progress trang không render.
- [ ] Ưu tiên explicit page trong link khi mở; nếu có progress cũ khác, hiển thị “Đang mở trang được dẫn” và nút quay tiến độ trước. Chỉ ghi progress khi trang link render thành công; guard nếu điều hướng từ bản soạn đang mở.
- [ ] Clipboard chỉ ghi khi người dùng bấm; đợi Promise thành công mới thông báo. Nếu quyền clipboard không có/HTTP không hỗ trợ, hiện ô plain text read-only và nút chọn để copy thủ công; không tự gửi quote ra bên ngoài.
- [ ] Copy đoạn chưa highlight không tạo annotation âm thầm. Nút “Lưu đoạn vào ghi chú” là thao tác riêng, tạo highlight qua flow READ-03 với requestId, quote và anchor không đổi.
- [ ] Test tiêu đề/quote có HTML, xuống dòng, tiếng Việt, thiếu authors; xác nhận output plain text/không script. Test link người khác không có quyền không đọc được, mở bản mới không đổi version cũ, clipboard deny không báo đã sao chép.
- [ ] Chạy `pnpm test:e2e tests/citations.spec.ts tests/reader-v2.spec.ts` và `pnpm typecheck`. Formatter test import hàm thuần như `tests/highlight-geometry.spec.ts`, không cần page/browser globals; không đổi Jest root để test helper frontend.

Nghiệm thu: đoạn trích có nguồn/version/trang, liên kết mở đúng trang khi có quyền; copy không đồng nghĩa chia sẻ quyền tài liệu hoặc tải file.

## Task LEARN-01 — Ghi chú toàn phiên bản

- [ ] Viết integration theo contract: hai chủ cùng version; PAGE_NOTE và TEXT_HIGHLIGHT nhiều trang; hơn20 items, cùng page nhiều ID; query/kind/color/limit/cursor invalid; admin không đọc người khác; ẩn tài liệu/khóa account chặn request.
- [ ] Implement DTO/controller/query bằng owner/session và library access hiện hữu; keyset page/id, limit+1; không query toàn thư viện hoặc tải tất cả trang về browser.
- [ ] Panel có tab Trang này/Toàn tài liệu, filter chữ/loại/màu, load-more/retry. Search submit hoặc debounce có hủy request cũ; version/filter đổi reset list/cursor, vẫn giữ editor có dirty state.
- [ ] Chọn item điều hướng tới đúng page/annotation ID; kiểm bản soạn trước chuyển, scroll/focus sau PDF render, không đưa nội dung note vào URL. Không gọi đó là sổ tay toàn kho; vẫn scope một version.
- [ ] Test API timeout, đổi query nhanh, xóa mục cuối và list rỗng, item bị sửa tab khác, chuyển version, thu hồi quyền trong lúc đang mở. Không có duplicate ID khi pagination.
- [ ] Chạy `pnpm test:integration`, `pnpm test:e2e tests/reader-v2.spec.ts`, `pnpm check`. Ghi baseline query trên fixture nhiều annotations trước tối ưu index.

Nghiệm thu: không cần nhớ số trang để tìm lại; dữ liệu riêng tư và version không bị trộn; pagination/response muộn không làm hiện kết quả cũ.

## Task READ-01 — Find, outline và focus mode

- [ ] Dùng text content/outline PDF.js hiện hữu; find tăng dần theo lô, dừng/hủy khi đổi document hoặc đóng reader. Không giữ text của toàn kho ở browser.
- [ ] Next/previous match kèm trang/số kết quả đang tìm; marker tìm kiếm tách lớp khỏi highlight đã lưu, không gọi write annotation. Query dài giới hạn100 ký tự; khi scan không có text báo đúng, vẫn cho note trang.
- [ ] Outline hiển thị chỉ khi có bookmark; resolve destination đúng trang, không mở javascript/URL ngoài từ PDF âm thầm. Đi qua guard khi nhảy trang trong lúc đang soạn.
- [ ] Focus mode thu chrome/sidebar/panel theo lựa chọn, giữ controls thiết yếu/trạng thái lưu và nút thoát. Escape đóng popup đang mở trước, không thoát hàng loạt mọi lớp.
- [ ] Browser tests scan/text/outline không có hoặc lỗi, tìm tiếng Việt/nhiều match, cancel, zoom/rotate sau jump, keyboard, viewport320/390/768/1440. Không claim tìm không dấu/OCR.
- [ ] Chạy targeted reader/guard tests và `pnpm check`; trước tích hợp reader đợt B chạy full browser một lượt.

## Task SEARCH-02 — Kho học liệu gọn và dễ quay lại

- [ ] Hàng chính gồm tìm tiêu đề/tác giả, môn và nút lọc; filter ít dùng đưa vùng thu gọn có nhãn/số filter đang bật. Giữ kết quả/empty/error và pagination thấy được, không mở drawer chỉ để đổi một giá trị.
- [ ] Giữ public filters trong URL, validate enum/page, Back/Forward khôi phục; chọn filter mới về trang1; request muộn không ghi đè query mới. Không đưa ghi chú riêng hoặc search trong sổ tay lên URL.
- [ ] Dòng tài liệu có title/authors nếu có/loại/version/nguồn và mở đọc; action phụ trong vùng rõ ràng. Không thêm bìa giả/statistic giả; giữ tải theo quyền và lưu tài liệu hiện hữu.
- [ ] Test nhiều filter rồi back, clear filter, không kết quả, timeout/retry, tiêu đề dài, mobile. Không mở rộng SQL tìm không dấu ở task layout; việc đó thuộc IDEA-14/SEARCH-01.
- [ ] Chạy `pnpm test:e2e tests/reader-v2.spec.ts tests/ui-refinements.spec.ts tests/materials.spec.ts` và `pnpm check`.

## Đóng đợt B

- [ ] Ghi implementation log cho READ/CITE/LEARN, cập nhật brief và PRODUCT chỉ khi đã chạy thật. Không đánh dấu tính năng hoàn thành từ plan.
- [ ] Kiểm regression note cũ, PDF cũ, DOCX rendition, personal library/resume, ba role, lost access và Back/Forward; không lặp toàn suite sau mỗi sửa CSS nếu targeted đã đủ, nhưng full suite trước tích hợp.
- [ ] Bàn giao cho PREF-01 đúng enum8 màu và options zoom đã thực sự hỗ trợ; mặc định mới không sửa các highlight đã lưu.
