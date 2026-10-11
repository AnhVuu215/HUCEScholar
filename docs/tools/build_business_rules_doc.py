from pathlib import Path
import re
from PIL import Image, ImageDraw, ImageFont
from docx.shared import Cm, Pt
from build_hucescholar_docs import new_doc, p, heading, table, OUT, QA

ROOT = Path(__file__).resolve().parents[2]
source = (ROOT / 'docs/HUCEScholar-quy-tac-nghiep-vu.md').read_text(encoding='utf-8')


def diagram():
    im = Image.new('RGB', (1500, 700), 'white')
    d = ImageDraw.Draw(im)
    f = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 29)
    small = ImageFont.truetype('C:/Windows/Fonts/arial.ttf', 24)
    boxes = {'DRAFT': (45, 75, 400, 190), 'SUBMITTED': (570, 75, 925, 190),
             'APPROVED': (1110, 75, 1465, 190), 'CHANGES_REQUIRED': (570, 420, 925, 535),
             'REJECTED': (1110, 420, 1465, 535)}
    for label, box in boxes.items():
        d.rounded_rectangle(box, radius=12, fill='#F3F6F9', outline='#233B53', width=3)
        d.text(((box[0]+box[2])/2, (box[1]+box[3])/2), label, font=f, fill='black', anchor='mm')

    def arrow(points):
        d.line(points, fill='#233B53', width=4)
        x, y = points[-1]; px, py = points[-2]
        if x > px: tip = [(x,y),(x-16,y-9),(x-16,y+9)]
        elif x < px: tip = [(x,y),(x+16,y-9),(x+16,y+9)]
        elif y > py: tip = [(x,y),(x-9,y-16),(x+9,y-16)]
        else: tip = [(x,y),(x-9,y+16),(x+9,y+16)]
        d.polygon(tip, fill='#233B53')

    arrow([(400,130),(570,130)]); d.text((485,80),'Gửi',font=small,fill='black',anchor='mm')
    arrow([(925,130),(1110,130)]); d.text((1018,80),'Duyệt',font=small,fill='black',anchor='mm')
    arrow([(745,190),(745,420)]); d.text((765,300),'Yêu cầu sửa',font=small,fill='black')
    arrow([(925,170),(1040,170),(1040,477),(1110,477)])
    d.text((1060,325),'Từ chối',font=small,fill='black')
    arrow([(570,477),(220,477),(220,190)])
    d.text((240,432),'Chỉnh sửa',font=small,fill='black')
    arrow([(600,75),(600,45),(300,45),(300,75)])
    d.text((450,5),'Rút hoặc bàn giao',font=small,fill='black',anchor='mt')
    d.text((750,620),'APPROVED và REJECTED: tạo DRAFT mới khi cập nhật hoặc gửi lại',font=small,fill='black',anchor='mm')
    file = QA / 'publication_workflow.png'; im.save(file)
    return file


doc = new_doc('Business Rules and Publication Workflow')
doc.styles['Normal'].font.size = Pt(11.5)
p(doc, 'HUCEScholar Business Rules', 'Title')
p(doc, 'Quy tắc nghiệp vụ và luồng công bố MVP', 'Subtitle')
p(doc, 'Phiên bản 1.1  |  Ngày 09/10/2026')
lines = source.splitlines()
i = 0
while i < len(lines):
    line = lines[i].strip()
    if not line or line.startswith('# ') or line.startswith('Ngày 09/'):
        i += 1; continue
    if line.startswith('## '):
        title = re.sub(r'^(\d+)\. ', r'\1 ', line[3:])
        if title.startswith(('2 ', '3 ', '4 ', '5 ')): doc.add_page_break()
        heading(doc, title)
    elif line.startswith('```mermaid'):
        while i < len(lines) and lines[i].strip() != '```': i += 1
        run = p(doc, '').add_run(); run.add_picture(str(diagram()), width=Cm(16.5))
        run._r.xpath('.//wp:docPr')[0].set('descr', 'Luồng bản nháp, gửi duyệt, yêu cầu sửa, từ chối, duyệt và rút hoặc bàn giao')
        p(doc, 'Hình 1 Luồng xét công bố theo phiên bản', 'Caption')
    elif line.startswith('|'):
        rows = []
        while i < len(lines) and lines[i].strip().startswith('|'):
            row = [x.strip() for x in lines[i].strip().strip('|').split('|')]
            if not all(re.fullmatch(r'[-: ]+', x) for x in row): rows.append(row)
            i += 1
        widths = {2: [1.6, 15.2], 3: [3.1, 5.0, 8.7], 4: [5.1, 3.9, 3.9, 3.9]}[len(rows[0])]
        if rows[0][0] == 'Từ': widths = [4.5, 4.2, 8.1]
        table(doc, rows[0], rows[1:], widths)
        continue
    else:
        p(doc, line)
    i += 1
path = OUT / 'HUCEScholar_Business_Rules_and_Publication_Workflow.docx'
doc.save(path)
print(path)
