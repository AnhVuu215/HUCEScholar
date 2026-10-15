# PWA — 15/10/2026

Task tiếp theo từ roadmap, base `e1fada0`, branch `codex/pwa-foundation`. Giữ toàn bộ API, database, auth, học liệu và ghi chú hiện hữu; không thêm dependency hoặc deploy dịch vụ ngoài.

## Chức năng

- Manifest standalone cùng tên/id; iconPNG192/512/maskable512/Apple180 sinh từ hình học monogram H riêng. Không dùng logo trường. Script build/dev sinh worker từ TypeScript; assets icon có thể tái tạo.
- `/install` có hướng dẫn Chrome/Edge/Android và Safari/iPhone/iPad, liên kết từ landing/login/workspace. Nút cài chỉ khi browser phát beforeinstallprompt, phải do người dùng bấm. Phân biệt accepted, dismissed, failed, appinstalled và standalone; focus trả về thông báo kết quả sau thao tác.
- Worker chỉ precache `/offline.html`, `/icon.svg` và bốn PNG icon. Fetch lúc install không mang credentials và không theo redirect; fetch lỗi làm install thất bại. Không runtime cache. Chỉ navigation GET thuộc app, không query/auth-header/range, dùng offline fallback khi fetch reject. ResponseHTTP lỗi giữ nguyên. API/PDF/RSC/notes và URLtoken không được thay bằng offline HTML.
- Worker dùng cache namespace riêng; activate chỉ dọn version cũ cùng namespace, giữ cache khác. Không skipWaiting hoặc reload. Dev mặc định tắt registration; browser suite opt-in. Production cần secure context; public deployment cần HTTPS.
- Offline fallback tự chứa CSS và không dùng Next, không in URL/metadata riêng. Kết nối lại mở trang chủ qua mạng. Không queue/replay mutation, đọc PDF hoặc ghi chú offline.

## Bằng chứng

- RED hai ca đầu: manifest chỉ có SVG; `/install`404. GREEN hai ca sau triển khai: manifest PNG, worker thật đăng ký, cache đúng allowlist, API401/no-store, offline navigation và reconnect; `.local/pwa-red.log` và `pwa-green.log`.
- Test race appinstalled trước userChoice tái hiện thông báo accepted ghi đè installed. Fix dùng trạng thái terminal riêng cho installed/standalone và functional update không ghi đè; `.local/pwa-install-red.log`.
- Independent review không tìm thấy regression cache/API; phát hiện prompt bị mất khi SPA chuyển từ landing sang hướng dẫn hoặc rời hướng dẫn. Ca browser RED tái hiện đúng thiếu nút cài, sau đó chuyển event/status vào InstallProvider gốc, giữ sự kiện qua điều hướng và chống gọi prompt hai lần. Không có finding khác cần sửa; native installer/HTTPS/device nằm ngoài static review.
- `pnpm check` đạt lint/typecheck,50unit và API/web build; sau sửa provider, lint/web typecheck, format/tools typecheck và web build lại đều đạt. Không đổi API/schema nên không lặp integration134ca từ mốc trước. Browser cuối dùng API đã build với đúng test env/DB/Redis/ports qua config local, giữ Next dev và kiểm tra toàn bộ suite; không chạy codegen/build cùng lúc.
- Hai lượt khởi động test API hết hạn60s trước khi có ca test; DEBUG chỉ ra Prisma đã generate, Nest compile45s không lỗi rồi bị runner dừng trước khi lắng nghe. Tăng startup budget harness lên120s, không tăng timeout request sản phẩm. Docker Desktop được start khi đang tắt; dịch vụ hiện hữu trở lại healthy, không reset/xóa volume.
- Full browser hai worker:65/68 đạt, gồm đủ15ca PWA. Ba ca cũ timeout ở đăng nhập/khởi tạo workspace/render PDF; snapshot vẫn đang tải, không có lỗi chức năng cụ thể. Chạy lại đúng ba ca với một worker đạt3/3, không đổi product hoặc assertion timeout. Log `.local/pwa-browser-full.log` và `pwa-browser-recheck.log`; không gộp thành một lượt full-suite xanh hoặc kết luận nguyên nhân tải chậm đã được sửa.
- Bản Next build trên3000 cùng API local3001: chạy riêng15ca PWA đạt15/15 trong28.4s, không global setup/seed DB local. Bao phủ PNG bytes/decode, sw.js headers, precache503, HTTP401/404/500, cache namespace cleanup, waiting update, prompt accepted/dismissed/failed/installed/standalone, SPA giữ offer và reflow/links. Đây là kiểm tra build local, không phải production deployment. Log `.local/pwa-browser-production.log`.
- Captures1440/768/360 và offline360/1440 không tràn document; đã xem trực tiếp desktop/mobile/offline/icon. Detector một lượt20advisory thuộc type/color ramp của DESIGN.md dành riêng prototype; giữ hệ thống ứng dụng hiện hữu và heading offline fluid, không đổi wireframe để làm detector xanh.
- Đọc raw error-context của một ca login đã in nhầm credential fixture. Đã chạy lại test setup, đổi password/CSRF secret chỉ cho `hucescholar_test` và cấu hình test trong `.local/test.env`; không đổi tài khoản demo hoặc DBlocal. Reader log helper sau đó che password. Không đưa credential/error-context vào Git.
- Preview được mở lại sau khi tiến trình nền dừng khi phiên được tiếp tục; chỉ tạo process khi cổng trống. Trang `/install` đã hiện trong tab IAB và được giữ làm deliverable; screenshot `.local/pwa-demo-install.png`. Không sửa cấu hình hệ thống để tự khởi động app.

## Giới hạn và bước sau

Loopback được browser coi là secure context, không phải bằng chứng HTTPS trên domain. Chưa thử Android/iPhone/iPad/Safari thật, native installation UI hoặc touch PDF. S3 private, HTTPS/proxy, cookie/IP, backup/phục hồi và reset mật khẩu vẫn là các mốc khác. PWA này không cung cấp tài liệu offline.

Nguồn kỹ thuật: [Next PWA](https://nextjs.org/docs/app/guides/progressive-web-apps), [MDN worker lifecycle](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers), [Apple hướng dẫn cài website](https://support.apple.com/en-ie/guide/iphone/iphea86e5236/ios). Các log/capture local không chứa credential và bị Git bỏ qua.
