# Cài ứng dụng

Mode: Read. Người dùng cần biết thiết bị có thể cài PWA thế nào và cài không tạo PDF offline.
Kế thừa auth-layout navy/white, typography và controls hiện hữu; không thiết kế lại landing hoặc logo. Guide inline, không popup tự động. Một nút cài chỉ khi có event thật; fallback menu luôn đọc được. Trạng thái hủy/lỗi không ngụ ý cài thành công. Standalone hiện đúng trạng thái.
Kiểm tra360/768/1440, keyboard và offline fallback. Synthetic install events chỉ kiểm tra logic UI; không thay kiểm chứng native installer/HTTPS/thiết bị thật.
