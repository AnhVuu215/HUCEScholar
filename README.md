# HUCEScholar

Nền tảng học liệu điện tử dành cho sinh viên HUCE, phát triển theo hướng web responsive và PWA. Ba vai trò: quản trị viên, giảng viên và sinh viên.

Dự án độc lập đang phát triển; chưa phải hệ thống chính thức của trường. Chưa có dữ liệu học liệu thật hoặc tích hợp thư viện trường.

## Tài liệu

- [Tech stack và kiến trúc MVP](docs/HUCEScholar-tech-stack.md)
- [Mô hình dữ liệu và SQL tham chiếu](docs/database/README.md)
- [Prototype thiết kế](design/wireframe/README.md)
- [Proposal, use case và bộ tài liệu bàn giao](docs/deliverables/)
- [Quy tắc sản phẩm](PRODUCT.md)
- [Thiết kế giao diện hiện có](DESIGN.md)

HTML trong `design/` và `docs/deliverables/` là prototype dùng dữ liệu minh họa. Không dùng prototype để chứng minh chức năng đăng nhập, phân quyền, PDF hoặc lưu dữ liệu đã hoạt động.

## Lộ trình triển khai

1. Repository, workspace Next.js/NestJS, cấu hình local và CI.
2. Migration PostgreSQL giữ nguyên ràng buộc; tài khoản và phiên đăng nhập.
3. Catalog, upload, kiểm tra file và kiểm duyệt.
4. PDF reader, ghi chú riêng, tiến độ đọc và kiểm tra trên nhiều thiết bị.
5. PWA, kiểm thử hành trình và triển khai HTTPS.

Mỗi mốc có kiểm tra riêng trước khi chuyển tiếp. Không cam kết đọc offline trong MVP.
