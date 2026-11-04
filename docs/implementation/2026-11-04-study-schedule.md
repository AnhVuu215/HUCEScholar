# STUDY-03 — Ôn thẻ theo lịch

Ngày 04/11/2026. Nhánh `codex/study-schedule`, xây trên `main` `0c5c116` (sau PR #74). [STUDY-02](2026-10-31-study-card-practice.md) để lại hai việc: lưu kết quả luyện và ôn theo lịch, đưa thẻ đến hạn lên Lịch học. Mốc này làm cả hai.

## Đã chốt

Theo lựa chọn khuyến nghị, đổi được ở API:

- **Hộp Leitner, không dùng SM-2.** Thẻ có 6 hộp, ôn lại sau 1, 3, 7, 14, 30 và 60 ngày. Cách này dễ giải thích với người học và không có tham số phải tinh chỉnh. Khoảng cách nằm trong `study-schedule.ts`.
- **"Nhớ" lên một hộp, "Chưa nhớ" về hộp 1 và ôn lại ngày mai,** từ bất kỳ hộp nào. Thẻ quá hạn vẫn tính từ hộp đang có, không bị phạt thêm.
- **Chỉ lượt "Ôn thẻ đến hạn" mới lưu.** "Luyện N thẻ" và các lượt ôn lại sau tổng kết chỉ để luyện, không đổi lịch. Nhờ vậy luyện thêm trước kỳ thi không làm hỏng lịch.
- **Thẻ cũ và thẻ mới đến hạn ngay trong ngày.** Sau migration, mọi thẻ hiện có đều đến hạn từ hôm đó.
- **Ngày tính theo giờ Việt Nam**, không theo múi giờ máy người dùng. Thẻ đến hạn lúc 0:00 giờ Việt Nam.
- **Không gửi nhắc** qua chuông thông báo hay email. Thẻ đến hạn hiện ở trang đầu và Lịch học; nhắc mỗi ngày dễ gây phiền, nên chờ phản hồi người dùng.
- **Không giới hạn số thẻ mỗi ngày.** Một lượt tối đa 200 thẻ đến hạn lâu nhất, phần còn lại sang lượt sau.
- **Sửa nội dung thẻ không đổi lịch**, và chấm thẻ không tăng `revision`, nên ôn ở tab này không làm tab khác đang sửa thẻ bị báo xung đột.

## Hành vi

**Trang Thẻ ôn tập:**

- Có thẻ đến hạn thì hiện nút **Ôn N thẻ đến hạn**, cạnh nút **Luyện N thẻ**. Hai nút theo bộ lọc môn, tài liệu.
- Không có thẻ đến hạn thì ghi "Hôm nay không có thẻ đến hạn. Lần ôn tiếp theo: ngày (k thẻ)".
- Mỗi thẻ ghi "Đến hạn ôn" hoặc "Ôn lại ngày …", kèm "Thẻ mới" hoặc "Hộp x/6".
- **Ôn lại từ đầu** đưa thẻ về như chưa từng ôn, đến hạn ngay hôm nay.

**Lượt ôn:**

- Mỗi câu trả lời được lưu trước khi sang thẻ tiếp. Lưu lỗi thì giữ nguyên thẻ, báo lỗi, cho thử lại hoặc **Bỏ qua thẻ này**.
- Thử lại dùng cùng `requestId`, nên mất phản hồi cũng không làm thẻ lên hai hộp.
- Thẻ đã được chấm ở tab khác thì lượt ôn tự sang thẻ tiếp.

**Trang đầu:** ba vai trò thấy mục **Thẻ cần ôn hôm nay** khi có thẻ đến hạn; không có thì mục này ẩn. Link mở thẳng lượt ôn (`/workspace/study?on=due`).

**Lịch học:** cả ba chế độ xem hiện "N thẻ đến hạn ôn". Hôm nay gồm cả thẻ quá hạn và mở thẳng lượt ôn; ngày sau chỉ mở danh sách thẻ. Không tải được số liệu thì lịch vẫn dùng bình thường.

## API và schema

Cần phiên đăng nhập; lệnh ghi cần CSRF. Thẻ của tài liệu không còn đọc được không được trả về, không chấm được, nhưng vẫn giữ lịch.

- `GET /api/v1/study-cards/due?versionId=&courseId=`: `{ items, total }`, thẻ đến hạn và quá hạn, lâu nhất trước, tối đa 200.
- `GET /api/v1/study-cards/schedule?from=&to=&versionId=&courseId=`: `{ today, dueNow, days: [{ date, count }] }`. Khoảng tối đa 92 ngày; ngày sai trả 400.
- `POST /api/v1/study-cards/:id/review` với `{ result: 'KNOWN' | 'AGAIN', requestId }`. Thẻ chưa đến hạn trả 409 `STUDY_CARD_NOT_DUE`.
- `POST /api/v1/study-cards/:id/reset-schedule`.
- Mỗi thẻ có thêm `reviewBox`, `dueOn`, `lastReviewedAt`.

Migration `202611040001_study_card_schedule` thêm `review_box`, `due_on`, `last_reviewed_at`, `last_review_request` vào `study_cards`, ràng buộc `ck_study_card_box` (0–6) và chỉ mục `ix_study_card_due`. Không thêm bảng.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` sau `pnpm test:setup`, Chrome do Playwright điều khiển:

- **Unit `study-schedule.spec.ts`, 4 ca:** đi qua đủ 6 hộp và dừng ở hộp cuối; quên từ mọi hộp về hộp 1; ranh giới ngày Việt Nam; qua tháng, qua năm nhuận.
- **Integration STUDY-03:** thẻ mới đến hạn ngay; người khác không thấy và không chấm được; gửi lại cùng `requestId` không đổi gì; thẻ chưa đến hạn bị 409; đếm theo ngày; thẻ quá hạn xếp trước; sửa nội dung không đổi lịch; ôn lại từ đầu; dữ liệu sai trả 400; chưa đăng nhập trả 401; tài liệu bị ẩn thì thẻ mất khỏi lượt ôn, chấm trả 404, lịch được giữ.
- **Browser `tests/study-03.spec.ts`:** vào từ trang đầu; lưu lỗi thì ở lại thẻ, thử lại được; tổng kết "nhớ 1 / 2"; lượt ôn lại không gửi lệnh lưu nào; cả hai thẻ sang ngày mai; chip trên Lịch biểu; ôn lại từ đầu; chip hôm nay mở lượt ôn.
- `study-02`, `cal-01`, `cal-04` vẫn đạt.
- Lỗi tự phát hiện khi viết: `from=2026-13-45` khớp regex nhưng làm API lỗi 500; nay trả 400 và có test.

Chưa thử với người học thật, nên khoảng cách 1–60 ngày chưa được kiểm chứng về hiệu quả. Chưa thử với trình đọc màn hình thật.

## Chưa làm

- Nhắc qua chuông thông báo hoặc email, theo quyết định ở trên.
- Thống kê ôn tập theo thời gian: mốc này chỉ giữ trạng thái hiện tại của thẻ, không giữ lịch sử từng lần ôn.
- Phím tắt riêng cho "Hiện đáp án", "Nhớ", "Chưa nhớ".
