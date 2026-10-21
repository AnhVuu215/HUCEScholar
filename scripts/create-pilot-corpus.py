"""Generate the QA-01 local pilot corpus into .local/pilot-corpus.

Every file is self-authored and synthetic: no HUCE material, third-party book or font file
is copied. Vietnamese PDFs are produced by LibreOffice inside the existing converter image so
fonts come from that image and nothing is downloaded. Requires Docker and the
hucescholar-docx-converter:local image (built by the compose `files` profile).
"""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from xml.sax.saxutils import escape
import json
import os
import random
import subprocess
import sys
import zlib

ROOT = Path(__file__).resolve().parents[1] / '.local/pilot-corpus'
ROOT.mkdir(parents=True, exist_ok=True)
IMAGE = 'hucescholar-docx-converter:local'
LIMIT = 25 * 1024 * 1024


def build_pdf(objects, root=1):
    """objects: list of bytes or (dict_text, stream_bytes); numbered from 1."""
    out = bytearray(b'%PDF-1.7\n%\xe2\xe3\xcf\xd3\n')
    offsets = []
    for number, item in enumerate(objects, start=1):
        offsets.append(len(out))
        out += f'{number} 0 obj\n'.encode()
        if isinstance(item, tuple):
            head, data = item
            out += f'<< {head} /Length {len(data)} >>\nstream\n'.encode() + data + b'\nendstream'
        else:
            out += item.encode() if isinstance(item, str) else item
        out += b'\nendobj\n'
    xref = len(out)
    out += f'xref\n0 {len(objects) + 1}\n0000000000 65535 f \n'.encode()
    out += b''.join(f'{offset:010d} 00000 n \n'.encode() for offset in offsets)
    out += f'trailer\n<< /Size {len(objects) + 1} /Root {root} 0 R >>\nstartxref\n{xref}\n%%EOF\n'.encode()
    return bytes(out)


def text_pages(pages, outline=None):
    """pages: list of (media_box, rotate, lines). Helvetica, ASCII only."""
    count = len(pages)
    # 1 catalog, 2 pages, 3 font, then (page, content) pairs, then outline objects.
    first = 4
    kids = ' '.join(f'{first + 2 * i} 0 R' for i in range(count))
    outline_root = first + 2 * count
    catalog = '<< /Type /Catalog /Pages 2 0 R'
    if outline:
        catalog += f' /Outlines {outline_root} 0 R /PageMode /UseOutlines'
    objects = [
        catalog + ' >>',
        f'<< /Type /Pages /Kids [{kids}] /Count {count} >>',
        '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
    ]
    for index, (box, rotate, lines) in enumerate(pages):
        objects.append(
            f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {box[0]} {box[1]}] /Rotate {rotate}'
            f' /Resources << /Font << /F1 3 0 R >> >> /Contents {first + 2 * index + 1} 0 R >>'
        )
        y = box[1] - 72
        body = []
        for size, line in lines:
            body.append(f'BT /F1 {size} Tf 56 {y} Td ({line}) Tj ET')
            y -= size + 6
        objects.append(('', '\n'.join(body).encode('latin-1')))
    if outline:
        items = len(outline)
        objects.append(
            f'<< /Type /Outlines /First {outline_root + 1} 0 R /Last {outline_root + items} 0 R /Count {items} >>'
        )
        for i, (title, page) in enumerate(outline):
            links = f' /Prev {outline_root + i} 0 R' if i else ''
            links += f' /Next {outline_root + i + 2} 0 R' if i < items - 1 else ''
            objects.append(
                f'<< /Title ({title}) /Parent {outline_root} 0 R{links}'
                f' /Dest [{first + 2 * (page - 1)} 0 R /Fit] >>'
            )
    return build_pdf(objects)


def image_pages(images):
    """images: list of (width, height, gray_bytes, filter_name or None). One image per A4 page."""
    count = len(images)
    kids = ' '.join(f'{3 + 3 * i} 0 R' for i in range(count))
    objects = ['<< /Type /Catalog /Pages 2 0 R >>', f'<< /Type /Pages /Kids [{kids}] /Count {count} >>']
    for index, (width, height, data, filter_name) in enumerate(images):
        page, content, image = 3 + 3 * index, 4 + 3 * index, 5 + 3 * index
        objects.append(
            f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842]'
            f' /Resources << /XObject << /Im0 {image} 0 R >> >> /Contents {content} 0 R >>'
        )
        objects.append(('', b'q 595 0 0 842 0 0 cm /Im0 Do Q'))
        head = f'/Type /XObject /Subtype /Image /Width {width} /Height {height} /ColorSpace /DeviceGray /BitsPerComponent 8'
        if filter_name:
            head += f' /Filter /{filter_name}'
        objects.append((head, data))
    return build_pdf(objects)


def scanned_page(seed, width=1240, height=1754):
    """A grey page with dark bars standing in for printed lines; there is no text layer."""
    rng = random.Random(seed)
    rows = bytearray()
    for y in range(height):
        line = (y // 34) % 2 == 0 and 160 < y < height - 160
        bar_end = rng.randrange(700, 1080) if line else 0
        row = bytearray(rng.randrange(228, 246) for _ in range(width))
        if line:
            for x in range(120, bar_end):
                row[x] = rng.randrange(30, 70)
        rows += row
    return (width, height, zlib.compress(bytes(rows), 9), 'FlateDecode')


def noise_pdf(width, height):
    return image_pages([(width, height, os.urandom(width * height), None)])


VI_CHAPTERS = [
    (
        'Chương 1. Sức bền vật liệu',
        [
            'Sức bền vật liệu nghiên cứu khả năng chịu lực của các cấu kiện khi chịu kéo, nén, uốn và xoắn.',
            'Ứng suất pháp được tính bằng lực dọc chia cho diện tích mặt cắt ngang của thanh.',
            'Biến dạng đàn hồi tuân theo định luật Hooke trong giới hạn tỉ lệ của vật liệu.',
        ],
    ),
    (
        'Chương 2. Cơ học kết cấu',
        [
            'Cơ học kết cấu xác định nội lực và chuyển vị trong hệ dầm, khung và dàn.',
            'Phương pháp lực và phương pháp chuyển vị là hai cách tiếp cận cơ bản cho hệ siêu tĩnh.',
            'Đường ảnh hưởng giúp tìm vị trí bất lợi nhất của tải trọng di động trên cầu.',
        ],
    ),
    (
        'Chương 3. Bê tông cốt thép',
        [
            'Bê tông chịu nén tốt nhưng chịu kéo kém, vì vậy cốt thép được bố trí ở vùng chịu kéo.',
            'Lớp bê tông bảo vệ giữ cho cốt thép không bị ăn mòn trong môi trường ẩm ướt.',
            'Tiết diện chữ nhật đặt cốt đơn được kiểm tra theo trạng thái giới hạn thứ nhất.',
        ],
    ),
]


def vietnamese_docx(path):
    ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"'
    def paragraph(text, heading=False, page_break=False):
        props = '<w:pPr><w:outlineLvl w:val="0"/></w:pPr>' if heading else ''
        size = '<w:rPr><w:b/><w:sz w:val="32"/></w:rPr>' if heading else '<w:rPr><w:sz w:val="24"/></w:rPr>'
        brk = '<w:r><w:br w:type="page"/></w:r>' if page_break else ''
        return f'<w:p>{props}{brk}<w:r>{size}<w:t xml:space="preserve">{escape(text)}</w:t></w:r></w:p>'
    body = [paragraph('HUCEScholar pilot — Bài giảng minh họa tự soạn')]
    for index, (title, lines) in enumerate(VI_CHAPTERS):
        body.append(paragraph(title, heading=True, page_break=index > 0))
        for repeat in range(6):
            for line in lines:
                body.append(paragraph(f'{line} (đoạn {repeat + 1})'))
    body.append(
        '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>Đại lượng</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Ký hiệu</w:t></w:r></w:p></w:tc></w:tr>'
        '<w:tr><w:tc><w:p><w:r><w:t>Ứng suất</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>σ = N / A</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'
    )
    document = (
        f'<?xml version="1.0" encoding="UTF-8"?><w:document {ns}><w:body>{"".join(body)}'
        '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr>'
        '</w:body></w:document>'
    )
    with ZipFile(path, 'w', ZIP_DEFLATED) as archive:
        archive.writestr(
            '[Content_Types].xml',
            '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
        )
        archive.writestr(
            '_rels/.rels',
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
        )
        archive.writestr('word/document.xml', document)


def libreoffice(source, target, export='pdf'):
    """Convert inside the converter image with no network, in /tmp, then copy the PDF out."""
    script = (
        f'soffice --headless --norestore --convert-to \'{export}\' --outdir /tmp/out "/work/{source.name}"'
        f' >/dev/null 2>&1 && cp "/tmp/out/{source.stem}.pdf" "/work/{target}"'
    )
    subprocess.run(
        ['docker', 'run', '--rm', '--network', 'none', '-e', 'HOME=/tmp', '-v', f'{ROOT}:/work', IMAGE, 'sh', '-c', script],
        check=True,
    )


def main():
    rng = random.Random(21)
    a4, a3_landscape = (595, 842), (1191, 842)
    rotated = [
        (a4, 0, [(20, 'Pilot rotated page 1 - rotate 0'), (14, 'PILOTROT1 upright portrait page')]),
        (a4, 90, [(20, 'Pilot rotated page 2 - rotate 90'), (14, 'PILOTROT2 page stored with Rotate 90')]),
        (a4, 180, [(20, 'Pilot rotated page 3 - rotate 180'), (14, 'PILOTROT3 page stored upside down')]),
        (a4, 270, [(20, 'Pilot rotated page 4 - rotate 270'), (14, 'PILOTROT4 page stored with Rotate 270')]),
        (a3_landscape, 0, [(20, 'Pilot rotated page 5 - A3 landscape'), (14, 'PILOTROT5 wide drawing sheet')]),
    ]
    files = {}
    files['rotated-mixed.pdf'] = text_pages(rotated)

    long_pages = []
    for number in range(1, 401):
        chapter = (number - 1) // 20 + 1
        lines = [(18, f'Chapter {chapter} - page {number}')]
        lines += [(10, f'Line {line:02d} of page {number}: structural analysis study text for the pilot.') for line in range(1, 41)]
        if number == 397:
            lines.append((12, 'PILOTNEEDLE appears only on page 397'))
        long_pages.append((a4, 0, lines))
    files['long-400-pages.pdf'] = text_pages(long_pages, [(f'Chapter {c}', (c - 1) * 20 + 1) for c in range(1, 21)])

    files['scan-only.pdf'] = image_pages([scanned_page(seed) for seed in range(3)])
    files['near-limit.pdf'] = noise_pdf(4000, 6000)
    files['over-limit.pdf'] = noise_pdf(5000, 5400)
    files['garbage.pdf'] = b'%PDF-1.7\n' + bytes(rng.randrange(256) for _ in range(64 * 1024))
    whole = files['rotated-mixed.pdf']
    files['truncated.pdf'] = whole[: int(len(whole) * 0.45)]
    for name, data in files.items():
        (ROOT / name).write_bytes(data)

    docx = ROOT / 'bai-giang-tieng-viet.docx'
    vietnamese_docx(docx)
    libreoffice(docx, 'vietnamese-text.pdf')
    options = json.dumps(
        {'EncryptFile': {'type': 'boolean', 'value': 'true'}, 'DocumentOpenPassword': {'type': 'string', 'value': 'pilot'}},
        separators=(',', ':'),
    )
    libreoffice(docx, 'encrypted.pdf', f'pdf:writer_pdf_Export:{options}')
    # Opens without a password but restricts copy/print, as many shared lecture PDFs do.
    options = json.dumps(
        {'RestrictPermissions': {'type': 'boolean', 'value': 'true'}, 'PermissionPassword': {'type': 'string', 'value': 'pilot'},
         'EnableCopyingOfContent': {'type': 'boolean', 'value': 'false'}},
        separators=(',', ':'),
    )
    libreoffice(docx, 'permissions-only.pdf', f'pdf:writer_pdf_Export:{options}')

    for path in sorted(ROOT.iterdir()):
        print(f'{path.name}\t{path.stat().st_size}\t{"over" if path.stat().st_size > LIMIT else "ok"}')


if __name__ == '__main__':
    sys.exit(main())
