# Tiến độ HUCEScholar — 14/10/2026

Cập nhật17/10: ưu tiên web theo yêu cầu người dùng, tạm hoãn cài PWA. Đã bổ sung bảo vệ bản soạn ghi chú khi Back/Forward trong lịch sử ứng dụng; tiến độ và việc tiếp theo ở [checkpoint web mới](2026-10-17-web-reader-history.md). Thứ tự đề xuất bên dưới là lịch sử của mốc14/10.

Cập nhật15/10: đã triển khai nền tảng PWA công khai, icon và hướng dẫn cài; trạng thái/kiểm chứng mới ở [mốc PWA](2026-10-15-pwa-foundation.md). Bước kế tiếp là môi trường pilot/HTTPS/S3/backup và thiết bị thật, không phải thêm cache PDF offline.

Cập nhật tiếp cùng ngày: A02 đã đổi sang **giảng viên tự công bố PDF, không cần admin duyệt hoặc nguồn/căn cứ quyền bắt buộc**. Bản tiến độ dưới đây là checkpoint thư viện cá nhân trước thay đổi này. Xem [mốc tự công bố](2026-10-14-lecturer-self-publication.md) cho hành vi và bằng chứng mới.

Đối chiếu repository trên nhánh `codex/personal-library`. Đây là trạng thái ứng dụng local; không phải xác nhận triển khai production hoặc sử dụng dữ liệu HUCE thật.

## Đã triển khai

| Phạm vi | Khả năng hiện có |
| --- | --- |
| Nền tảng | Next.js App Router + NestJS, PostgreSQL/Prisma, 23 bảng và sáu migration SQL |
| Tài khoản | Cookie phiên, ba vai trò, admin cấp/sửa/khóa/mở khóa tài khoản; kiểm tra quyền tại API |
| Đào tạo | Danh mục khoa/ngành/môn, môn dùng chung, phân công và thu hồi có lịch sử |
| Biên soạn | Bản nháp riêng, upload PDF private, worker ClamAV/Poppler; trạng thái file độc lập kiểm duyệt |
| Công bố | Gửi/rút yêu cầu, lịch sử, yêu cầu sửa/từ chối/duyệt và đặt bản hiện hành |
| Khai thác | Tìm/lọc kho học liệu, PDF.js, chuyển trang/zoom/xoay/chọn chữ, tải PDF theo quyền |
| Học tập cá nhân | Ghi chú riêng theo phiên bản/trang, revision và retry; tiến độ sau render thành công |
| Vòng đời | Phiên bản kế tiếp, bàn giao, ẩn/khôi phục; giữ ghi chú gắn PDF cũ |
| Thư viện cá nhân | Lưu/bỏ lưu, danh sách riêng, đọc gần đây mở đúng phiên bản/trang; không lộ metadata khi mất quyền |

API thư viện cá nhân đã có ở commit `0a91eaf`; giao diện, điều hướng và tài liệu được hoàn tất trên cùng nhánh. Không thêm dependency, migration, nội dung ngoài hoặc thay đổi prototype `design/wireframe/`.

## Công việc tiếp tục trong lượt này

- Kiểm tra lại Docker: PostgreSQL, Redis và ClamAV healthy; worker đang chạy. Không cần sửa Docker trong lượt này.
- Dùng Node 24.19.0 đi kèm runtime để khớp `.node-version`; lệnh `node` ngoài PATH ban đầu là 22.21.0.
- Bổ sung kiểm chứng browser: GET trạng thái lưu thất bại và retry thất bại đều phải khóa thao tác lưu, chỉ mở lại sau phản hồi server hợp lệ.
- Sửa một giả định có sẵn trong integration test vòng đời: không tìm yêu cầu mới ở trang đầu hàng đợi toàn cục xếp cũ trước. Test đọc lịch sử đúng tài liệu qua API của chủ sở hữu; giữ nguyên phân trang và thứ tự production. Trước sửa: 128 đạt, một lỗi `request.id` do không tìm thấy mục; sau sửa: 129 đạt, một skip.
- Rà soát độc lập mốc thư viện cá nhân và cập nhật checklist theo bằng chứng hiện tại.

## Kiểm chứng ngày 14/10

- `pnpm format:check`: đạt.
- `pnpm check`: lint, typecheck, 50 unit test và build API/web đạt.
- `pnpm test:setup`: database `hucescholar_test` có đủ sáu migration, không có migration chờ.
- `pnpm test:integration`: 129 đạt, một skip có chủ ý cho scanner thật opt-in. Cảnh báo deprecation `pg client.query` có sẵn vẫn còn.
- Browser lượt đầu: 51 đạt, một timeout chờ render PDF trong 5 giây. Error context đã có canvas/text nhưng trạng thái vẫn đang render; chạy lại riêng không đổi code đạt. Chưa kết luận nguyên nhân tải chậm.
- Lượt browser hai worker kế tiếp bị nhiễu do executor chạy typecheck song song: Prisma Client được sinh lại lúc17:41:49, API `nest --watch` đổi PID31336→30664; proxy báo `ECONNRESET` tại PDF và error context ghi17:41:55. Đây là lỗi thứ tự kiểm chứng trong lượt này, không phải bằng chứng một regression stream PDF. README đã nhắc không chạy codegen/build/typecheck khi browser đang chạy.
- Lượt xác nhận cuối chạy tuần tự `pnpm test:e2e --workers=2`: **52/52 đạt**, không thay đổi code product để xử lý các lần chạy trước. Format, lint và typecheck sau sửa test cũng đạt. Log `.local/resume-e2e-serial-final.log`.
- Ảnh thư viện đã lưu tại 1440/768/360 và reader 360 được kiểm tra trực tiếp; không thấy tràn trang/cắt nút trong các ảnh này. Ca browser kiểm tra cả chín ảnh saved/recent/reader ở ba viewport. Không suy ra chứng nhận WCAG hoặc thiết bị thật từ các ảnh.
- Rà soát độc lập 25 file không tìm thấy lỗi chặn về correctness/phân quyền. Còn P3: hủy **Bỏ lưu** bằng **Giữ tài liệu** làm nút đang focus unmount, cần trả focus về nút Bỏ lưu. Giữ trong backlog; không ảnh hưởng dữ liệu. Coverage ban đầu thiếu ca GET lỗi/retry lỗi đã được bổ sung và chạy đạt; empty-last-page và delayed-response khi đổi tab hiện chỉ được đọc code, chưa có assertion browser riêng.
- Detector chạy một lượt: 18 advisory về font/màu có sẵn trong `globals.css`, ngoài 30 dòng CSS mới. `DESIGN.md` tự giới hạn ở prototype `design/wireframe/`; không coi lệch ramp prototype là lỗi production hoặc tự thay thiết kế hiện hành.
- Smoke bản build local: `/`, `/login`, `/project`, `/workspace/personal-library`, manifest và health trả 200; workspace `private, no-store`, health `no-store`. Saved/recent/PDF chưa đăng nhập trả 401 với `no-store`. Web/API chạy nền bằng Node 24 ở 127.0.0.1:3000/3001. Không đăng nhập bằng credential thật trong lượt smoke.

Log kiểm chứng nằm trong `.local/resume-*.log` bị Git bỏ qua. Credential kiểm thử chỉ lưu trong `.local/test.env`, dùng database `_test` và Redis DB 15 riêng. Browser dùng PDF tổng hợp; trạng thái SAFE fixture không phải bằng chứng quét PDF thật trong lượt này.

Checkpoint Git local gồm giao diện, surface brief, test và tài liệu trên `codex/personal-library`; không push, merge hoặc deploy trong lượt này. Kiểm tra staged 21 file không có credential, generated client hoặc artifact riêng; `git diff --check` đạt.

## Phần còn lại và thứ tự đề xuất

1. **PWA:** hoàn thiện icon/installability, app shell/offline fallback công khai và kiểm chứng qua HTTPS. Manifest cơ bản đã có; chưa có service worker. Không cache request đăng nhập, dữ liệu cá nhân, PDF hoặc signed URL; đọc PDF offline không thuộc MVP.
2. **Môi trường pilot:** S3 private thật, reverse proxy/HTTPS, cấu hình cookie/IP, backup và kiểm tra phục hồi. Chưa có triển khai cloud hoặc xác nhận vận hành production.
3. **Thiết bị thật:** PDF và cảm ứng trên Android/iPhone/iPad, Safari và cài PWA. Playwright Chrome với viewport mobile/tablet không thay thế các kiểm tra này.
4. **Nguồn nội dung:** chỉ tích hợp sách/API thư viện sau khi có nguồn và quyền rõ ràng. Không tự nhập nội dung trường hoặc coi liên kết ngoài là quyền phân phối toàn văn.

Các khoảng trống khác cần được chốt phạm vi trước mốc tương ứng: SMTP/reset mật khẩu/buộc đổi mật khẩu khởi tạo và text highlight. Reader vẫn có giới hạn đã công bố: Back/Forward SPA chưa bảo vệ ghi chú chưa lưu. Không đánh đồng luồng học liệu chạy local với toàn bộ MVP đã sẵn sàng vận hành.
