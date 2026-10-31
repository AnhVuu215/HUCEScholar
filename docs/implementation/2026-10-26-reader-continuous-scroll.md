# READ-05 — Cuộn liền các trang và ảnh thu nhỏ

Ngày 26/10/2026. Nhánh `codex/read-05-continuous-scroll`, xây trên `main` sau PR #46 (READ-04).

Trước lượt này, reader chỉ hiện **một trang mỗi lần** và phải bấm "Trang sau" để xem tiếp. Chủ dự án muốn xem được đủ các trang của tài liệu. Đã chốt theo lựa chọn khuyến nghị (đổi được về sau):

- Thêm chế độ **Cuộn liền các trang**, bật/tắt trên thanh công cụ. Mặc định vẫn là từng trang như cũ (từ [READ-06](2026-10-31-reader-scroll-default.md), mặc định là cuộn liền). Lựa chọn được nhớ **trong trình duyệt** (`localStorage`), không phải cài đặt tài khoản.
- **Trang đang đọc** vẫn đủ mọi lớp như chế độ từng trang: lớp chữ để chọn, vùng tô, giấy nhớ (READ-04), tìm chữ. Các trang khác chỉ hiện **ảnh trang**. Cách này giữ nguyên mọi tính năng ghi chú đang có, không phải viết lại chúng cho nhiều trang cùng lúc.
- Thêm bảng **Các trang**: lưới ảnh thu nhỏ của mọi trang để xem toàn bộ tài liệu và nhảy tới một trang.

## Hành vi

**Cuộn liền:**

- Các trang xếp dọc, cách nhau 16px, mỗi trang đúng cỡ theo mức phóng và góc xoay đang chọn. Khung đọc cao gần bằng màn hình (`max(480px, 100vh − 160px)`) và cuộn bên trong.
- Trang nào chạm **vạch đọc** (30% chiều cao khung, tính từ trên xuống) thì thành trang đang đọc. Số trang, trạng thái "Đã hiển thị trang N / M", tiến độ đọc (lưu sau 400ms như cũ), ghi chú và vùng tô của khung bên đều theo trang đó.
- Trang đang đọc được vẽ đè lên ảnh của chính nó, nên lúc chuyển trang không bị nháy trắng.
- **Vùng tô và giấy nhớ hiện trên mọi trang** (bổ sung cùng ngày, nhánh `codex/read-05b-all-page-annotations`). Trang không phải trang đang đọc tự tải vùng tô và 30 ghi chú đầu của nó khi ảnh trang được vẽ, rồi vẽ lên ảnh ở dạng **chỉ xem**: không bấm, không kéo được. Cuộn tới thì trang thành trang đang đọc và sửa được như thường. Dữ liệu tải lại mỗi khi một trang thôi là trang đang đọc, nên sửa xong cuộn đi vẫn thấy bản mới. Ô "Hiện giấy nhớ trên trang" áp dụng cho cả cột.
- "Trang trước/sau", ô số trang, mục lục, ảnh thu nhỏ, tìm chữ, sổ ghi chú và tiến độ đã lưu đều cuộn cột tới đúng trang (đầu trang cách mép khung 16px). Mở một vùng tô hay giấy nhớ từ sổ ghi chú thì cuộn tới đúng chỗ đó trong cột.
- Ảnh các trang chỉ được vẽ khi trang nằm trong khoảng một màn hình phía trên hoặc phía dưới vùng đang xem, và được giải phóng khi ra xa hơn, để tài liệu dài không chiếm nhiều bộ nhớ. Ảnh vẽ ở độ nét tối đa 1,5× (trang đang đọc 2×).
- Cỡ của trang chưa vẽ lấy theo trang 1, rồi chỉnh lại khi trang được vẽ. PDF có trang khác cỡ có thể làm cột xê dịch nhẹ khi cuộn qua.

**Các trang:**

- Nút **Các trang** mở bảng có lưới ảnh, mỗi ô ghi số trang. Trang đang đọc có viền đậm (`aria-current="page"`). Bấm một ô là mở trang đó, ở cả hai chế độ.
- Ảnh rộng 88px, chỉ vẽ khi cuộn tới trong bảng, **vẽ lần lượt từng ảnh** để tài liệu dài không dồn việc. Ảnh theo góc xoay đang chọn.

## Kỹ thuật

- `lib/pdf-viewport.ts`: `readerViewport` (tính khung trang theo mức phóng, góc xoay, `/Rotate`), `canvasRatio`, `paintPage`. Trang đang đọc, ảnh trong cột và ảnh thu nhỏ dùng chung, nên cỡ luôn khớp nhau.
- `reader-continuous.tsx`: các ô trang, `IntersectionObserver` để vẽ/giải phóng ảnh, theo dõi cuộn bằng `requestAnimationFrame`.
- `library-reader.tsx`: chế độ cuộn liền vẽ trang đang đọc vào ô của nó thay vì khung một trang; mọi thứ khác không đổi.
- Không đổi API hay schema.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0):

- Browser `tests/read-05.spec.ts` (tài khoản riêng `scroll`):
  - Các trang: 2 ảnh, trang 1 được đánh dấu, ảnh đã vẽ; bấm "Trang 2" thì mở trang 2 và đánh dấu đổi theo
  - cuộn liền: 2 ô trang, trang 1 mang lớp đọc; cuộn xuống cuối thì sang trang 2 (số trang, trạng thái); trang 1 còn ảnh, lớp đọc chuyển sang trang 2 và giấy nhớ của trang 2 hiện ra
  - "Trang trước" cuộn cột về đầu trang 1 (lệch < 4px so với 16px)
  - trang không đọc hiện giấy nhớ (ẩn/hiện theo ô) và vùng tô dạng chỉ xem; trang đang đọc không vẽ thêm bản thứ hai; vùng tô tạo lúc đang đọc trang 2 hiện trên ảnh trang 2 sau khi chuyển về trang 1
  - 320px không tràn ngang; tải lại vẫn nhớ chế độ; tắt thì về một trang
- Đã xem ảnh chụp cột trang và bảng ảnh thu nhỏ ở 1280px.
- Cuộn tới vùng tô/giấy nhớ khi mở từ sổ ghi chú, và tới kết quả tìm chữ, trong chế độ cuộn liền: mới kiểm qua đọc code, chưa có ca test riêng.
- Bộ đầy đủ: `pnpm format:check` và `pnpm check` (lint, typecheck, 126 unit, build) đạt; `pnpm test:integration` 221 đạt, 1 bỏ qua; `pnpm test:e2e --workers=1` 182 đạt, 8 bỏ qua (6,9 phút). Sau phần vùng tô/giấy nhớ trên mọi trang: `pnpm check` (126 unit, build) đạt, `pnpm test:e2e --workers=1` 182 đạt, 8 bỏ qua (7,2 phút); không chạy lại integration vì không đổi API.
- Chưa kiểm trên điện thoại thật, cảm ứng hay Safari (đang hoãn). Chưa đo với PDF hàng trăm trang thật.

## Chưa làm

- Bấm thẳng vào giấy nhớ hay vùng tô của trang không đọc để sửa (hiện phải cuộn tới trang đó trước).
- Chọn chữ kéo qua hai trang.
- Cột ảnh thu nhỏ cố định bên cạnh trang (hiện là bảng mở/đóng).
- Lưu chế độ đọc vào cài đặt tài khoản để dùng trên máy khác.
