"""Generate synthetic OOXML fixtures; no real documents or credentials."""
from pathlib import Path
from zipfile import ZipFile, ZipInfo, ZIP_DEFLATED
import struct
import zlib

ROOT = Path(__file__).resolve().parents[1] / 'apps/api/test/fixtures/docx'
ROOT.mkdir(parents=True, exist_ok=True)
content_types = '''<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>'''
relationships = '''<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'''
document = '''<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math"><w:body><w:p><w:r><w:t>HUCEScholar DOCX fixture — Tiếng Việt: sức bền vật liệu</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Môn học</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Cơ học kết cấu</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><m:oMath><m:r><m:t>x + y = 2</m:t></m:r></m:oMath></w:p><w:p><w:r><w:br w:type="page"/></w:r></w:p><w:p><w:r><w:t>Trang hai — ghi chú theo phiên bản.</w:t></w:r></w:p><w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>'''
# A tiny synthetic embedded PNG, generated without real content or image dependencies.
def png_chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
png = b'\x89PNG\r\n\x1a\n' + png_chunk(b'IHDR', struct.pack('>IIBBBBB', 64, 32, 8, 2, 0, 0, 0)) + png_chunk(b'IDAT', zlib.compress((b'\0' + bytes([0, 86, 166]) * 64) * 32)) + png_chunk(b'IEND', b'')
picture = '<w:p xmlns:v="urn:schemas-microsoft-com:vml" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:r><w:pict><v:rect id="SyntheticImage" style="width:96pt;height:48pt"><v:imagedata r:id="rIdImage"/></v:rect></w:pict></w:r></w:p>'
document = document.replace('<w:sectPr>', picture + '<w:sectPr>')
image_rels = '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/fixture.png"/></Relationships>'
base = {'[Content_Types].xml': content_types, '_rels/.rels': relationships, 'word/document.xml': document, 'word/_rels/document.xml.rels': image_rels, 'word/media/fixture.png': png}

def save(name, entries):
    with ZipFile(ROOT / name, 'w', ZIP_DEFLATED) as archive:
        for path, data in entries.items():
            archive.writestr(path, data)

save('vietnamese.docx', base)
save('ordinary-zip.docx', {'hello.txt': 'not Word'})
save('macro.docx', {**base, 'word/vbaProject.bin': b'not a macro, rejected fixture'})
save('traversal.docx', {**base, '../escape': 'invalid'})
save('entity.docx', {**base, 'word/document.xml': '<!DOCTYPE x [<!ENTITY a SYSTEM "file:///etc/passwd">]><x>&a;</x>'})
save('external-image.docx', {**base, 'word/_rels/document.xml.rels': '<Relationships><Relationship Type="image" TargetMode="External" Target="http://169.254.169.254/"/></Relationships>'})
save('hyperlink.docx', {**base, 'word/_rels/document.xml.rels': '<Relationships><Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" TargetMode="External" Target="https://example.test/"/></Relationships>'})
save('oversized.docx', {**base, 'word/media/big.bin': b'0' * (101 * 1024 * 1024)})
save('lying-size.docx', {**base, 'word/media/lying.bin': b'0' * (101 * 1024 * 1024)})
lying = bytearray((ROOT / 'lying-size.docx').read_bytes())
for signature, name_offset, crc_offset, size_offset in [(b'PK\x03\x04', 30, 14, 22), (b'PK\x01\x02', 46, 16, 24)]:
    start = 0
    while (start := lying.find(signature, start)) >= 0:
        if lying[start + name_offset:start + name_offset + 20] == b'word/media/lying.bin':
            struct.pack_into('<I', lying, start + crc_offset, zlib.crc32(b'0'))
            struct.pack_into('<I', lying, start + size_offset, 1)
        start += 4
(ROOT / 'lying-size.docx').write_bytes(lying)
encrypted = bytearray((ROOT / 'vietnamese.docx').read_bytes())
for signature, offset in [(b'PK\x03\x04', 6), (b'PK\x01\x02', 8)]:
    start = 0
    while (start := encrypted.find(signature, start)) >= 0:
        encrypted[start + offset] |= 1
        start += 4
(ROOT / 'encrypted.docx').write_bytes(encrypted)
with ZipFile(ROOT / 'symlink.docx', 'w', ZIP_DEFLATED) as archive:
    for path, data in base.items():
        archive.writestr(path, data)
    link = ZipInfo('word/link')
    link.create_system = 3
    link.external_attr = 0o120777 << 16
    archive.writestr(link, '/etc/passwd')
# The renderer should reject a regular zip and every unsafe fixture before running soffice.
print('Generated synthetic DOCX fixtures')
