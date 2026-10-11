"""Create an offline single-file design prototype and a portable review package."""
from pathlib import Path
import hashlib
import json
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'design/wireframe'
QA = ROOT / 'design/_qa'
OUT = ROOT / 'docs/deliverables'


def main():
    validation = json.loads((QA / 'verification.json').read_text(encoding='utf-8'))
    assert validation['status'] == 'passed' and len(validation['checks']) == 26
    html = (SOURCE / 'index.html').read_text(encoding='utf-8')
    css = (SOURCE / 'styles.css').read_text(encoding='utf-8')
    js = (SOURCE / 'app.js').read_text(encoding='utf-8')
    assert '</script' not in js.lower()
    html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>')
    html = html.replace('<script src="app.js"></script>', '<script>\n' + js + '\n</script>')
    assert 'src="app.js"' not in html and 'href="styles.css"' not in html
    target = OUT / 'HUCEScholar_Wireframe_Prototype.html'
    target.write_text(html, encoding='utf-8')
    preview = OUT / 'HUCEScholar_Wireframe_Preview.png'
    shutil.copyfile(QA / 'desktop-catalog.png', preview)
    files = [(target, target.name), (SOURCE / 'README.md', 'README.md'),
             (SOURCE / 'DESIGN_BRIEF.md', 'DESIGN_BRIEF.md'),
             (QA / 'verification.json', 'validation/verification.json')]
    files += [(SOURCE / name, 'source/' + name) for name in ['index.html', 'styles.css', 'app.js']]
    images = ['desktop-catalog', 'desktop-reader', 'desktop-lecturer', 'desktop-editor',
              'desktop-admin-queue', 'desktop-admin-review', 'mobile-catalog', 'mobile-reader']
    files += [(QA / (name + '.png'), 'screens/' + name + '.png') for name in images]
    for path, name in [(ROOT / 'DESIGN.md', 'design-system/DESIGN.md'),
                       (ROOT / '.impeccable/design.json', 'design-system/tokens.json'),
                       (QA / 'standalone-verification.json', 'validation/standalone-verification.json')]:
        if path.is_file():
            files.append((path, name))
    for name in ['reference-revision-verification.json']:
        if (QA / name).is_file():
            files.append((QA / name, 'validation/' + name))
    for name in ['desktop-catalog-1253.png', 'mobile-login.png', 'desktop-books.png']:
        if (QA / name).is_file():
            files.append((QA / name, 'screens/' + name))
    archive = OUT / 'HUCEScholar_Wireframe_Design_Package.zip'
    checksums = {name: hashlib.sha256(path.read_bytes()).hexdigest() for path, name in files}
    with zipfile.ZipFile(archive, 'w', compression=zipfile.ZIP_DEFLATED) as z:
        for path, name in files:
            z.write(path, name)
        z.writestr('SHA256SUMS.txt', '\n'.join(f'{digest}  {name}' for name, digest in checksums.items()) + '\n')
    with zipfile.ZipFile(archive) as z:
        assert z.testzip() is None
        assert len(z.namelist()) == len(files) + 1
        for name, digest in checksums.items():
            assert hashlib.sha256(z.read(name)).hexdigest() == digest
    print(json.dumps({'prototype': str(target), 'package': str(archive), 'entries': len(files) + 1,
                      'prototype_bytes': target.stat().st_size, 'package_bytes': archive.stat().st_size}, ensure_ascii=False))


if __name__ == '__main__':
    main()
