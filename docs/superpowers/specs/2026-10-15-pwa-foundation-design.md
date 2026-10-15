# PWA công khai, không lưu dữ liệu học tập offline

Triển khai mốc tiếp theo trong roadmap đã chốt ở PRODUCT và tech-stack mục7. Giữ giao diện hiện hành, không thêm dependency, migration, push notification hoặc PDF offline.

- Manifest giữ id/start_url/scope `/`, standalone; thêm PNG192/512, maskable512 và Apple180 từ monogram H riêng hiện có, không dùng huy hiệu trường.
- `/install` là hướng dẫn công khai, có liên kết từ landing/login/workspace. Chỉ hiện nút cài khi trình duyệt phát `beforeinstallprompt`; thao tác phải do người dùng bấm. iOS và trình duyệt khác có hướng dẫn menu, không hứa khả năng cài trên mọi thiết bị. Standalone hiện trạng thái đã mở dưới dạng ứng dụng.
- Worker đăng ký ở production/secure context; dev opt-in `NEXT_PUBLIC_ENABLE_PWA=1`. Mặc định không can thiệp môi trường dev. Không tự reload/skipWaiting để bảo vệ bản soạn đang mở; worker mới chờ các tab cũ đóng.
- CacheStorage chỉ có allowlist tài nguyên static công khai: offline HTML tự chứa và icon. Install fetch dùng credentials omit, không redirect; lỗi cài không được chấp nhận thiếu fallback. Không lưu landing/login/workspace HTML, Next/RSC, API, PDF, ghi chú, URL có query/token hay nguồn ngoài.
- Mọi request nghiệp vụ đi mạng như hiện hữu. Chỉ navigation HTML trong app khi mất mạng nhận offline fallback chung, không ghi URL/metadata cá nhân. API/PDF và request có query không nhận fallback HTML. HTTP4xx/5xx giữ nguyên, không giả thành offline.
- `/offline.html` tự chứa CSS, có giải thích cần mạng để đọc/lưu, link thử mở lại trang chủ; không có thông tin tài khoản hoặc script Next. Khi kết nối lại dùng mạng, không replay mutation.
- Bằng chứng: browser thật trên loopback secure-context kiểm tra manifest, registration/cache allowlist, API401/no-store, offline navigation và reconnect; hướng dẫn/prompt/failure/standalone bằng browser events mô phỏng. HTTPS công khai và cài Android/iOS thật vẫn cần môi trường pilot.

Nguồn: hướng dẫn PWA đi kèm Next16.4.0 và https://nextjs.org/docs/app/guides/progressive-web-apps; vòng đời worker https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API/Using_Service_Workers.
