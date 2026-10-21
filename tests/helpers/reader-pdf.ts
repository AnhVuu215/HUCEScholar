// Original, valid two-page PDF fixture. No third-party book or font assets.
export function readerPdf(
  options: {
    scan?: boolean;
    longText?: boolean;
    outline?: boolean;
    splitText?: boolean;
    rotated?: boolean;
  } = {},
): Buffer {
  const objects = [
    `<< /Type /Catalog /Pages 2 0 R ${options.outline ? '/Outlines 8 0 R' : ''} >>`,
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] ${options.rotated ? '/Rotate 90 ' : ''}/Resources << /Font << /F1 5 0 R ${options.splitText ? '/F2 << /Type /Font /Subtype /Type1 /BaseFont /Courier >>' : ''} >> >> /Contents 7 0 R >>`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...['HUCEScholar reader fixture - page one', 'Second page - study material'].map(
      (text, index) => {
        const printed =
          options.splitText && index === 1
            ? '(Second page - study ma) Tj /F2 18 Tf (terial)'
            : `(${text})`;
        const content = options.scan
          ? ''
          : `BT /F1 18 Tf 48 760 Td ${printed} Tj ET${options.longText && index === 0 ? Array.from({ length: 21 }, (_, line) => `\nBT /F1 6 Tf 48 ${720 - line * 12} Td (${'A'.repeat(line === 20 ? 1 : 100)}) Tj ET`).join('') : ''}`;
        return `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
      },
    ),
  ];
  if (options.outline)
    objects.push(
      '<< /Type /Outlines /First 9 0 R /Last 11 0 R /Count 3 >>',
      '<< /Title (Study chapter) /Parent 8 0 R /Next 10 0 R /Dest [4 0 R /Fit] >>',
      '<< /Title (External bookmark) /Parent 8 0 R /Prev 9 0 R /Next 11 0 R /A << /S /URI /URI (https://example.test/never-open) >> >>',
      '<< /Title (Broken chapter) /Parent 8 0 R /Prev 10 0 R /Dest [99 0 R /Fit] >>',
    );
  let pdf = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
