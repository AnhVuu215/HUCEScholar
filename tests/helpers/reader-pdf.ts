// Original, valid two-page PDF fixture. No third-party book or font assets.
export function readerPdf(options: { scan?: boolean; longText?: boolean } = {}): Buffer {
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...['HUCEScholar reader fixture - page one', 'Second page - study material'].map(
      (text, index) => {
        const content = options.scan
          ? ''
          : `BT /F1 18 Tf 48 760 Td (${text}) Tj ET${options.longText && index === 0 ? Array.from({ length: 21 }, (_, line) => `\nBT /F1 6 Tf 48 ${720 - line * 12} Td (${'A'.repeat(line === 20 ? 1 : 100)}) Tj ET`).join('') : ''}`;
        return `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`;
      },
    ),
  ];
  let pdf = '%PDF-1.7\n';
  const offsets = [0];
  objects.forEach((object, i) => {
    offsets.push(Buffer.byteLength(pdf));
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(pdf);
  pdf += `xref\n0 8\n0000000000 65535 f \n${offsets
    .slice(1)
    .map((n) => `${String(n).padStart(10, '0')} 00000 n \n`)
    .join('')}trailer\n<< /Size 8 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
