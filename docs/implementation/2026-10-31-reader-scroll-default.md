# READ-06 — Mặc định cuộn liền các trang

Ngày 31/10/2026. Nhánh `codex/reader-scroll-default`, xây trên `main` `411ee60` (sau PR #66).

Khi dùng thử, chủ dự án mở một tài liệu bằng tài khoản sinh viên và không cuộn xuống được trang tiếp theo. Trình đọc mặc định hiện từng trang, còn chế độ cuộn liền ([READ-05](2026-10-26-reader-continuous-scroll.md)) chỉ bật khi bấm nút trên thanh công cụ. Chủ dự án chọn đổi mặc định sang cuộn liền.

## Thay đổi

- **Mặc định là cuộn liền các trang.** Lựa chọn vẫn nhớ theo trình duyệt (`localStorage`). Người đã chọn "từng trang" giữ nguyên lựa chọn; người chưa chọn lần nào (hoặc trình duyệt không cho lưu) thấy cuộn liền.
- Khi bật làm mặc định, chạy lại các spec reader thì lộ ra **hai lỗi của chế độ cuộn liền**. Hai lỗi này có từ READ-05 nhưng ít ai gặp vì trước đây phải tự bật:
  1. **Đổi cỡ cửa sổ, mức phóng hoặc góc xoay làm đổi trang đang đọc.** Các trang đổi cỡ, trình duyệt kéo vị trí cuộn theo, và trình đọc hiểu đó là người dùng tự cuộn. Nay trong lúc bố cục đổi, các lần cuộn đó bị bỏ qua; khi cỡ mới đã có, trang đang đọc được đưa về đầu khung như cũ.
  2. **Tài liệu ngắn trên màn hình hẹp: "Trang sau" không giữ được trang cuối.** Trang cuối không chạm được vạch đọc (30% chiều cao khung), nên lần cuộn kế tiếp kéo về trang trước. Nay khi đã cuộn tới đáy cột, trang cuối được coi là trang đang đọc, như các trình đọc PDF thường làm.
- Không đổi API hay schema.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0):

- `tests/read-05.spec.ts`:
  - Kiểm mặc định là cuộn liền.
  - Tắt cuộn liền để kiểm ảnh thu nhỏ theo từng trang, rồi bật lại.
  - Đổi cỡ cửa sổ 900 → 1280px mà vẫn ở trang 2.
  - Chọn "từng trang" thì tải lại trang vẫn giữ.
- `tests/citations.spec.ts`:
  - Ca "giữ trích dẫn khi sang trang" qua được ở 1440, 390 và 320px. Trước khi sửa lỗi 2 ở trên, ca này hỏng ở 390px.
  - Ca "đóng trích dẫn trả focus" nay tìm khung trang theo phần tử, vì nhãn của khung đổi theo chế độ đọc. Focus vẫn về đúng khung.
- Cả bộ e2e (một worker, chia ba lượt theo file): 70 + 74 + 56 = **200 đạt, 0 hỏng**. 8 ca opt-in chạy riêng và đều đạt:
  - `PERF=1`: 2/2;
  - `DOCX_REAL=1`: 1/1;
  - `PILOT_REAL=1`: 5/5, với ClamAV, bộ chuyển đổi và file-worker thật nối vào DB `_test`; sau đó đã tắt các container này.
- `pnpm format:check`, `pnpm check` (lint, typecheck, unit, build) đạt. Không đổi API nên không chạy lại integration.
- Chưa thử trên điện thoại thật hay Safari (đang hoãn).
