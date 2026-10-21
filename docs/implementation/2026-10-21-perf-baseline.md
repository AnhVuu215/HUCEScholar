# PERF-01 — Mốc đo trước khi tối ưu

Ngày 21/10/2026. Nhánh `codex/perf-01-baseline`, xây trên `main`. Roadmap yêu cầu đo trước, có bộ dữ liệu tạo lại được, và **chỉ đặt mục tiêu số sau khi có mốc**. Lượt này chỉ tạo công cụ đo và ghi mốc, chưa tối ưu và chưa đặt mục tiêu.

## Cách chạy

```
pnpm test:setup
PERF=1 pnpm test:e2e --workers=1 tests/perf-baseline.spec.ts
```

- Tùy chọn: `PERF_ROWS` (mặc định 20000), `PERF_PAGES` (400), `PERF_CPU` (4 = CPU chậm 4 lần qua Chrome DevTools).
- Thiếu `PERF=1` thì spec tự bỏ qua, nên CI và `pnpm test:e2e` thường không chạy nó.
- Kết quả ghi vào `test-results/perf/baseline.json`: từng mẫu, trung vị và giá trị lớn nhất.

## Đo gì

**Thư viện**: `GET /api/v1/library`.

- Tạo `PERF_ROWS` tài liệu giảng viên tổng hợp trong một môn: tên tiếng Việt có dấu, 4 loại × 8 môn × 4 tác giả.
- Tạo theo đúng thứ tự trạng thái mà API dùng: bản nháp kèm môn, sau đó chuyển APPROVED và đặt làm bản hiện hành. Trigger `version_search` tự sinh chữ đã bỏ dấu.
- Sau đó `ANALYZE` rồi gọi API thật bằng tài khoản sinh viên: 1 lượt khởi động, 7 lượt đo cho mỗi trường hợp. Thời gian đo phía client qua loopback, nên gồm cả xác thực phiên và serialize.
- Đo xong xóa toàn bộ dữ liệu mẫu theo khóa `perf/<mã>/` trong một transaction. Chỉ trong bước dọn này, hai trigger bảo vệ phiên bản bị tắt rồi bật lại.

**Reader**: một PDF chữ tổng hợp `PERF_PAGES` trang (40 dòng mỗi trang, 1,36 MB), đi qua luồng bản nháp → duyệt. Kết quả quét được ghi giả lập trong DB test. Đo 3 lượt với CPU chậm `PERF_CPU` lần:

- mở trang 1 cho tới khi hiện "Đã hiển thị trang 1 / N"
- nhảy tới trang cuối
- tìm một từ chỉ có ở trang cuối cho tới khi quét xong N/N trang

## Mốc 21/10/2026

Máy dev Windows 11, Node 24.19.0. PostgreSQL và Redis chạy trong Docker local. Web chạy `next dev` của Playwright, không phải bản build. Chromium của Playwright. 20.000 tài liệu, PDF 400 trang, CPU chậm 4×.

Thư viện, trung vị / lớn nhất của 7 lượt (ms):

| Trường hợp | Kết quả | Lượt 1 | Lượt 2 |
| --- | --- | --- | --- |
| Lọc theo môn, trang 1 | 20.001 | 184 / 238 | 182 / 191 |
| Lọc theo môn, trang 500 | 20.001 | 229 / 265 | 198 / 212 |
| Tìm "thuy luc" | 2.500 | 184 / 225 | 160 / 170 |
| Tìm "giao trinh co hoc tap" (3+ từ) | 2.500 | — ¹ | 161 / 171 |
| Tìm cụm hiếm | 20 | 139 / 170 | 132 / 149 |
| Không có kết quả | 0 | 42 / 74 | 49 / 96 |
| Toàn kho, không lọc | ~21.100 | 134 / 172 | 143 / 317 |

¹ Lượt 1 dùng tổ hợp từ không bao giờ cùng xuất hiện trong dữ liệu mẫu (0 kết quả, 35 ms). Đã sửa, và spec nay kiểm số kết quả của trường hợp này.

Reader, CPU chậm 4×, trung vị / lớn nhất của 3 lượt (ms):

| Bước | Lượt 1 | Lượt 2 |
| --- | --- | --- |
| Mở trang 1 | 5.511 / 9.733 | 6.832 / 11.609 |
| Nhảy tới trang 400 | 1.170 / 1.198 | 1.450 / 2.087 |
| Tìm chữ toàn bộ 400 trang | 9.073 / 10.826 | 11.472 / 11.521 |

Lượt chạy nhỏ để thử công cụ (2.000 tài liệu, PDF 60 trang): truy vấn thư viện 45–55 ms, mở trang 1 khoảng 5 giây, nhảy trang khoảng 1,3 giây, tìm chữ khoảng 2,5 giây.

## Nhận xét, chưa phải kết luận

- Thời gian thư viện tăng theo **số dòng khớp**, không theo việc có từ tìm hay không: không khớp khoảng 45 ms, 20 kết quả khoảng 135 ms, vài nghìn kết quả trở lên khoảng 160–200 ms. Phần lọc chữ đã bỏ dấu trước đây đo khoảng 10 ms/50.000 dòng, nên chi phí có lẽ nằm ở danh sách id, đếm tổng hoặc join quyền đọc. Chưa chạy `EXPLAIN` cho truy vấn Prisma; nên làm bước đó trước khi sửa gì.
- Lượt mở trang đầu tiên luôn chậm nhất (9,7–11,6 giây), vì `next dev` còn biên dịch route và PDF.js khởi động lần đầu. Hai lượt sau ổn định hơn.
- Tìm chữ quét lần lượt 400 trang. Ở CPU chậm 4×, mất khoảng 23–29 ms mỗi trang.
- Hai lượt chạy cùng cấu hình lệch nhau tới khoảng 25% ở reader. Muốn so sánh trước và sau một thay đổi, nên chạy ít nhất hai lượt và so trung vị.

## Giới hạn

- Không phải số đo production: `next dev`, loopback, Docker trên máy dev. CPU chậm giả lập không thay cho điện thoại hay máy cấu hình thấp thật; chưa đo trên thiết bị thật, S3 hay HTTPS.
- PDF tổng hợp chỉ có chữ Helvetica. PDF scan nặng ảnh hoặc font nhúng sẽ cho số khác.
- Spec để lại một tài liệu dài đã duyệt trong DB test, giống dữ liệu các e2e khác để lại.
- Chưa đặt mục tiêu số. Theo roadmap, mục tiêu chỉ chốt sau khi có mốc này và quyết định trước về máy hoặc thiết bị tham chiếu.

## Kiểm chứng

- Sau khi gộp `main` (PR #22): `pnpm format:check`, `pnpm check` (lint, typecheck, 104 unit, build) đạt.
- Chưa chạy lại cả bộ e2e trên máy, vì lượt này chỉ thêm một spec tự bỏ qua và ba tài khoản test; CI chạy bộ đầy đủ.
- Không có `PERF=1`, spec bỏ qua cả hai ca. Với `PERF=1`, hai lượt đầy đủ đều đạt (1,7 phút mỗi lượt); sau khi chạy, DB test không còn dòng `perf/%` và hai trigger bảo vệ vẫn bật.
