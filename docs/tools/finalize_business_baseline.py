"""Apply the agreed MVP policies to the existing document source once."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
source = ROOT / 'docs/tools/hucescholar_content.json'
data = json.loads(source.read_text(encoding='utf-8'))
assert 'giả định' in data['usecase_intro'][1].lower(), 'Baseline already applied'

data['assumptions'][1][1] = 'Giảng viên gửi yêu cầu công bố; quản trị viên duyệt trước khi sinh viên truy cập. Giảng viên không tự công bố trong MVP.'
data['usecase_intro'][1] = 'FR01–FR12 liên kết với Project Proposal. A01–A06 là chính sách MVP đã được người đề xuất chốt ngày 09/10/2026. BR16–BR17 bổ sung chi tiết thiết kế về quyền admin và bàn giao học liệu. Tài liệu là cơ sở thiết kế dữ liệu, màn hình và kiểm thử; chưa phải bằng chứng phần mềm đã được triển khai.'

for sections in [data['proposal_sections'], data['usecase_front']]:
    for sec in sections:
        sec['title'] = sec['title'].replace('3 Đối tượng sử dụng và giả định', '3 Đối tượng sử dụng và chính sách MVP').replace('1 Phạm vi thuật ngữ và giả định', '1 Phạm vi thuật ngữ và chính sách MVP')
        for b in sec['blocks']:
            if b.get('h2') in ['3 1 Giả định dùng cho bản thảo', '1 1 Giả định nghiệp vụ của bản thảo']:
                b['h2'] = b['h2'][:3] + ' Chính sách MVP đã chốt'
            if b.get('p', '').startswith('Các giả định dưới đây'):
                b['p'] = 'A01–A06 được người đề xuất chốt ngày 09/10/2026 cho MVP. Giữ mã A để truy vết từ bản 1.0. Thay đổi chính sách phải cập nhật đồng thời proposal, use case, ma trận quyền và tiêu chí nghiệm thu.'
            if b.get('p', '').startswith('A01–A06 giống'):
                b['p'] = 'A01–A06 thống nhất với Project Proposal phiên bản 1.1, đã chốt ngày 09/10/2026. BR16–BR17 cụ thể hóa quyền admin và bàn giao; không thay đổi ba role hoặc bổ sung chức năng LMS.'
            if 'table' in b:
                t = b['table']
                t['headers'] = ['Chính sách MVP' if h == 'Giả định' else h for h in t['headers']]
                for row in t['rows']:
                    if row[0] == 'Tạo/cập nhật giáo trình': row[1] = 'Không biên soạn'
                    if row[0] == 'Gửi tài liệu bổ sung': row[1:3] = ['Không', 'Qua UC15–17']
                    if row[0] == 'ADMIN': row[2] = 'Không biên soạn giáo trình; không đọc ghi chú riêng của người khác'

sec = data['proposal_sections'][9]
sec['title'] = '10 Quyết định đã chốt và công việc tiếp theo'
sec['blocks'][0]['p'] = 'A01–A06 đã chốt cho MVP ngày 09/10/2026. Admin quản trị và duyệt, không trực tiếp biên soạn giáo trình. Admin có thể bàn giao học liệu giữa các giảng viên đủ phân công; giữ nguyên phiên bản đã công bố, tác giả và ghi chú. Chi tiết ở BR16–BR17 và Business Rules and Publication Workflow.'

front = data['usecase_front'][1]
rules = next(b['bullets'] for b in front['blocks'] if 'bullets' in b)
rules += [
    'BR16 ADMIN không tạo, thay file hoặc sửa nội dung/metadata giáo trình trong MVP. ADMIN duyệt, yêu cầu sửa, ẩn/khôi phục và bàn giao chủ quản lý theo UC06. Danh mục sách vẫn do ADMIN biên tập theo UC22.',
    'BR17 Bàn giao chỉ áp dụng học liệu giảng viên. Người nhận phải hoạt động và được giao tất cả môn liên quan. Chuyển chủ quản lý và đưa bản SUBMITTED về DRAFT trong một giao dịch có kiểm tra revision; người nhận rà soát và gửi lại. Giữ tác giả/người gửi cũ trong lịch sử, file đã duyệt và ghi chú. Không tự bàn giao khi thu hồi phân công.'
]
for b in front['blocks']:
    if 'table' in b and b['table']['headers'][0] == 'Hành động':
        b['table']['rows'].insert(2, ['Bàn giao chủ quản lý giáo trình', 'Có theo BR17', 'Không', 'Không'])
    if b.get('p', '').startswith('Kiểm tra file dùng'):
        b['p'] += ' MVP ẩn/khôi phục toàn tài liệu, áp dụng tất cả phiên bản; không có thao tác ẩn riêng một phiên bản. Phiên bản cũ còn phải đáp ứng quyền hiện hành và điều kiện an toàn.'

uc = {u['id']: u for u in data['usecases']}
u = uc['UC06']
u['goal'] = 'Xác định phạm vi giảng viên và bàn giao chủ quản lý học liệu khi cần.'
u['trigger'] = 'Quản trị viên thêm/thu hồi phân công hoặc chọn bàn giao học liệu giảng viên.'
u['steps'] += ['Khi bàn giao: chọn học liệu, giảng viên nhận và nhập lý do; hệ thống kiểm tra người nhận hoạt động, được giao tất cả môn liên quan.', 'Kiểm tra revision và chuyển chủ quản lý trong giao dịch; đưa phiên bản SUBMITTED về DRAFT, ghi audit và yêu cầu người nhận rà soát/gửi lại. Giữ phiên bản đã công bố, tác giả lịch sử và ghi chú.']
u['alts'] += ['Người nhận thiếu phân công, tài khoản ngừng hoạt động hoặc dữ liệu vừa đổi: từ chối bàn giao; không chuyển một phần.', 'Bài sinh viên đóng góp không được chuyển thành giáo trình bằng thao tác bàn giao.']
u['post'] = 'Phân công/chủ quản lý phản ánh thao tác đã xác nhận. Thu hồi đơn thuần không tự chuyển chủ hoặc gỡ bản công bố. Bản chờ duyệt bị rút khi bàn giao cần được người nhận gửi lại.'
u['rules'] += ' BR16, BR17. Kiểm tra người cũ mất quyền sửa sau bàn giao, người nhận phải gửi lại và ghi chú vẫn gắn đúng phiên bản.'
u = uc['UC18']
u['alts'][1] += ' Admin không sửa thay nội dung; dùng UC06 để bàn giao nếu cần rồi người nhận gửi lại.'
uc['UC17']['pre'] = 'Giảng viên còn quyền quản lý, bản ở DRAFT, file SAFE và thông tin nguồn đầy đủ. Bản CHANGES_REQUIRED về DRAFT khi bắt đầu chỉnh sửa trước khi gửi lại.'
uc['UC14']['steps'][1] = 'Với DRAFT hoặc CHANGES_REQUIRED, sinh viên bổ sung thông tin/file theo phản hồi; bắt đầu sửa bản CHANGES_REQUIRED đưa bản đó về DRAFT.'
u = uc['UC19']
u['pre'] = 'Quản trị viên được phép xử lý; tài liệu tồn tại và có trạng thái hiện tại.'
u['steps'][0] = 'Xem nội dung, lý do và trạng thái; thao tác áp dụng toàn tài liệu và tất cả phiên bản trong MVP.'
u['steps'][3] = 'Khi khôi phục toàn tài liệu, kiểm tra bản hiện hành APPROVED, file SAFE, quyền hợp lệ và lý do gỡ đã giải quyết. Bản cũ chỉ đọc được nếu riêng nó còn đủ điều kiện.'
u['post'] = 'Khả năng truy cập mới của toàn tài liệu phản ánh quyết định; không xóa file hoặc ghi chú bằng thao tác ẩn.'

back = data['usecase_back'][1]
back['title'] = '7 Chính sách đã chốt và quản lý thay đổi'
back['blocks'][0]['table']['headers'][1] = 'MVP đã chốt ngày 09/10/2026'
back['blocks'][1]['p'] = 'A01–A06 là cơ sở MVP đã chốt; bảng trên ghi tác động nếu sau này đổi phạm vi. BR16–BR17 là chi tiết thiết kế bổ sung. Mỗi thay đổi cần ghi người quyết định, ngày, lý do, FR/UC bị ảnh hưởng và tiêu chí nghiệm thu; cập nhật đồng thời proposal và use case.'
back['blocks'][-1]['p'] = 'Project Proposal và Use Case Specification phiên bản 1.1 thống nhất phạm vi MVP. Business Rules and Publication Workflow trình bày ma trận quyền, chuyển trạng thái và bàn giao. Bản khởi động phiên bản 0.4 được đồng bộ chính sách. Chưa có API trường hoặc quyền dữ liệu toàn văn được xác nhận.'
at = next(b['table']['rows'] for b in data['usecase_back'][0]['blocks'] if 'table' in b and b['table']['headers'][0] == 'Mã')
assert at[3][0] == 'AT04'
at[3][1] += '; bàn giao khi đang chờ duyệt'
at[3][2] += '; đổi chủ nguyên tử, bản chờ về DRAFT, giữ ghi chú'

source.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

builder = ROOT / 'docs/tools/build_hucescholar_docs.py'
text = builder.read_text(encoding='utf-8')
text = text.replace('Bản thảo 1.0', 'Phiên bản 1.1').replace('Phiên bản 1.0  |', 'Phiên bản 1.1  |')
text = text.replace('Trạng thái Bản thảo phục vụ thảo luận và thiết kế', 'Trạng thái Chính sách MVP đã chốt phục vụ thiết kế')
text = text.replace('bản khởi động HUCEScholar phiên bản 0.3. Các quy tắc chi tiết về tài khoản, công bố và phạm vi truy cập là giả định thiết kế được đánh mã trong tài liệu; chưa phải cam kết của nhà trường.', 'bản khởi động HUCEScholar phiên bản 0.4. A01–A06 được người đề xuất chốt ngày 09/10/2026; BR16–BR17 cụ thể hóa quyền admin và bàn giao. Quyết định phạm vi dự án không phải cam kết hợp tác hoặc quyền sử dụng dữ liệu của nhà trường.')
builder.write_text(text, encoding='utf-8')

brief = ROOT / 'docs/HUCEScholar-ban-khoi-dong-du-an.md'
text = brief.read_text(encoding='utf-8')
text = text.replace('Phiên bản: 0.3 — người dùng đã chọn tên HUCEScholar; ba vai trò đã xác nhận, quyền chi tiết là đề xuất để thảo luận.', 'Phiên bản: 0.4 — đã chốt A01–A06 cho MVP ngày 09/10/2026; chi tiết quyền admin và bàn giao ở BR16–BR17.')
text = text.replace('Ba role ở trên là yêu cầu đã xác nhận; quyền chi tiết là đề xuất.', 'Ba role và chính sách MVP đã chốt; ma trận dưới đây được đồng bộ với đặc tả 1.1.')
text = text.replace('trong phương án tham khảo; khả năng xem danh mục công khai còn cần chốt', 'trong MVP; danh mục học liệu yêu cầu tài khoản đã xác minh')
text = text.replace('Đề xuất thử nghiệm bằng danh sách tài khoản được quản trị viên xác minh/cấp;', 'MVP dùng danh sách tài khoản được quản trị viên xác minh/cấp;')
text = text.replace('### 4.1. Ma trận quyền tham khảo', '### 4.1. Ma trận quyền MVP')
text = text.replace('Toàn hệ thống theo trách nhiệm', 'Không biên soạn; quản trị và duyệt')
text = text.replace('Có trong luồng tham khảo', 'Có; admin duyệt trước công bố')
text = text.replace('| Gửi tài liệu bổ sung | Có | Có trong phạm vi được giao | Có, chờ duyệt |', '| Gửi tài liệu bổ sung | Không | Qua luồng học liệu giảng viên | Có, chờ duyệt |')
text = text.replace('Luồng tham khảo dùng quản trị viên duyệt trước công bố. Chính sách giảng viên có được tự công bố học liệu trong môn phụ trách hay không còn cần người dùng chốt; chưa coi ma trận này là quyết định cuối cùng.', 'MVP yêu cầu admin duyệt trước công bố. Admin chỉ quản trị, duyệt và bàn giao; không biên soạn giáo trình. Người nhận bàn giao phải được giao tất cả môn liên quan; bản SUBMITTED về DRAFT để gửi lại, giữ nguyên bản đã duyệt và ghi chú. Xem [quy tắc nghiệp vụ](HUCEScholar-quy-tac-nghiep-vu.md).')
text = text.replace('hình thức đăng ký sinh viên còn cần chốt', 'admin cấp/xác minh; chưa tự đăng ký')
text = text.replace('Trong luồng tham khảo, quản trị viên duyệt hoặc yêu cầu chỉnh sửa; nếu chọn chính sách tự công bố, bước này phải được đặc tả lại trước triển khai.', 'Quản trị viên duyệt hoặc yêu cầu chỉnh sửa; giảng viên không tự công bố trong MVP.')
text = text.replace('1. Chốt ma trận quyền quản trị–giảng viên–sinh viên, đặc biệt người được công bố giáo trình, phạm vi quản lý của giảng viên và cách cấp tài khoản sinh viên HUCE.', '1. Dùng chính sách MVP đã chốt và BR16–BR17 để thiết kế ERD, dữ liệu quyền và luồng màn hình.')
text = text.replace('- Giảng viên tự công bố học liệu trong môn được phân công hay cần quản trị viên duyệt?\n', '')
text = text.replace('- Sinh viên đăng ký bằng cách nào, xác minh thuộc trường ra sao; có giới hạn học liệu theo chương trình hoặc môn đăng ký không?\n', '')
brief.write_text(text, encoding='utf-8')
print('Updated shared source, builder and project brief to the agreed MVP baseline')
