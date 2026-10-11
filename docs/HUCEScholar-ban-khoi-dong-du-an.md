# HUCEScholar — Bản khởi động dự án

Ngày soạn: 09/10/2026. Phiên bản: 0.4 — đã chốt A01–A06 cho MVP ngày 09/10/2026; chi tiết quyền admin và bàn giao ở BR16–BR17.

Tên sản phẩm được người dùng lựa chọn: HUCEScholar, viết liền theo đúng cách này.

## 1. Tóm tắt ý tưởng

HUCEScholar là ứng dụng giáo trình điện tử dành riêng cho sinh viên Trường Đại học Xây dựng Hà Nội, có ba vai trò: quản trị viên, giảng viên và sinh viên. Giảng viên quản lý giáo trình/học liệu trong phạm vi được phân công; sinh viên tìm, đọc, ghi chú và tải theo quyền; quản trị viên quản lý tài khoản, danh mục, phân công và việc công bố nội dung. Thư viện mini và chức năng sinh viên gửi tài liệu bổ sung được giữ từ yêu cầu ban đầu.

Giá trị cốt lõi: **giảng viên cung cấp và cập nhật giáo trình → sinh viên tiếp cận đúng học liệu → đọc, ghi chú và lưu tiến độ học tập**.

### Những gì xuất phát trực tiếp từ yêu cầu

- Sinh viên phải tìm tài liệu ở nhiều nơi, đặc biệt trong mùa thi.
- Cần một điểm truy cập thuận tiện cho tài liệu phục vụ học tập.
- Có thư viện mini sử dụng dữ liệu sách từ trường.
- Có khả năng ghi chú trực tiếp trên tài liệu.
- Cho phép tải xuống và tải tài liệu lên.
- Định hướng web/app.
- Người dùng đã làm rõ: sản phẩm là ứng dụng giáo trình điện tử dành riêng cho sinh viên HUCE, có ba role quản trị, giảng viên và sinh viên.

### Những giả định dùng để lập đề xuất

- Khởi đầu là dự án do sinh viên phát triển; chưa có thỏa thuận hợp tác hoặc quyền truy cập dữ liệu nội bộ của trường.
- Ưu tiên web dùng tốt trên điện thoại và máy tính; ứng dụng Android/iOS riêng được cân nhắc sau.
- Bản đầu hỗ trợ PDF, ghi chú cá nhân, giảng viên quản lý học liệu và quy trình công bố có kiểm soát.
- Thử nghiệm với một nhóm môn học trước khi mở rộng toàn trường.
- Quy mô nhóm, ngân sách, kinh nghiệm kỹ thuật và thời hạn chưa được xác định. Lộ trình phía dưới là ước lượng có điều kiện.

Các giả định về hợp tác, nguồn lực và quy mô thử nghiệm cần thông tin thực tế. Chính sách MVP A01–A06 đã được chốt; xem quy tắc nghiệp vụ và đặc tả phiên bản 1.1.

## 2. Bối cảnh và lý do hình thành dự án

### 2.1. Điều cần diễn đạt chính xác

Qua kiểm tra nguồn công khai, HUCE đã có website thư viện với chức năng tra cứu, danh mục tài liệu số và hướng dẫn đọc tài liệu số bằng tài khoản cá nhân. Website thư viện cũng liên kết đến cổng sách điện tử của trường. Vì vậy, không nên dùng phát biểu “trường không có hệ thống tài liệu chính thức” làm kết luận trong đề cương. [Nguồn: website thư viện](https://thuvien.huce.edu.vn/default.aspx?mnuid=11), [hướng dẫn đọc tài liệu số](https://thuvien.huce.edu.vn/introduction.aspx?contentid=1192&mnuid=164).

Đề xuất phát biểu vấn đề:

> Sinh viên có nhu cầu tiếp cận giáo trình và học liệu theo môn học, nhưng quá trình tìm kiếm và sử dụng có thể còn phân tán giữa các nguồn. Dự án hướng tới ứng dụng giáo trình điện tử dành riêng cho sinh viên HUCE, trong đó giảng viên cung cấp và cập nhật học liệu theo phạm vi được phân công, sinh viên đọc và ghi chú cá nhân, quản trị viên quản lý người dùng, danh mục và việc công bố nội dung.

“Phân tán”, “khó tìm” và “thiếu tài liệu phù hợp” hiện là vấn đề do người đề xuất phản ánh. Cần khảo sát sinh viên trước khi khẳng định đây là tình trạng phổ biến toàn trường. Việc một tính năng chưa thấy trong các trang công khai không chứng minh hệ thống hiện tại không có tính năng đó.

### 2.2. Nhu cầu cần xác minh

| Nhu cầu giả định | Cách xác minh | Hệ quả thiết kế nếu được xác nhận |
|---|---|---|
| Khó tìm tài liệu đúng môn | Yêu cầu sinh viên tìm một tài liệu trong các kênh họ thường dùng; đo thời gian và số lần đổi nguồn | Tìm theo mã môn, tên môn và loại tài liệu |
| Khó phân biệt tài liệu phù hợp chương trình hiện tại | Hỏi cách kiểm tra năm, tác giả, phiên bản và đề cương | Hiển thị năm, phiên bản, nguồn, phạm vi áp dụng |
| Tài liệu ôn thi nằm rải rác | Khảo sát nguồn dùng trong kỳ thi gần nhất | Nhóm đề cũ được phép chia sẻ, đề cương và bài tập theo môn |
| Phải chuyển ứng dụng để ghi chú | Quan sát một phiên đọc tài liệu | Reader có ghi chú và lưu tiến độ |
| Có người muốn đóng góp nhưng thiếu quy trình | Phỏng vấn sinh viên từng chia sẻ tài liệu | Upload dễ dùng, có trạng thái duyệt và phản hồi |

### 2.3. Đoạn lý do chọn đề tài có thể tái sử dụng

> Trong quá trình học tập, đặc biệt ở các giai đoạn ôn thi, sinh viên cần tiếp cận giáo trình và các học liệu phù hợp với từng môn. Từ trải nghiệm cá nhân, việc tìm kiếm và sử dụng các tài liệu này còn mất thời gian do phải chuyển giữa nhiều nguồn. Đề tài HUCEScholar đề xuất xây dựng ứng dụng giáo trình điện tử dành riêng cho sinh viên Trường Đại học Xây dựng Hà Nội, với ba vai trò quản trị viên, giảng viên và sinh viên. Hệ thống hỗ trợ quản lý giáo trình theo học phần, đọc và ghi chú cá nhân, tải theo quyền, đồng thời kết nối thông tin sách và tiếp nhận tài liệu bổ sung có kiểm duyệt. Dự án hướng tới cải thiện việc tiếp cận và sử dụng học liệu trong quá trình tự học.

## 3. Định vị sản phẩm và lựa chọn hướng đi

| Hướng | Lợi ích | Đánh đổi | Đề xuất |
|---|---|---|---|
| Ứng dụng giáo trình điện tử với tài khoản riêng | Đáp ứng ba vai trò; thử được luồng giảng viên quản lý và sinh viên học trên tài liệu | Cần phân công giảng viên và quy tắc công bố; xác minh người tham gia trước thử nghiệm thật | Hướng đề xuất cho bản đầu |
| Ứng dụng giáo trình điện tử tích hợp hệ thống trường | Có cơ hội thống nhất tài khoản, danh mục môn và dữ liệu sách | Phụ thuộc thỏa thuận, quyền khai thác và phương thức tích hợp | Mở rộng khi có điều kiện |
| Kho học liệu cộng đồng | Thuận tiện cho chia sẻ giữa sinh viên | Vai trò giảng viên và quản lý giáo trình không phải trọng tâm | Chức năng đóng góp bổ sung trong sản phẩm |

Định vị đã được người dùng làm rõ: **ứng dụng giáo trình điện tử dành riêng cho sinh viên HUCE, có quản trị viên, giảng viên và sinh viên**. Quan hệ chính thức với trường, tích hợp dữ liệu và cách xác minh tài khoản chưa được xác nhận.

Điểm khác biệt cần kiểm chứng: tổ chức theo học phần, nguồn gốc rõ ràng, đọc và ghi chú trong cùng một luồng, và nội dung được duy trì qua nhiều khóa học.

## 4. Người dùng và quyền sử dụng

| Nhóm | Nhu cầu chính | Quyền bản đầu |
|---|---|---|
| Quản trị viên (ADMIN) | Quản lý và vận hành | Quản lý tài khoản/role, khoa/ngành/môn, phân công giảng viên, dữ liệu sách; duyệt/ẩn nội dung và xử lý báo cáo |
| Giảng viên (LECTURER) | Cung cấp và cập nhật học liệu | Tạo bản nháp, upload và cập nhật phiên bản học liệu thuộc môn được phân công; gửi công bố; theo dõi trạng thái và phản hồi chuyên môn |
| Sinh viên (STUDENT) | Học trên giáo trình điện tử | Tìm/đọc/tải theo quyền; ghi chú riêng; lưu yêu thích và tiến độ; gửi tài liệu bổ sung, theo dõi bài gửi và báo cáo lỗi |

Ba role và chính sách MVP đã chốt; ma trận dưới đây được đồng bộ với đặc tả 1.1. Kiểm duyệt là nhiệm vụ của quản trị viên trong bản đầu, không tạo role thứ tư. Người chưa đăng nhập chỉ vào trang giới thiệu/đăng nhập trong MVP; danh mục học liệu yêu cầu tài khoản đã xác minh. Chưa đề xuất lớp học, giao bài, chấm điểm hay quản lý điểm vì người dùng chưa yêu cầu.

Tài khoản nền tảng độc lập với tài khoản trường trong bản đầu. Không yêu cầu người dùng cung cấp mật khẩu cổng trường. MVP dùng danh sách tài khoản được quản trị viên xác minh/cấp; người dùng không tự chọn role giảng viên hay quản trị viên khi đăng ký. Nếu mở tự đăng ký cho sinh viên, cần chốt cách xác minh trước khi dùng thật. Việc xác thực email chỉ chứng minh quyền kiểm soát hộp thư, không tự động chứng minh đang là sinh viên.

### 4.1. Ma trận quyền MVP

| Thao tác | Quản trị viên | Giảng viên | Sinh viên |
|---|---|---|---|
| Quản lý tài khoản, role, danh mục | Có | Không | Không |
| Phân công giảng viên phụ trách môn | Có | Không | Không |
| Tạo/cập nhật giáo trình | Không biên soạn; quản trị và duyệt | Học liệu mình quản lý thuộc môn được phân công | Không sửa giáo trình |
| Công bố/ẩn giáo trình | Có; admin duyệt trước công bố | Gửi yêu cầu công bố | Không |
| Gửi tài liệu bổ sung | Không | Qua luồng học liệu giảng viên | Có, chờ duyệt |
| Đọc/tải tài liệu | Theo chính sách truy cập | Theo chính sách truy cập | Theo chính sách truy cập |
| Xem/sửa ghi chú riêng của người khác | Không trong luồng sử dụng thông thường | Không | Không |

MVP yêu cầu admin duyệt trước công bố. Admin chỉ quản trị, duyệt và bàn giao; không biên soạn giáo trình. Người nhận bàn giao phải được giao tất cả môn liên quan; bản SUBMITTED về DRAFT để gửi lại, giữ nguyên bản đã duyệt và ghi chú. Xem [quy tắc nghiệp vụ](HUCEScholar-quy-tac-nghiep-vu.md).

## 5. Phạm vi bản đầu — MVP

MVP là bản nhỏ nhất có thể phục vụ một nhóm sinh viên thật và kiểm chứng giá trị của sản phẩm.

| Mã | Tính năng | Nội dung phải có trong bản đầu |
|---|---|---|
| F01 | Tài khoản và ba role | Đăng nhập/đăng xuất, đặt lại mật khẩu; cấp/xác minh tài khoản ADMIN, LECTURER, STUDENT; admin cấp/xác minh; chưa tự đăng ký |
| F02 | Danh mục học phần | Mã môn, tên môn, khoa quản lý; quan hệ với chương trình/ngành khi có dữ liệu xác minh |
| F03 | Tìm kiếm và lọc | Tìm tên/mã môn, tiêu đề tài liệu, tác giả; lọc môn, loại tài liệu và năm; hỗ trợ truy vấn tiếng Việt có/không dấu |
| F04 | Trang tài liệu | Mô tả, môn liên quan, nguồn, tác giả, năm, phiên bản, loại file, quyền đọc/tải, nhãn kiểm duyệt |
| F05 | Đọc PDF | Chuyển trang, phóng to/thu nhỏ, mở lại trang đọc gần nhất; thông báo khi file không đọc được |
| F06 | Ghi chú cá nhân | Ghi chú theo trang cho PDF; highlight đoạn chữ khi PDF có lớp văn bản; xem, sửa, xóa và lưu về tài khoản |
| F07 | Tải xuống | Tải file gốc khi chính sách của tài liệu cho phép; hiển thị rõ điều kiện trước thao tác |
| F08 | Đóng góp tài liệu | Upload PDF, điền thông tin nguồn và quyền chia sẻ; gửi duyệt; xem trạng thái và lý do yêu cầu sửa/từ chối |
| F09 | Thư viện cá nhân | Tài liệu đã lưu, đang đọc, ghi chú và tài liệu đã đóng góp |
| F10 | Thư viện mini | Thông tin sách, nguồn, liên kết tra cứu chính thức và môn học liên quan do nhóm biên tập gắn |
| F11 | Kiểm duyệt và báo cáo | Hàng đợi tài liệu, duyệt/ẩn/từ chối, báo cáo file lỗi/sai môn/nguồn không phù hợp; lưu người xử lý và lý do |
| F12 | Không gian giảng viên | Danh sách môn được phân công; tạo bản nháp giáo trình/bài giảng, cập nhật phiên bản, gửi công bố và theo dõi phản hồi |

Đọc và ghi chú trong HUCEScholar chỉ áp dụng cho PDF nền tảng được phép phục vụ. Sách chỉ có liên kết đến hệ thống khác được mở ở nguồn gốc; không hứa hẹn ghi chú trực tiếp trên nội dung bên ngoài.

### Chuyển sang giai đoạn sau

- App Android/iOS riêng; cài đặt PWA và thông báo đẩy.
- OCR cho PDF scan; highlight theo vùng ảnh; tìm kiếm toàn văn trong nội dung file.
- Xuất PDF kèm ghi chú; ghi chú chia sẻ và học nhóm.
- Chuyển Word/PowerPoint thành PDF, xử lý CAD/BIM hoặc bản vẽ chuyên dụng.
- AI hỏi đáp/tóm tắt, gợi ý cá nhân hóa, điểm thưởng cộng đồng.
- Đăng nhập SSO trường, đồng bộ tài khoản thư viện, trạng thái còn sách và nghiệp vụ mượn/trả.

Các tính năng sau chưa thuộc MVP. Bản đầu vẫn phải hoàn thành đủ luồng tìm → đọc/ghi chú → tải được phép và upload → kiểm duyệt.

## 6. Tổ chức học liệu và nguồn dữ liệu

### 6.1. Phân loại

Môn học là điểm truy cập chính. Khoa/ngành là bộ lọc và cách khám phá; không ép mỗi môn chỉ thuộc một ngành vì môn có thể dùng chung.

Loại tài liệu ban đầu: giáo trình, bài giảng, đề cương ôn tập, bài tập, lời giải tham khảo và đề thi cũ được phép chia sẻ. Nhãn “lời giải tham khảo” phải tách khỏi đáp án chính thức. Đồ án và tài liệu có thông tin cá nhân chỉ đưa vào khi có căn cứ chia sẻ và đã xử lý nội dung cần bảo vệ.

Một tài liệu có thể liên quan nhiều học phần. Năm học/học kỳ là thông tin tùy chọn khi có căn cứ; không tự suy ra từ thời điểm upload. Môn chưa có học liệu phải có trạng thái trống rõ ràng.

### 6.2. Thông tin tối thiểu của một tài liệu

- Tiêu đề, mô tả ngắn, học phần liên quan và loại tài liệu.
- Tác giả/chủ sở hữu nếu biết; nguồn gốc hoặc đường dẫn nguồn.
- Người đăng; ngày đăng; năm tài liệu nếu xác định được.
- Phiên bản file, số trang, dung lượng và mã băm chống trùng file.
- Căn cứ chia sẻ: tự biên soạn, được cho phép, giấy phép mở hoặc chỉ liên kết nguồn.
- Quyền đọc, quyền tải, phạm vi người được truy cập và trạng thái kiểm duyệt.
- Ngày kiểm tra gần nhất, người kiểm duyệt, ghi chú về phạm vi áp dụng.

Phân biệt ba nhãn: “đã kiểm duyệt đăng tải”, “nguồn chính thức” và “đã được người có chuyên môn kiểm tra nội dung”. Một tài liệu qua kiểm duyệt không mặc nhiên đúng kiến thức hoặc phù hợp mọi lớp.

### 6.3. Thư viện mini: lấy dữ liệu từ trường như thế nào?

Phải tách **thông tin về sách** khỏi **file toàn văn** và **quyền đọc/tải**. Có thông tin sách không đồng nghĩa có quyền sao chép sách.

| Tình huống | Cách triển khai |
|---|---|
| Chưa có hợp tác dữ liệu | Biên tập một danh mục nhỏ từ thông tin được phép sử dụng, ghi nguồn và liên kết tra cứu chính thức; không sao chép hàng loạt |
| Trường cung cấp CSV/Excel | Import theo mẫu đã thống nhất; xem trước, kiểm tra trùng và ghi thời điểm cập nhật |
| Có API/tích hợp được chấp thuận | Xây bộ kết nối riêng; giới hạn truy cập, xử lý lỗi và cập nhật theo thỏa thuận |
| Có quyền phục vụ toàn văn | Lưu file riêng tư, áp dụng chính sách truy cập cho từng tài liệu; đưa vào reader của nền tảng |
| Chỉ được đọc ở hệ thống trường | Mở liên kết nguồn; nêu rõ có thể cần đăng nhập ở nguồn; không đưa mật khẩu trường về nền tảng |

Chưa xác minh được API công khai, phương thức đồng bộ hoặc quyền tái phân phối dữ liệu/sách của trường. Không lấy những khả năng này làm điều kiện bắt buộc để MVP hoạt động. Không hiển thị số bản còn lại như dữ liệu thời gian thực khi chưa có kết nối được xác nhận.

Nguồn công khai xác nhận website thư viện có liên kết tới [cổng sách điện tử HUCE](https://ebooklib.huce.edu.vn/). Trong lần kiểm tra này, mở trực tiếp cổng sách điện tử bị timeout; chưa kiểm tra phiên đăng nhập, đọc sách hay tải xuống.

### 6.4. Kế hoạch tạo dữ liệu ban đầu

- Chọn 5–10 môn đang có nhu cầu thực tế, không tự suy đoán danh sách/mã môn chính thức.
- Mục tiêu chuẩn bị: 50–100 tài liệu có căn cứ chia sẻ, phủ các loại học liệu cần thiết; không tăng số lượng bằng file trùng.
- Chuẩn bị 20–30 bản ghi sách có thông tin nguồn và liên kết tra cứu; giảm số lượng nếu chưa xác nhận được quyền sử dụng thông tin.
- Mỗi bản ghi phải có người chịu trách nhiệm rà soát và phạm vi môn học rõ ràng.
- Dùng dữ liệu mẫu tự tạo để kiểm thử kỹ thuật; không dùng dữ liệu mẫu như bằng chứng kho thật đã có nội dung.

Đây là chỉ tiêu chuẩn bị đề xuất, chưa phải dữ liệu đã thu thập được.

## 7. Các luồng sử dụng chính

### 7.1. Tìm tài liệu để ôn thi

1. Sinh viên đăng nhập bằng tài khoản đã được cấp/xác minh trong phương án tham khảo; giao diện giữ đích tài liệu nếu đến từ liên kết chia sẻ.
2. Nhập tên hoặc mã môn và lọc loại tài liệu/năm.
3. Xem nguồn, phiên bản, nhãn chất lượng và trang chi tiết để kiểm tra mức độ phù hợp.
4. Backend kiểm tra quyền truy cập, sau đó sinh viên đọc PDF trong nền tảng hoặc đi đến nguồn ngoài.
5. Nguồn bên ngoài có thể yêu cầu đăng nhập riêng; tài khoản HUCEScholar không tự cấp quyền tại nguồn.
6. Ghi chú, lưu tài liệu; tải file gốc nếu được phép.

Nếu không có kết quả: gợi ý bỏ bớt bộ lọc, tìm tên môn khác hoặc xem nguồn thư viện. Không tự tạo tài liệu/đáp án để lấp chỗ trống.

### 7.2. Đóng góp tài liệu

1. Sinh viên chọn file PDF và điền thông tin bắt buộc để gửi tài liệu bổ sung. Giảng viên có luồng quản lý giáo trình theo phân công ở mục 7.5.
2. Hệ thống kiểm tra dung lượng, định dạng thật, mã băm trùng và khả năng xử lý.
3. File vào vùng riêng tư để kiểm tra an toàn; tài liệu chưa xuất hiện công khai.
4. Khi kiểm tra kỹ thuật đạt, tài liệu được chuyển tới hàng đợi kiểm duyệt nội dung/nguồn.
5. Quản trị viên chấp thuận, yêu cầu chỉnh sửa hoặc từ chối kèm lý do; có thể yêu cầu giảng viên phụ trách phản hồi về chuyên môn.
6. Chỉ phiên bản đã đạt kiểm tra và được chấp thuận mới được công bố.

Giới hạn ban đầu đề xuất: PDF tối đa 50 MB/file, tối đa 5 lượt gửi/ngày/sinh viên; cấu hình cho giảng viên điều chỉnh theo nhu cầu học liệu. PDF lỗi, có mật khẩu hoặc không xác định được quyền chia sẻ phải được xử lý rõ ràng, không công bố tự động.

### 7.3. Đọc và ghi chú

1. Mở đúng phiên bản tài liệu, khôi phục trang đọc gần nhất.
2. Tạo ghi chú gắn với trang; với PDF có lớp chữ thì có thể chọn chữ để highlight.
3. Giao diện thể hiện “đang lưu”, “đã lưu” hoặc “lưu thất bại”.
4. Khi lỗi mạng, giữ bản nháp trong phiên đang mở, cho thử lưu lại; không thông báo đã đồng bộ khi máy chủ chưa xác nhận.
5. Đăng nhập trên thiết bị khác sẽ đọc được ghi chú đã lưu thành công.

PDF scan vẫn cho ghi chú theo trang. Highlight chữ trên ảnh scan cần OCR, nằm ngoài MVP. Bản đầu cần online để đồng bộ và không cam kết làm việc offline.

### 7.4. Báo cáo và gỡ tài liệu

1. Người dùng gửi báo cáo kèm lý do.
2. Quản trị viên xem xét và ghi lại quyết định; tài liệu có vấn đề nghiêm trọng có thể bị tạm ẩn.
3. Khi tài liệu bị ẩn, API phải từ chối cấp lượt đọc/tải mới.
4. URL có thời hạn đã cấp có thể còn dùng được tới khi hết hạn; cơ chế phục vụ file cần xác định thời hạn ngắn. Không hứa thu hồi file đã tải về.
5. Ghi chú của người dùng được giữ riêng nhưng không cấp lại nội dung đã bị gỡ trái với chính sách. Việc xóa file thật và thời hạn lưu lịch sử phải được quy định trước khi vận hành.

### 7.5. Giảng viên quản lý giáo trình

1. Quản trị viên xác minh/cấp tài khoản giảng viên và phân công môn phụ trách.
2. Giảng viên chọn môn được phân công, tạo bản nháp, upload giáo trình hoặc bài giảng, khai báo nguồn và quyền sử dụng.
3. File được kiểm tra kỹ thuật, sau đó giảng viên gửi yêu cầu công bố.
4. Quản trị viên duyệt hoặc yêu cầu chỉnh sửa; giảng viên không tự công bố trong MVP.
5. Sinh viên có quyền truy cập tìm được phiên bản đã công bố và học trên tài liệu.
6. Khi có cập nhật, giảng viên tạo phiên bản mới; giữ đúng liên kết ghi chú với phiên bản cũ.

Giảng viên không được sửa học liệu của người khác hoặc môn ngoài phạm vi phân công chỉ bằng cách thay ID trong URL/API. Phân công theo môn không tự tạo nghiệp vụ quản lý lớp hoặc điểm số.

## 8. Danh sách màn hình

| Màn hình | Nội dung chính |
|---|---|
| Trang chủ | Ô tìm kiếm, môn tiêu biểu, lối vào tài liệu và thư viện mini |
| Danh mục môn | Tìm/lọc khoa, mã môn, tên môn; trạng thái môn chưa có tài liệu |
| Chi tiết môn | Giới thiệu ngắn, tài liệu theo loại, sách liên quan |
| Kết quả tìm kiếm | Danh sách, bộ lọc, sắp xếp, phân trang và trạng thái trống |
| Chi tiết tài liệu | Metadata, nguồn, quyền sử dụng, nút đọc/tải/lưu/báo cáo |
| PDF reader | Nội dung, điều hướng trang, zoom, ghi chú, highlight và trạng thái lưu |
| Thư viện mini | Tìm sách, tác giả, danh mục và nguồn |
| Chi tiết sách | Thông tin sách, môn liên quan, liên kết nguồn hoặc nút đọc khi được cấp quyền |
| Thư viện cá nhân | Đã lưu, đang đọc, ghi chú, tài liệu đã gửi và trạng thái duyệt |
| Upload/chỉnh sửa bài gửi | File, metadata, căn cứ chia sẻ và phản hồi kiểm duyệt |
| Tài khoản | Đăng ký, xác thực email, đăng nhập, đặt lại mật khẩu và hồ sơ tối thiểu |
| Quản trị | Hàng đợi duyệt, báo cáo, môn học, sách, người dùng và nhật ký |
| Không gian giảng viên | Môn được phân công, giáo trình đang quản lý, bản nháp, phiên bản và phản hồi công bố |

Đây là danh sách nhóm màn hình, không phải số lượng bản thiết kế cuối cùng. Trên điện thoại, panel ghi chú chuyển thành ngăn mở; thao tác đọc không phụ thuộc hover. Cần hỗ trợ bàn phím, nhãn nút rõ, tương phản dễ đọc và trạng thái lỗi dễ hiểu.

## 9. Kiến trúc kỹ thuật đề xuất

### 9.1. Kiến trúc tổng thể

Một backend chia module nghiệp vụ, một frontend web và kho file riêng. Cách tổ chức này giữ triển khai gọn, đồng thời giúp mở rộng từng phần khi có nhu cầu.

```text
Trình duyệt điện thoại / máy tính
               |
        Frontend web
               |
         Backend API
          /         \
 Cơ sở dữ liệu     Kho file riêng tư
        |
 Tác vụ kiểm tra file / email / xử lý nền

Nguồn thư viện trường: liên kết ngoài trong MVP;
bộ kết nối dữ liệu chỉ bổ sung khi có thỏa thuận.
```

Các module: tài khoản & ba role, danh mục học phần & phân công giảng viên, giáo trình/tài liệu & phiên bản, ghi chú & tiến độ, sách & nguồn, kiểm duyệt & báo cáo. Ghi chú không nằm trong module kiểm duyệt nội dung dùng chung.

### 9.2. Stack tham khảo

| Thành phần | Đề xuất sơ bộ | Lý do |
|---|---|---|
| Frontend | React + TypeScript | Tách reader và giao diện tương tác thành component, có kiểm tra kiểu dữ liệu |
| Backend | Spring Boot | Tổ chức nghiệp vụ, API và phân quyền tập trung; phù hợp nếu nhóm có nền tảng Java |
| Database | PostgreSQL | Lưu quan hệ môn–tài liệu, quyền, phiên bản và ghi chú |
| Kho file | Object storage có API tương thích S3 | Tách file lớn khỏi dữ liệu nghiệp vụ; kiểm soát truy cập bằng backend |
| PDF reader | PDF.js và lớp ghi chú do ứng dụng quản lý | Dùng công cụ có sẵn để hiển thị PDF, giữ quyền sở hữu dữ liệu ghi chú |
| Triển khai | Một môi trường thử nghiệm và một môi trường vận hành | Tách kiểm thử khỏi dữ liệu người dùng |

Đây là phương án tham khảo, chưa chốt framework hoặc phiên bản. Nếu nhóm đã thành thạo Laravel hoặc một stack khác, ưu tiên stack quen thuộc có khả năng đáp ứng yêu cầu thay vì học đồng thời nhiều công nghệ mới. Thư mục hiện tại chưa có mã ứng dụng để kế thừa.

[PDF.js](https://mozilla.github.io/pdf.js/) cung cấp nền tảng phân tích và hiển thị PDF; các quy tắc ghi chú, quyền riêng tư, lưu trữ và đồng bộ ở đây là thiết kế ứng dụng đề xuất. [Spring Boot](https://spring.io/projects/spring-boot/) là nguồn tham khảo cho backend; chưa kiểm tra môi trường Java hay dependency của dự án vì chưa triển khai.

### 9.3. Các quyết định kỹ thuật quan trọng

- Không lưu file PDF dạng blob trong bảng nghiệp vụ; database giữ metadata và khóa đối tượng.
- Kho file mặc định riêng tư. Backend kiểm tra quyền trước khi phục vụ file hoặc cấp URL có thời hạn.
- Tách trạng thái kiểm tra file, trạng thái kiểm duyệt và chính sách truy cập; một cờ “published” không đủ biểu diễn toàn bộ điều kiện.
- File mới tạo phiên bản bất biến mới, được kiểm tra và duyệt lại. Bản cũ đang công bố tiếp tục có hiệu lực tới khi bản mới được chấp thuận, trừ trường hợp phải gỡ.
- Ghi chú gắn với người dùng và phiên bản file. Giữ tọa độ trong hệ tọa độ trang PDF để không lệch khi zoom, xoay hoặc đổi kích thước màn hình; highlight chữ có thể lưu thêm trích đoạn để đối chiếu.
- Không tự chuyển ghi chú sang phiên bản khác vì số trang/nội dung có thể thay đổi.
- Dùng cơ chế revision khi cập nhật ghi chú để tránh thiết bị này âm thầm ghi đè thay đổi mới trên thiết bị khác.
- Bản đầu tìm trong metadata, không hứa tìm toàn bộ nội dung PDF. Đánh giá cách chuẩn hóa truy vấn tiếng Việt bằng bộ dữ liệu thật trước khi chọn chỉ mục tìm kiếm.
- Tác vụ kiểm tra file phải có trạng thái và cơ chế thử lại; tài liệu có kiểm tra thất bại không được tự công bố.
- Tài khoản web có thể dùng session/cookie bảo mật cùng origin, chống CSRF; không mặc định thêm cơ chế token phức tạp khi chưa có app riêng.

## 10. Mô hình dữ liệu khởi đầu

Đây là mô hình khái niệm để thảo luận, chưa phải migration hoặc schema đã chạy.

| Nhóm dữ liệu | Thông tin chính |
|---|---|
| User, Role, UserRole | Tài khoản, trạng thái, quyền |
| LecturerCourseAssignment | Giảng viên, môn được phân công và trạng thái phân công; kiểm tra phạm vi tại backend |
| Faculty, Program, Course, ProgramCourse | Khoa, chương trình, học phần và quan hệ dùng chung; thông tin phiên bản chương trình nếu có |
| Document | Định danh tài liệu, người đóng góp, phiên bản đang công bố |
| DocumentVersion | Metadata của phiên bản, file, mã băm, quyền đọc/tải, căn cứ chia sẻ, kết quả kiểm tra và kiểm duyệt |
| VersionCourse | Một phiên bản có thể liên quan nhiều học phần |
| Annotation | Chủ sở hữu, phiên bản tài liệu, trang, loại ghi chú, nội dung, tọa độ, revision |
| SavedDocument, ReadingProgress | Tài liệu đã lưu và tiến độ đọc theo người dùng/phiên bản |
| Book, BookCourse, SourceRecord | Thông tin sách, môn liên quan, hệ thống nguồn, ID nguồn, URL và ngày kiểm tra |
| Report, ModerationAction | Báo cáo, người xử lý, hành động, lý do và thời điểm |

Quan hệ đáng chú ý: học phần–chương trình, học phần–tài liệu và học phần–sách đều có thể là nhiều–nhiều. Bản ghi sách có thể liên kết một Document được phép phục vụ toàn văn; nếu chỉ có nguồn ngoài thì không tạo file giả trong kho.

## 11. An toàn, quyền sử dụng và vận hành

### Nội dung và quyền phân phối

- Người đăng phải cung cấp căn cứ chia sẻ; một checkbox tự cam kết không thay thế việc kiểm tra nguồn.
- Với nguồn chưa đủ căn cứ, giữ riêng để bổ sung hoặc chỉ liên kết tới nguồn có thẩm quyền.
- Không coi tài liệu trong nhóm chat, Google Drive hoặc cổng đăng nhập là mặc nhiên được phép đăng lại.
- Chỉ dùng đề thi đã được phép chia sẻ; ghi rõ đề cũ và đáp án tham khảo. Không công bố đề đang diễn ra hoặc tài liệu nội bộ chưa được phép.
- Công khai quy trình tiếp nhận yêu cầu chỉnh sửa/gỡ; có người chịu trách nhiệm xử lý.
- Nếu dự án chưa được trường công nhận, mô tả đúng là dự án ứng dụng giáo trình điện tử dành cho sinh viên HUCE do nhóm phát triển vận hành; tên miền, logo và nội dung không tạo hiểu nhầm về đơn vị vận hành.

### An toàn kỹ thuật và riêng tư

- Kiểm tra nội dung file thật, giới hạn dung lượng/tần suất, cách ly và quét file trước công bố. Nếu kiểm tra an toàn chưa hoạt động thì chưa mở upload công khai.
- Không thực thi nội dung nhúng trong tài liệu; cập nhật công cụ đọc PDF khi có bản sửa liên quan an toàn.
- Kiểm tra quyền phía máy chủ với từng tài liệu và từng ghi chú; ẩn nút trên giao diện không thay thế phân quyền.
- Ghi chú riêng tư; giảng viên và quản trị viên không có quyền đọc ghi chú riêng của sinh viên trong luồng sử dụng thông thường. Nếu cần hỗ trợ truy cập đặc biệt, phải có quy trình giới hạn và nhật ký rõ ràng.
- Thu thập tối thiểu email, tên hiển thị và thông tin học tập tùy chọn; chưa cần căn cước, ảnh thẻ hay lịch học cá nhân.
- Có chính sách xóa tài khoản/ghi chú và thời hạn xóa khỏi bản sao lưu; quyết định rõ cách xử lý đóng góp công khai khi người đăng rời nền tảng.
- Nhật ký không ghi mật khẩu, token hay nội dung ghi chú cá nhân.

### Vận hành tối thiểu

- Sao lưu cả database và file; kiểm tra khôi phục trên môi trường tách biệt trước thử nghiệm thật.
- Theo dõi lỗi đọc/upload/lưu ghi chú, dung lượng, băng thông và hàng đợi duyệt.
- Phân công ít nhất một người kiểm duyệt và một người phụ trách sự cố; một người có thể kiêm nhiệm ở quy mô nhỏ.
- Đặt mục tiêu phản hồi bài gửi trong 48 giờ khi thử nghiệm, chỉ công bố như cam kết khi có đủ người vận hành.
- Xử lý file mồ côi, bài gửi bỏ dở, retry tác vụ và tình huống backup metadata không khớp file.

## 12. Lộ trình triển khai có điều kiện

Ước lượng 10–12 tuần cho nhóm khoảng 2 người đã quen stack, mỗi người dành 15–20 giờ/tuần, có cộng tác viên hỗ trợ nội dung; chưa bao gồm thời gian xin quyền tích hợp trường. Với một người vừa học vừa làm, cần ước lượng lại sau khảo sát và thử nghiệm reader, không coi mốc này là cam kết.

| Giai đoạn | Khoảng thời gian | Kết quả đầu ra / điều kiện chuyển bước |
|---|---|---|
| Khảo sát và phạm vi | Tuần 1 | Phỏng vấn, kiểm tra nguồn hiện có, chọn nhóm môn và người thử nghiệm; xác nhận vấn đề và khả năng có dữ liệu |
| Đặc tả và thử nghiệm kỹ thuật | Tuần 2 | Ma trận quyền ba role, phạm vi phân công, chính sách công bố, wireframe và schema/API sơ bộ; thử PDF có chữ, scan, nhiều trang và ghi chú; chốt stack theo năng lực |
| Nền tảng và kho tài liệu | Tuần 3–4 | Tài khoản, phân quyền, danh mục, metadata, tìm kiếm; upload riêng tư và kiểm tra file |
| Đọc và học | Tuần 5–6 | Reader, ghi chú, highlight có điều kiện, lưu tiến độ, tải có kiểm tra quyền |
| Giảng viên, đóng góp và quản trị | Tuần 7–8 | Không gian giảng viên, phân công môn, luồng công bố/duyệt, phiên bản, báo cáo, thư viện cá nhân và danh mục sách có nguồn |
| Kiểm thử và vận hành | Tuần 9–10 | Kiểm tra phân quyền, hồi quy, hiệu năng thử nghiệm, khôi phục backup; rà soát dữ liệu và quyền sử dụng |
| Thử nghiệm người dùng | Tuần 11–12 | Thử với 20–50 sinh viên, đo kết quả, sửa lỗi cản trở học và quyết định bước tiếp theo |

Thực hiện theo các phần việc có thể nghiệm thu riêng: (1) ba role/phân công và danh mục; (2) giáo trình/công bố/tìm kiếm; (3) reader/ghi chú; (4) tài liệu bổ sung và sách/nguồn; (5) vận hành. Mỗi phần cần đặc tả chi tiết và kế hoạch kỹ thuật trước khi viết code. Ước lượng cần rà soát lại sau khi chốt quyền giảng viên và cơ chế xác minh người dùng.

### Chi phí cần tính trước khi mở rộng

Chưa báo giá dịch vụ cụ thể vì chưa chọn nhà cung cấp, vùng đặt dữ liệu và quy mô truy cập. Lập ngân sách cho hosting/backend, database, file, backup, email, tên miền, giám sát và công sức kiểm duyệt.

- Dung lượng lưu ≈ tổng dung lượng file gốc + các phiên bản + ảnh xem trước + bản sao lưu.
- Băng thông ≈ dung lượng thực sự truyền khi đọc/tải × số phiên sử dụng, tính cả lượt đọc lại.
- Ví dụ giả định: 1.000 file × trung bình 20 MB ≈ 20 GB file gốc; 5.000 lượt tải đủ file × 20 MB ≈ 100 GB truyền dữ liệu, chưa gồm đọc online và backup.
- Tránh suy ra “file ít nên chi phí thấp”: lưu nhiều phiên bản, đọc PDF lớn và người trực kiểm duyệt đều tạo chi phí.

## 13. Tiêu chí nghiệm thu bản thử nghiệm

Đây là mục tiêu đề xuất, cần điều chỉnh theo môi trường đo và thiết bị của sinh viên.

| Mã | Điều kiện đạt |
|---|---|
| A01 | Tìm được tài liệu đã chuẩn bị theo mã/tên môn và loại tài liệu; truy vấn có/không dấu cho kết quả mong đợi |
| A02 | Người chưa đăng nhập và tài khoản không có quyền không thể đọc/tải file riêng tư bằng cách gọi URL/API trực tiếp |
| A03 | File chưa đạt kiểm tra hoặc chưa được duyệt không xuất hiện ở danh sách và không được cấp file |
| A04 | Ghi chú lưu thành công vẫn còn khi tải lại và khi đăng nhập ở thiết bị khác; người khác không đọc/sửa được |
| A05 | Highlight trên PDF có lớp chữ giữ đúng vị trí khi zoom, xoay và đổi kích thước; PDF scan vẫn ghi chú theo trang được |
| A06 | Bản PDF thay thế không làm ghi chú bản cũ bị gắn sang trang/nội dung khác |
| A07 | Hệ thống hiển thị lỗi mạng, upload lỗi và lưu thất bại đúng; không thông báo lưu thành công khi chưa có xác nhận |
| A08 | Quyền tải được thực thi ở backend; sách chỉ liên kết nguồn ngoài không hiện nút tải từ HUCEScholar |
| A09 | Quyết định kiểm duyệt và thay đổi quyền được ghi nhật ký; thao tác đồng thời không công bố nhầm phiên bản |
| A10 | Có thể khôi phục database và file trên môi trường kiểm thử, kiểm tra tài liệu/ghi chú còn đúng liên kết |
| A11 | Với bộ dữ liệu 1.000 bản ghi và khoảng 30 người dùng đồng thời giả lập, 95% phản hồi API tìm kiếm dưới 1 giây trên môi trường ghi nhận rõ |
| A12 | Reader thử được PDF văn bản, scan, trang xoay, file lớn trong giới hạn; PDF lỗi/có mật khẩu có thông báo rõ; kiểm tra trên điện thoại và máy tính |
| A13 | Giảng viên không thể sửa học liệu ngoài phạm vi phân công hoặc thuộc giảng viên khác bằng cách thay ID; thu hồi phân công chặn quyền quản lý tương ứng |
| A14 | Sinh viên không thể tự cấp role giảng viên/quản trị viên; API công bố tuân thủ chính sách được chốt; giảng viên không xem được ghi chú riêng của sinh viên |

A11 là ngân sách hiệu năng thử nghiệm, chưa phải năng lực hệ thống đã đo. API nhanh không đồng nghĩa PDF tải nhanh; cần đo riêng thời gian hiện trang đầu theo file và điều kiện mạng thực tế.

## 14. Kiểm chứng giá trị với sinh viên

### Trước khi code

- Phỏng vấn 10–15 sinh viên thuộc vài năm học; ưu tiên người vừa trải qua một mùa thi.
- Trao đổi với 2–3 giảng viên về cách phát hành/cập nhật giáo trình, phạm vi môn phụ trách và mong muốn công bố; đây là nhóm người dùng cốt lõi theo định hướng mới.
- Hỏi về lần gần nhất họ cần tìm tài liệu: môn nào, nguồn nào, mất bao lâu, điều gì khó nhất, đã dùng thư viện trường chưa và vì sao.
- Xin ví dụ tài liệu họ thực sự cần; kiểm tra xem nhóm có thể thu thập hợp lệ hay chỉ biết rằng “có nhu cầu”.
- Nếu có điều kiện, trao đổi với cán bộ thư viện/giảng viên để hiểu nguồn dữ liệu, điều kiện khai thác và cơ hội phối hợp. Chưa mặc định họ đồng ý tham gia.

### Trong thử nghiệm

- Với tác vụ tìm học liệu đã có trong kho, đặt mục tiêu ít nhất 80% người thử tìm đúng trong 2 phút; đối chiếu với cách tìm cũ trên tác vụ tương đương.
- Mục tiêu 20–50 người tham gia thử nghiệm; theo dõi số người hoàn thành một phiên đọc có ý nghĩa, tỷ lệ lỗi và quay lại trong 7 ngày.
- Theo dõi truy vấn không có kết quả, môn thiếu học liệu, bài gửi bị từ chối và thời gian chờ duyệt.
- Hỏi riêng tính hữu ích của ghi chú; số lượt mở reader không chứng minh ghi chú có giá trị.
- Đo bằng sự kiện tối thiểu; không thu nội dung ghi chú để phân tích hành vi.

Quyết định mở rộng dựa trên việc sinh viên tìm và dùng tài liệu tốt hơn, nguồn nội dung có thể duy trì và khối lượng kiểm duyệt chịu được; không chỉ dựa vào lượt đăng ký.

## 15. Rủi ro và cách giảm thiểu

| Rủi ro | Hướng xử lý |
|---|---|
| Sản phẩm trùng nhu cầu đã được hệ thống trường đáp ứng | Khảo sát tác vụ thực tế trước, chọn phần trải nghiệm còn thiếu làm trọng tâm |
| Không có dữ liệu hay quyền tích hợp trường | MVP hoạt động độc lập với danh mục được phép và liên kết nguồn; không hứa đồng bộ |
| Kho nhiều file nhưng thiếu chất lượng | Bắt đầu ít môn, có người phụ trách; nguồn và phiên bản rõ; rà soát định kỳ |
| Tài liệu sai, trùng, cũ hoặc sai quyền chia sẻ | Kiểm duyệt, mã băm, nhãn tham khảo, báo cáo và quy trình gỡ |
| Reader/ghi chú khó hơn dự kiến | Thử kỹ thuật sớm với PDF thực tế; ghi chú theo trang là nền tảng, OCR để sau |
| Chi phí truyền file hoặc tải trên điện thoại cao | Giới hạn file, đo thời gian tải và băng thông; điều chỉnh phục vụ file dựa trên số liệu |
| Không có người duy trì | Thu hẹp phạm vi, phân công kiểm duyệt và ngân sách vận hành trước khi mở rộng |
| Mở quá nhiều tính năng cùng lúc | Giữ các tiêu chí MVP, đánh giá tính năng mới sau thử nghiệm |

## 16. Việc nên làm ngay trong tuần đầu

1. Dùng chính sách MVP đã chốt và BR16–BR17 để thiết kế ERD, dữ liệu quyền và luồng màn hình.
2. Chọn nhóm thử nghiệm, 5–10 môn và phỏng vấn sinh viên/giảng viên về trải nghiệm gần nhất; tránh chỉ hỏi “bạn có thích app này không?”.
3. Lập bảng nguồn tài liệu: tên, môn, nguồn, người sở hữu, căn cứ chia sẻ, quyền đọc/tải và người kiểm tra.
4. Thu thập một bộ PDF được phép dùng để thử: văn bản, scan, trang xoay và file nhiều trang.
5. Vẽ bốn luồng chính: phân công–tạo giáo trình–công bố; tìm–đọc–ghi chú; sinh viên gửi tài liệu–duyệt; tra sách–mở nguồn.
6. Chốt năng lực nhóm, thời gian và ngân sách; từ đó chọn stack và ước lượng lại.
7. Viết đặc tả chi tiết phần đầu tiên, mô hình dữ liệu và tiêu chí nghiệm thu trước khi triển khai.

### Các quyết định còn cần chốt

- Dự án độc lập hay có đơn vị trong trường đồng hành?
- Làm cá nhân hay nhóm; mỗi tuần có bao nhiêu thời gian; mục tiêu là học tập, đồ án hay vận hành lâu dài?
- Nhóm sinh viên và môn nào thử nghiệm đầu tiên?
- Nguồn tài liệu nào có thể dùng hợp lệ ngay; ai trực kiểm duyệt?
- Ngân sách vận hành và người chịu trách nhiệm dữ liệu là ai?
- Nhóm đã quen stack nào; có mốc thời gian bắt buộc không?

Các câu hỏi này không ngăn việc hoàn thành bản đề xuất hiện tại. Cần giải quyết trước khi biến đề xuất thành cam kết triển khai.

## 17. Nguồn đã kiểm tra và giới hạn bằng chứng

1. [Website Thư viện Trường Đại học Xây dựng Hà Nội](https://thuvien.huce.edu.vn/default.aspx?mnuid=11): có tra cứu, danh mục học liệu và liên kết nguồn sách điện tử. Không dùng số lượng hiển thị làm thống kê bao phủ nhu cầu sinh viên.
2. [Hướng dẫn đọc tài liệu số](https://thuvien.huce.edu.vn/introduction.aspx?contentid=1192&mnuid=164): mô tả thao tác tìm sách và đăng nhập tài khoản cá nhân để đọc; không chứng minh HUCEScholar có quyền tích hợp.
3. [Cổng sách điện tử HUCE](https://ebooklib.huce.edu.vn/): được website thư viện liên kết; mở trực tiếp bị timeout trong lần kiểm tra này. Chưa xác nhận khả năng đọc/tải hay API.
4. [PDF.js](https://mozilla.github.io/pdf.js/): tham khảo công cụ phân tích và hiển thị PDF.
5. [Spring Boot](https://spring.io/projects/spring-boot/): tham khảo phương án backend, chưa chốt phiên bản.

Tài liệu này là bản định hình sản phẩm và kế hoạch khởi động. Chưa có ứng dụng, schema chạy thực tế, dữ liệu sách đã nhập, kết quả kiểm thử phần mềm, khảo sát sinh viên hay thỏa thuận với trường.
