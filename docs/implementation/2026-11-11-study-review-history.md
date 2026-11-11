# STUDY-04 — Lịch sử ôn, thống kê, xuất thẻ và nhắc thẻ đến hạn

Ngày 11/11/2026. Nhánh `codex/study-review-history`, xây trên `main` `be5e723` (sau PR #77). Làm nốt ba việc còn lại của [STUDY-03](2026-11-04-study-schedule.md) và thêm xuất thẻ ra file.

## Đã chốt

Theo lựa chọn khuyến nghị, đổi được sau:

- **Chỉ lượt "Ôn thẻ đến hạn" được ghi lịch sử**, giống STUDY-03: mỗi câu trả lời đã lưu là một dòng `study_card_reviews` (ngày theo giờ Việt Nam, kết quả, hộp sau khi trả lời). Lượt luyện tự do không được ghi. Gửi lại cùng `requestId` không tạo dòng thứ hai.
- **Lịch sử không chứa nội dung thẻ** và được giữ khi xóa thẻ (`card_id` thành NULL), nên tổng số không bị giảm.
- **Thống kê tính trên toàn bộ thẻ của người dùng**, không theo bộ lọc môn/tài liệu: biểu đồ 30 ngày gần nhất, tổng số câu nhớ/chưa nhớ từ trước tới nay, chuỗi ngày ôn liên tiếp và số thẻ đọc được trong từng hộp. Chuỗi vẫn được tính tới hết ngày hôm sau, để sáng sớm chưa ôn thì chuỗi chưa bị mất.
- **Xuất thẻ** theo bộ lọc đang chọn, dạng Markdown hoặc văn bản, gồm câu hỏi, đáp án, đoạn tô, trang và lịch ôn. Chỉ xuất thẻ của tài liệu còn đọc được, tối đa 5.000 thẻ mỗi file. Markdown được escape như khi xuất ghi chú.
- **Nhắc thẻ đến hạn mặc định tắt.** Trong Cài đặt có ba lựa chọn: không nhắc, chuông thông báo, chuông và email. Mỗi ngày có tối đa một thông báo, gửi sau 7 giờ sáng giờ Việt Nam và chỉ khi có thẻ đến hạn đọc được. Thông báo ghi số thẻ và dẫn tới `/workspace/study?on=due`.
- **Phím tắt khi ôn:** Space hiện đáp án, 1 là "Chưa nhớ", 2 là "Nhớ". Phím tắt không chạy khi đang gõ trong ô nhập, khi nhấn kèm Ctrl/Alt/Meta, hoặc (với Space) khi đang đứng trên nút hoặc liên kết. Nút có `aria-keyshortcuts`.

## API

- `POST /study-cards/:id/review` ghi thêm một dòng lịch sử trong cùng giao dịch.
- `GET /study-cards/stats`: `{ today, from, days[{date, known, again}], totals, streak, reviewedToday, boxes[{box, cards}] }`.
- `GET /study-cards/export?format=markdown|text[&courseId][&versionId]`: file `the-on-tap.md|txt`, kèm `Cache-Control: no-store`. Trả 409 `EXPORT_TOO_LARGE` khi vượt giới hạn.
- `PUT /account/preferences` nhận thêm `studyReminder` (`OFF`/`BELL`/`EMAIL`), không bắt buộc.
- `StudyReminders` chạy trên file-worker, cùng nhịp mỗi phút với nhắc lịch, nhưng là service riêng nên không ảnh hưởng số đếm của `CalendarReminders`.

## Migration `202611100002_study_review_history`

Bảng `study_card_reviews` (FK tới người dùng cascade, tới thẻ set null; CHECK kết quả và hộp), cột `user_preferences.study_reminder`, loại thông báo `STUDY_CARDS_DUE` (không gắn tài liệu hay mục lịch). `ck_notification_detail` cho phép riêng loại này lưu số thẻ; các loại khác vẫn chỉ lưu mã lý do. Database test có 41 bảng, 77 FK, 136 CHECK và 19 partial index.

Database dev local cần chạy `pnpm --filter @hucescholar/api db:migrate` sau khi merge.

## Kiểm chứng local

- API: lint, typecheck, unit test (224 pass, 2 skip) và toàn bộ test tích hợp (thêm ba test STUDY-04: thống kê và quyền riêng tư, xuất file và escape, nhắc buổi sáng với chuông/email/giờ/thẻ ẩn).
- Web: lint, typecheck và `pnpm build`.
- E2E Playwright Chromium: toàn bộ spec đạt. `study-04.spec.ts` kiểm tra ôn bằng phím tắt, bảng thống kê, tải file Markdown, chọn nhắc trong Cài đặt và mở thông báo.
- Email nhắc mới được kiểm bằng mailer giả trong test, chưa gửi thật qua SMTP. Chưa kiểm chứng production hoặc thiết bị thật.
