# LEARN-03b — Sửa và xóa ghi chú ngay trên Sổ tay

Ngày 28/10/2026. Nhánh `codex/learn-03b-notebook-edit`, xây trên `main` sau PR #53 (EXPORT-02).

[Mốc LEARN-03](2026-10-26-library-notebook.md) ghi "chưa sửa/xóa ngay trên sổ tay": muốn sửa một ghi chú phải mở reader đúng trang. Lượt này cho sửa và xóa từng mục ngay trong kết quả tìm.

Đã chốt theo lựa chọn khuyến nghị:

- **Chỉ web, không đổi API hay schema.** Dùng lại các endpoint sửa/xóa ghi chú trang và vùng tô mà reader đang dùng, nên quyền, CSRF và kiểm tra `revision` giữ nguyên ở API: chỉ chủ ghi chú, chỉ tài liệu còn đọc được.
- **Sửa ở đây gồm chữ của ghi chú và, với vùng tô, chữ kèm theo và màu.** Dời chỗ ghim hay chọn lại vùng tô cần nhìn trang, nên vẫn làm trong reader (nút "Mở trang N" vẫn có). Sửa chữ không làm mất ghim hay vùng tô.
- **Sửa đúng bản mà lượt tìm trả về.** Nếu mục đã đổi ở nơi khác (reader, tab khác), API trả `409`: bản soạn được giữ, câu báo nói tìm lại để lấy bản mới. Không ghi đè im lặng.
- **Mục đã sửa nằm lại đến lần tìm sau**, kể cả khi không còn khớp bộ lọc, để danh sách và tiêu điểm không nhảy (giống dấu "cần xem lại").

## Hành vi

- Mỗi mục trên tài liệu còn mở được có thêm nút **Sửa** và **Xóa**.
- **Sửa** mở form ngay dưới mục:
  - ghi chú trang: ô "Nội dung ghi chú" (bắt buộc, tối đa 4.000 ký tự)
  - vùng tô: ô "Ghi chú kèm đoạn tô (không bắt buộc)" và chọn "Màu tô"
  - "Lưu thay đổi" bị khóa khi chưa đổi gì; "Hủy" đóng form
  - lưu xong thì mục cập nhật tại chỗ, có câu "Đã lưu ghi chú · Trang N." (hoặc "vùng tô"), tiêu điểm về nút Sửa.
- **Xóa** hỏi lại như reader ("Xóa ghi chú này?" / "Xóa vùng tô và ghi chú kèm theo?"), tiêu điểm vào "Giữ lại". Giữ lại thì tiêu điểm về nút Xóa. Xác nhận thì mục biến mất, câu "Đã xóa … · Trang N · tiêu đề." nhận tiêu điểm.
- Lỗi thành câu trong mục: `409` như trên; phiên hết hạn, mất quyền, lỗi mạng dùng cùng câu với reader.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test`:

- Browser, ca mới trong `tests/learn-03.spec.ts` (tài khoản e2e riêng `learn03b` để không chạm giới hạn đăng nhập):
  - sửa ghi chú trang: form nhận tiêu điểm, nút lưu khóa khi chưa đổi, lưu xong ghim vẫn ở `(0.4, 0.6)` (kiểm qua API), tiêu điểm về Sửa
  - sửa vùng tô: đổi màu sang xanh dương và xóa chữ kèm theo, trích đoạn giữ nguyên
  - xung đột: sửa qua API trước rồi lưu trên Sổ tay ra `409`, bản soạn còn nguyên
  - xóa: Giữ lại trả tiêu điểm; xác nhận thì mục mất, câu báo nhận tiêu điểm, tìm lại không còn mục đó
  - 320/1440px không tràn ngang khi form mở.
- Bộ đầy đủ: `pnpm format:check` và `pnpm check` (lint, typecheck, 127 unit, build) đạt; `pnpm test:integration` 223 đạt, 1 bỏ qua; `pnpm test:e2e --workers=1` 186 đạt, 8 bỏ qua.
- Chưa thử trên điện thoại thật hay trình đọc màn hình.

## Chưa làm

- Dời ghim, chọn lại vùng tô từ Sổ tay; sửa nhiều mục một lúc.
- Tìm không dấu trong Sổ tay.
