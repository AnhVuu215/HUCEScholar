# CANVAS-02 — Vở ghi: cache canvas theo ô, chạy thử ảnh từ Google, vở toàn màn hình

Ngày 03/11/2026. Nhánh `codex/notebook-perf`, xây trên `main` `fb3ab95` (sau PR #68). Làm tiếp hai việc còn lại của [CANVAS-01](2026-11-03-freeform-notebook.md), cùng một yêu cầu giao diện của chủ dự án.

## 1. PERF-01 cho vở ghi và cache canvas theo ô

### Công cụ đo

`tests/perf-notebook.spec.ts` là spec opt-in, giống `perf-baseline.spec.ts`.

```
pnpm test:setup
PERF=1 pnpm exec playwright test tests/perf-notebook.spec.ts
```

- Spec tạo một trang A4 có `PERF_STROKES` nét (mặc định 2.000, kiểu chữ viết tay theo dòng, trộn bút bi, bút máy, bút dạ, bút chì) và `PERF_IMAGES` ảnh PNG 1200×800 (mặc định 20). Trang nặng 1,28 MB JSON.
- Kết quả quét ảnh được đặt `SAFE` trong DB `_test`, vì lượt đo không chạy ClamAV.
- CPU chậm `PERF_CPU` lần (mặc định 4×). Mỗi phép đo chạy 3 lượt.
- Các phép đo:
  - mở trang tới khi mực và ảnh hiện đủ;
  - mở một trang trống làm mốc (chi phí cố định của route, phiên đăng nhập, bundle);
  - đọc và lưu trang qua API;
  - vẽ một nét 60 điểm, ghi khung hình và long task;
  - tự lưu sau nét (gồm 1 s chờ cố ý);
  - Ctrl + lăn chuột để phóng/thu rồi kéo trang.
- Tùy chọn khác:
  - `PERF_TRACE=1` ghi trace Chromium và CPU profile;
  - `PERF_SHOT=1` chụp ô raster ở mức vừa trang, ở mức phóng to, và chụp bản vector của trang in.
- Kết quả ghi vào `test-results/perf/notebook-<PERF_LABEL>.json`.

### Số đo đầu tiên nói gì

- Trace của bản cũ: luồng chính tốn ~8 s cho JS trên ~10,5 s, còn paint + raster chỉ ~0,7 s.
- Chi phí tăng theo **số phần tử DOM**:
  - React tạo 2.000 `<path>` (và tạo lại hết sau mỗi lần sửa, vì chưa memo theo từng item);
  - layout trên cây SVG lớn;
  - ảnh thu nhỏ của trang đang mở là **bản SVG thứ hai** với 2.000 path nữa, cũng dựng lại sau mỗi nét;
  - dựng chuỗi path bằng `toFixed`.

### Đã làm

- **Memo theo từng item.** Sửa một item chỉ dựng lại item đó.
- **`svgPath` dựng chuỗi không dùng `toFixed`.** Điểm viền nét (perfect-freehand) được cache theo item.
- **Ô raster** (`components/notes/note-raster.tsx`):
  - Bật khi trang có từ 300 nét. Các dãy nét liên tiếp, từ 24 nét trở lên, được vẽ vào ô canvas 512 px và hiện bằng `<image>` trong SVG, nên thứ tự lớp với ảnh, chữ và sticker vẫn giữ nguyên.
  - Nét được chia sẵn vào lưới ô. Khóa của ô gồm tỉ lệ, tọa độ ô và mã băm các nét trong ô, nên kéo trang thì dùng lại ô cũ, còn sửa nét thì chỉ vẽ lại các ô bị ảnh hưởng.
  - Trong lúc ô mới đang vẽ, bộ ô hoàn chỉnh gần nhất vẫn hiện, và các nét chưa có trong đó (tối đa 200) được vẽ tạm bằng SVG.
- **Web Worker** (`note-raster.worker.ts`):
  - Vẽ Path2D và mã hóa PNG ngoài luồng chính. Mỗi nét chỉ gửi điểm viền một lần; tối đa 4 ô cùng chờ trong worker.
  - Trình duyệt không có Worker hoặc OffscreenCanvas thì vẽ trên luồng chính theo từng lát nhỏ.
- **Tỉ lệ raster** = zoom × devicePixelRatio:
  - Chỉ đổi khi zoom đã dừng 180 ms. Trong lúc đang zoom, ô cũ được phóng theo và không vẽ lại.
  - Vùng vẽ là phần đang thấy cộng thêm lề 256 px.
- **Nét đang chọn luôn vẽ vector**, để kéo, đổi cỡ hay đổi màu không phải vẽ lại ô liên tục.
- **Bút dạ ở lớp ô riêng**:
  - Lớp này có `mix-blend-mode: multiply`, đặt dưới lớp mực, và vẽ ở **nửa độ phân giải**.
  - Nếu gộp chung một lớp với mực, bút dạ sẽ phủ lên ảnh thay vì hòa vào như bản vector.
  - Lớp riêng ở đủ độ phân giải tốn thêm ~2 s khi mở trang (đo A/B); ở nửa độ phân giải chỉ còn ~0,7 s.
- **Bút chì** trong ô dùng pattern hạt, giả lập bộ lọc `feTurbulence` của bản vector.
- **Ảnh thu nhỏ**:
  - Trang nhiều nét được vẽ thành một ô bitmap nhỏ (tỉ lệ 0,2 × DPR).
  - Ảnh thu nhỏ của trang đang mở chỉ cập nhật sau 1,5 s ngừng sửa.
- **In, PDF và PNG vẫn vẽ vector**, mỗi nét là một path.

### Số đo

Máy dev Windows 11, 11,7 GB RAM, `next dev` (React bản dev, chậm hơn bản build nhiều), Chromium của Playwright, CPU chậm 4×. Trang có 2.000 nét và 20 ảnh. Các phép so sánh đều chạy liền nhau trong cùng phiên. Các lượt có bật trace bị chậm thêm nên không dùng để so.

| | Trước (bản `main`) | Sau |
| --- | --- | --- |
| Mở trang (trung vị) | 9,1 s, trang trống 1,9 s | 2,9 s, trang trống 1,5 s |
| Vẽ nét mới: khung hình p95 | 83–100 ms | 17–33 ms |
| Vẽ nét mới: long task dài nhất | 1,85 s | 0,1–0,25 s |
| Tự lưu sau nét (gồm 1 s chờ) | 3,0 s | 2,0 s |
| Zoom + kéo trang: khung hình p95 | 117–150 ms | 50–100 ms |
| API lưu trang 1,28 MB | 0,83 s | 0,5–0,7 s (phía server không đổi; con số chỉ dao động) |

- Số "Sau" ở bảng lấy trước khi tách lớp bút dạ.
- A/B liền nhau trên code cuối, tính phần mở trang tốn thêm so với trang trống:
  - một lớp chung: +2,4 s;
  - bút dạ ở lớp riêng, đủ độ phân giải: +4,5 s;
  - bút dạ ở lớp riêng, nửa độ phân giải (bản cuối): +3,1 s.
- Ở các lượt cuối, máy chậm hơn lúc đầu (trang trống mở mất 2,0–2,7 s), nên số tuyệt đối dao động trong khoảng 5–6,5 s. Thứ tự giữa các phương án thì giữ ổn định.
- Thiết kế đặt mục tiêu sau số đo đầu tiên. Đề xuất mục tiêu, **chưa chốt**:
  - vẽ nét p95 ≤ 33 ms (đã đạt);
  - phần mở trang tốn thêm so với trang trống ≤ 3 s ở CPU 4×, đo trên bản build thì sẽ thấp hơn.
- Chưa đo trên bản build production hay trên máy yếu thật.

### Chất lượng hình

So ảnh chụp ô raster với bản vector của trang in:
- ở mức vừa trang và khi phóng to: mực sắc, không thấy đường nối giữa các ô;
- bút dạ hòa trên ảnh như bản vector;
- bút chì vẫn có hạt.

Khác biệt còn lại:
- Bút dạ nằm dưới **mọi** nét mực trong cùng dãy, kể cả nét mực vẽ trước nó. Ở bản vector, bút dạ đè lên các nét vẽ trước. Đây cũng là ý "bút dạ vẽ dưới chữ" của thiết kế.
- Trong lúc zoom, ô hơi mờ khoảng 0,2 s rồi mới được vẽ lại sắc nét.

## 2. Chạy thử kéo ảnh thật từ Google

Chạy local với app dev (`pnpm dev`), ClamAV, file-worker và docx-converter (`pnpm infra:files`). Dùng Chrome thật của chủ dự án và một tài khoản sinh viên thử chỉ có trong DB dev.

- **DOM của Google Images** (tìm "sơ đồ dầm đơn giản", 03/11/2026):
  - Phần lớn ô kết quả là `<img>` thu nhỏ từ `encrypted-tbn0.gstatic.com` (khoảng 600 px), không có link bao quanh.
  - Một số ô nằm trong link `google.com/imgres?imgurl=…`.
  - Ảnh nhỏ ở hàng chip gợi ý là `data:image/jpeg|png`.
  - `droppedImageSource` đã xử lý đủ ba dạng này.
- **Chủ dự án kéo thật** một ảnh kết quả từ cửa sổ Google sang cửa sổ vở:
  - Chrome gửi kèm **file ảnh** (bản thu nhỏ 612×500), nên ảnh đi đường tải lên trực tiếp (`source=UPLOAD`).
  - API mã hóa lại thành WebP 38 KB, ClamAV báo `SAFE`, và ảnh hiện trên trang.
  - Trang lưu đủ (nét + ảnh), revision tăng bình thường.
- **Chưa kiểm chứng:**
  - Đường API tải hộ từ URL (`from-url`) với ảnh thật: lần kéo này không đi qua đường đó.
  - Kéo từ khung xem trước ảnh lớn của Google, và kéo trên **Edge**.
  - Cử chỉ kéo giả lập bằng công cụ tự động không sinh sự kiện kéo thả HTML5 của Chrome, nên cần người kéo thật.
- Sau khi chạy thử đã tắt app dev và các container ClamAV/worker.

## 3. Vở ghi dùng toàn bộ cửa sổ, menu ☰

Theo yêu cầu của chủ dự án: khung vở quá nhỏ và sidebar chiếm chỗ.

- Khi **mở một vở**:
  - sidebar thu thành một thanh mảnh trên cùng gồm nút **☰ Menu** và logo;
  - bấm ☰ thì danh sách điều hướng xổ xuống, đè lên trang (không đẩy trang xuống);
  - Esc, bấm chọn một mục, hoặc bấm ra ngoài thì menu đóng;
  - tiêu đề lớn "Vở ghi" và footer được ẩn;
  - khung vở rộng hết cửa sổ và cao hết phần còn lại, nên trang không còn thanh cuộn.
- Kệ vở và các trang khác giữ sidebar như cũ. Nút "Toàn màn hình" sẵn có của vở vẫn che cả thanh trên.
- Bấm ra ngoài để đóng menu áp dụng cho mọi trang có nút ☰ (trên màn hình hẹp, menu vẫn đẩy nội dung xuống như cũ).
- **Sửa lỗi có từ CANVAS-01:**
  - Gốc trình soạn vở dùng class `.note-editor`, trùng với form ghi chú trong reader, form sửa mục Sổ tay và form báo lỗi tài liệu.
  - CSS của vở (cao ≥ 560 px, flex, viền) vì thế đè lên các form đó, còn `max-width: 72ch` của form lại giới hạn khung vở.
  - Gốc trình soạn vở nay là `.notebook-editor`.

## Kiểm chứng

Local (Windows, Node 24.19.0, pnpm 11.25.0):

- `tests/canvas-01.spec.ts`: 3/3 đạt. Ca mới cho trang 400 nét kiểm:
  - hai lớp ô (bút dạ, mực) vẽ xong và không còn `path` riêng cho từng nét;
  - ảnh thu nhỏ là bitmap;
  - quét chọn 20 nét thì 20 nét đó chuyển sang vector;
  - xóa rồi hoàn tác thì số item đúng (380 rồi 400) và ô được vẽ lại;
  - trang in có ≥ 400 path và không có ảnh raster;
  - trên trang vở, sidebar ẩn; ☰ mở được và đóng được bằng Esc (focus về nút) và bằng bấm ra ngoài; khung vở rộng gần hết cửa sổ; trang không cuộn.
- `pnpm format:check`, `pnpm check` (lint, typecheck, 196 unit, build production) đạt.
- Cả bộ e2e (một worker, ba lượt theo file): 73 + 70 + 59 đạt.
  - Một ca của `reader-direct-annotations.spec.ts` hỏng vì quá 5 s khi chờ reader hiện trang 1. Chạy lại riêng file đó thì 5/5 đạt, kể cả ca dùng form `.note-editor` của reader.
  - Tổng **203 đạt**, 9 ca opt-in bỏ qua (thêm `perf-notebook.spec.ts`).
- Không đổi API hay schema, nên không chạy lại integration.
- Chưa thử trên thiết bị cảm ứng, iPad hay Safari (đang hoãn).
