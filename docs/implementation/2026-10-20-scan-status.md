# UPLOAD-01 — Theo dõi trạng thái kiểm tra file dễ hiểu

Ngày 20/10/2026. Nhánh `codex/upload-01-scan-status`, xây trên `main` sau PR #11. Phạm vi là UPLOAD-01 trong đợt B của [roadmap](../roadmap/2026-10-17-web-improvement-roadmap.md). Không đổi API, schema, worker hoặc quyền.

## Trước thay đổi

- Giảng viên (`MaterialFileStatus`) đã poll có backoff 2→15 giây trong ba phút, nhưng tab ẩn vẫn đặt hẹn giờ và tiêu hết ba phút; lỗi mạng bị nuốt im lặng nên không phân biệt được với kết quả file; hết giờ chỉ ghi “Đã dừng chờ tự động”.
- Sinh viên (`DraftPdf`) không tự cập nhật; phải bấm **Cập nhật trạng thái**.

## Thay đổi

- Hook dùng chung `apps/web/components/materials/scan-watch.tsx` cho cả hai vai trò. Cập nhật tự động đi qua `updateFileState` nên không ghi đè metadata đang soạn (giữ hành vi đối chiếu hiện có).
- Chỉ poll khi tab hiện. Tab ẩn hủy hẹn giờ, không gửi request và không tính vào ngân sách ba phút; hiện lại thì kiểm tra ngay rồi backoff lại từ 2 giây. Không gửi hai request chồng nhau.
- Lỗi kết nối/5xx: báo “đang thử lại”; ba lần liên tiếp thì dừng và báo **mất kết nối, không phải lỗi của file**. 401/403/404 dừng ngay và hiện lý do. Hết ba phút: báo file **vẫn đang được xử lý**.
- Thông báo chờ luôn nói file đã lưu riêng tư, **không cần tải lên lại**, kèm giờ kiểm tra gần nhất. Cập nhật thủ công thành công bật lại chờ tự động.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0), database `_test` và Redis DB 15:

- `pnpm format:check`, `pnpm check` (lint, typecheck, 89 unit, build): đạt.
- `pnpm test:integration`: 183 passed, 1 skipped.
- `pnpm test:e2e --workers=1`: 157 passed, 1 skipped, gồm các ca upload/DOCX/polling có sẵn của giảng viên (dùng hook mới, không ghi đè trường đang soạn).
- Mới: `tests/upload-01.spec.ts` (3 ca, sinh viên với PDF đứng ở CHECKING vì suite không chạy worker): request trạng thái bị chặn → “đang thử lại” rồi “Mất kết nối…”, không có thông báo lỗi file; mở lại mạng + cập nhật thủ công thấy kết quả an toàn; tab ẩn sáu giây không gửi request, hiện lại thì kiểm tra ngay; đồng hồ giả của Playwright tiến từng lượt poll tới hết ngân sách → “Sau ba phút file vẫn đang được xử lý”. Trên `main`, sinh viên không có thông báo chờ tự động nên các ca này không thể đạt.

## Còn lại

SEARCH-01 trong đợt B. Luồng quét thật cần bật ClamAV/file-worker (đang dừng trên máy dev để tiết kiệm RAM).
