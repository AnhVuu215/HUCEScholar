# Test reader chập chờn khi quay lại bằng lịch sử trình duyệt

Ngày 21/10/2026. Nhánh `codex/test-01-reader-history-flake`, xây trên `main`. Chỉ sửa test, không đổi hành vi ứng dụng.

## Vấn đề

Khi chạy cả bộ `pnpm test:e2e --workers=1` cho SEARCH-02, ca `materials.spec.ts` "reader draft survives cancelled browser back and forward without adding history entries (legacy)" lỗi: sau `page.goBack()`, ô "Nội dung ghi chú" không hiện trong 5 giây. Chạy riêng thì đạt.

Mỗi lần quay về reader, trang được dựng lại và phải tải lại phiên bản, tùy chọn panel và PDF; ô ghi chú chỉ hiện sau khi phiên bản đã tải. Lần mở reader đầu tiên đã được chờ tới 15 giây (đến khi hiện "Đã hiển thị trang 1 / 2"). Hai lần quay lại sau đó chỉ chờ mặc định 5 giây, nên dễ hết giờ khi máy đang chậm.

## Sửa

Sau hai lần quay về reader (bấm link từ kho, `goBack`), test chờ "Đã hiển thị trang 1 / 2" tối đa 15 giây rồi mới kiểm ô ghi chú, giống bước mở reader ban đầu. Không nới các bước kiểm hộp thoại, URL hay độ dài lịch sử.

Lỗi `429` từng thấy ở ca này trong lượt QA-01 là chuyện khác: giới hạn đăng nhập khi chạy lặp cùng tài khoản, xảy ra lúc seed dữ liệu.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` và Redis DB 15:

- `tests/materials.spec.ts`: 21/21 đạt.
