"""Bounded OOXML validation before LibreOffice; never extract archive paths."""
import re
import stat
import sys
import zipfile
import struct
import zlib
from pathlib import PurePosixPath
from xml.etree import ElementTree as ET

MAX_ENTRIES = 2000
MAX_TOTAL = 100 * 1024 * 1024
MAX_XML = 8 * 1024 * 1024
MAIN = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml'

def inflated_chunks(archive, entry):
    # ZipExtFile truncates output to the advertised size. Do not use it to measure
    # actual expansion: a forged size/CRC can hide trailing decompressed bytes.
    with archive.open(entry):
        pass  # Keep stdlib local-name, overlap, flag and header validation.
    if entry.compress_type not in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED):
        raise ValueError()
    with open(archive.filename, 'rb') as raw:
        raw.seek(entry.header_offset)
        header = raw.read(30)
        if len(header) != 30 or header[:4] != b'PK\x03\x04' or struct.unpack_from('<H', header, 8)[0] != entry.compress_type:
            raise ValueError()
        name_length, extra_length = struct.unpack_from('<HH', header, 26)
        raw.seek(name_length + extra_length, 1)
        remaining = entry.compress_size
        decoder = zlib.decompressobj(-15) if entry.compress_type == zipfile.ZIP_DEFLATED else None
        size = 0
        crc = 0
        while remaining:
            compressed = raw.read(min(65536, remaining))
            if not compressed:
                raise ValueError()
            remaining -= len(compressed)
            pending = compressed
            while pending:
                data = decoder.decompress(pending, 65536) if decoder else pending
                pending = decoder.unconsumed_tail if decoder else b''
                if decoder and decoder.unused_data:
                    raise ValueError()
                size += len(data)
                if size > entry.file_size or size > MAX_TOTAL:
                    raise ValueError()
                crc = zlib.crc32(data, crc)
                if data:
                    yield data
        if (decoder and not decoder.eof) or size != entry.file_size or crc != entry.CRC:
            raise ValueError()

def validate(path):
    seen = set()
    parts = {}
    total = 0
    with zipfile.ZipFile(path) as archive:
        entries = archive.infolist()
        if len(entries) > MAX_ENTRIES or sum(e.file_size for e in entries) > MAX_TOTAL:
            raise ValueError()
        for entry in entries:
            name = entry.filename
            mode = entry.external_attr >> 16
            if (name in seen or '\\' in name or '\x00' in name or ':' in name
                or name.startswith('/') or '..' in PurePosixPath(name).parts
                or entry.flag_bits & 1 or stat.S_ISLNK(mode)
                or re.search(r'(?i)(vba|activex|/embeddings/)', name)):
                raise ValueError()
            seen.add(name)
            if entry.is_dir():
                continue
            xml = name.lower().endswith(('.xml', '.rels'))
            chunks = []
            count = 0
            for chunk in inflated_chunks(archive, entry):
                count += len(chunk)
                total += len(chunk)
                if total > MAX_TOTAL or (xml and count > MAX_XML):
                    raise ValueError()
                if xml:
                    chunks.append(chunk)
            if xml:
                data = b''.join(chunks)
                text = data.decode('utf-16') if data.startswith((b'\xff\xfe', b'\xfe\xff')) else data.decode('utf-8-sig')
                if re.search(r'<!\s*(DOCTYPE|ENTITY)', text, re.I):
                    raise ValueError()
                root = ET.fromstring(text)
                parts[name] = root
                for element in root.iter():
                    content_type = element.attrib.get('ContentType', '').lower()
                    if any(word in content_type for word in ('macro', 'vba', 'oleobject', 'activex')):
                        raise ValueError()
                    if element.attrib.get('TargetMode', '').lower() == 'external':
                        if not (element.attrib.get('Type', '').endswith('/hyperlink')
                                and re.match(r'^(https?://|mailto:)', element.attrib.get('Target', ''), re.I)):
                            raise ValueError()
        if not {'[Content_Types].xml', '_rels/.rels', 'word/document.xml'}.issubset(parts):
            raise ValueError()
        if not any(e.attrib.get('PartName') == '/word/document.xml' and e.attrib.get('ContentType') == MAIN
                   for e in parts['[Content_Types].xml']):
            raise ValueError()
        if parts['word/document.xml'].tag != '{http://schemas.openxmlformats.org/wordprocessingml/2006/main}document':
            raise ValueError()
        if not any(e.attrib.get('Target') == 'word/document.xml' and e.attrib.get('Type', '').endswith('/officeDocument')
                   for e in parts['_rels/.rels']):
            raise ValueError()

if __name__ == '__main__':
    try:
        validate(sys.argv[1])
    except Exception:
        sys.stderr.write('INVALID_DOCX\n')
        sys.exit(1)
