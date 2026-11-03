# CANVAS-03 — Vở ghi: bảng, thước kẻ, nét vẽ mượt hơn

Ngày 04/11/2026. Nhánh `codex/notebook-tables-ruler`, xây trên `main` `0e388d1` (sau PR #71). Chủ dự án muốn Vở ghi "xịn" hơn: thêm bảng, thước kẻ, và vẽ mượt hơn nữa. Theo cách làm của dự án, mình chọn phạm vi dưới đây và ghi lại.

## Bảng

- **Chèn:** "Chèn → Bảng…" mở lưới chọn số hàng × cột (rê chuột như Word, hoặc nhập số; tối đa 60 × 12). Bảng mới đặt giữa vùng đang xem và mở ngay để gõ.
- **Sửa:**
  - Nhấp đúp vào bảng bằng công cụ Chọn, hoặc bấm vào bảng bằng công cụ Chữ.
  - Mỗi ô là một `textarea` tự giãn theo chữ (`field-sizing: content`), nên gõ Telex/VNI vẫn đúng.
  - Tab và Shift+Tab chuyển ô; Tab ở ô cuối thêm hàng; Esc hoặc "Xong" để kết thúc.
- **Thanh định dạng:**
  - thêm hàng, thêm cột, xóa hàng, xóa cột (theo ô đang chọn);
  - bật/tắt hàng tiêu đề (chữ đậm, nền nhạt theo màu viền);
  - font, cỡ chữ, màu chữ, sáu màu viền.
- **Đổi kích thước:** kéo vạch giữa hai cột để chia lại độ rộng hai cột đó; kéo mép phải để đổi độ rộng cả bảng. Chọn rồi kéo góc thì bảng co giãn như hộp chữ.
- **Lưu:**
  - Item mới `table` gồm vị trí, độ rộng, độ rộng cột (phân số, tổng bằng 1), chữ của từng ô, hàng tiêu đề, font, cỡ, màu chữ và màu viền.
  - API dựng lại bảng từ danh sách trắng như các item khác:
    - tối đa 60 hàng, 12 cột, 20.000 ký tự cho cả bảng;
    - ô chỉ chứa chữ thuần, bỏ ký tự điều khiển;
    - độ rộng cột được chuẩn hóa lại cho đủ 1.
  - Chữ trong ô vào chỉ mục tìm kiếm của vở. Không cần migration, vì ràng buộc trong DB chỉ kiểm cấu trúc chung của trang.
- **In và PDF** giữ bảng (bảng HTML trong `foreignObject`, giống hộp chữ).

## Thước kẻ

- Nút **Thước** trên thanh trên cùng, hoặc phím **R**, để hiện/ẩn thước. Thước là công cụ, không phải nội dung trang: không được lưu.
- Thước dài 160 mm, vạch mỗi mm, vạch dài ở 5 mm, số ở mỗi cm (theo tỉ lệ trang: 96 px mỗi inch). Giữa thước hiện góc nghiêng.
- **Di chuyển:** kéo thân thước (với bất kỳ công cụ nào).
- **Xoay:** kéo núm tròn ở đầu thước. Thước tự hít vào 0°, 45°, 90°… khi lệch dưới 2,5°; giữ Shift thì xoay theo bước 15°.
- **Kẻ theo mép:** bút hoặc bút dạ đặt cách một mép dài không quá 16 đơn vị trang thì mọi điểm của nét được chiếu lên mép đó, lệch ra ngoài nửa độ dày nét để mực nằm sát mép. Nét kẻ theo thước không bị nắn thành hình.

## Mượt hơn

Đo trước khi sửa. Spec `tests/perf-notebook.spec.ts` có thêm phép đo một nét dài (400 lần di chuyển) trên trang trống và trên trang 2.000 nét.

- **Nét đang vẽ không còn đi qua React.** Đường nét được ghi thẳng vào một `<path>` qua ref, mỗi khung hình một lần. Trước đây mỗi lần di chuyển chuột đều render lại cả canvas.
- **Nét không bị chớp khi nhả bút.** Nét đang vẽ chỉ được xóa sau khi nét đã lưu được vẽ ra.
- **Điểm dự đoán.** Thêm tối đa hai điểm dự đoán của Chrome (`getPredictedEvents`) vào phần hiển thị, để nét bám sát đầu bút; các điểm này không được lưu. Điểm thật vẫn lấy đủ qua `getCoalescedEvents` như trước.

Số đo: CPU chậm 4×, `next dev`, cùng máy, chạy liền nhau.

| | Trước | Sau |
| --- | --- | --- |
| Nét dài, trang trống: khung p95 / nghẽn lớn nhất | 33 ms / 117–133 ms | 17 ms / 67 ms |
| Nét dài, trang 2.000 nét: khung p95 / tác vụ dài nhất | 33 ms / 336 ms | 17 ms / 93 ms |
| Nét ngắn, trang 2.000 nét: khung p95 | 33 ms | 17 ms |

Ở lượt đo cuối, mở trang 2.000 nét + 20 ảnh mất 3,3 s (trang trống 1,7 s). Mở trang không bị ảnh hưởng bởi thay đổi này.

## Sửa thêm

- Menu "Chèn" và "Xuất" của vở (thẻ `<details>`) nay tự đóng khi chọn một mục. Trước đây menu vẫn mở và che thanh công cụ của thứ vừa chèn.
- Bảng phím tắt (`?`) thêm R, cách xoay thước và cách sửa bảng.
- `workspace-ui.spec.ts` chờ danh sách học liệu tải xong rồi mới đo vị trí ô tìm kiếm và nút "Tìm kiếm". Trước đây hai phép đo có thể rơi vào lúc trang còn dịch layout (lệch 189 px).

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0, Chrome do Playwright điều khiển):

- **Unit (API):** 11 ca mới cho bảng trong `notebook-content.spec.ts`: dựng lại, chuẩn hóa cột, chỉ mục tìm kiếm, và 9 kiểu dữ liệu sai.
- **`pnpm check`** (lint, typecheck, 207 unit, build production) đạt. `pnpm test:integration`: 246 đạt, 1 bỏ qua.
- **`tests/canvas-03.spec.ts`**, 2 ca đều đạt:
  1. Chèn bảng 3 × 4 từ lưới, gõ tiếng Việt qua Tab, Tab ở ô cuối thêm hàng, xóa cột, lưu. Tìm được vở theo chữ trong ô. Tải lại vẫn đủ 4 hàng. Nhấp đúp và kéo vạch cột thì cột 1 rộng hơn cột 2, tổng vẫn bằng 1. Trang in có bảng.
  2. Bật thước, kẻ một nét lượn sát mép thì nét lưu ra thẳng (chênh lệch y < 0,6). Kéo núm thì thước hít vào 45°. Kẻ sát mép mới thì nét nghiêng 45°. Kéo thân thước thì thước dời đúng (50, 20). Phím R ẩn thước. Di chuyển hay xoay thước không tạo nét nào.
- **Cả bộ e2e** (một worker, ba lượt theo file): 68 + 73 + 64 đạt, 9 ca opt-in bỏ qua. `workspace-ui` hỏng 2 lần liên tiếp vì lỗi đo kể trên, sửa xong thì 8/8.
- **Ảnh chụp:** bảng khi sửa và khi đã lưu, thước ở góc 45° với nét kẻ theo mép (`CAPTURE_CANVAS3=1`).
- Chưa thử trên bút cảm ứng, iPad hay Safari (đang hoãn).
