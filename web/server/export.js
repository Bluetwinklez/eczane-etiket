const PDFDocument = require('pdfkit');

function toCsv(rows, columns) {
  const header = columns.map((c) => c.baslik).join(';');
  const lines = rows.map((row) =>
    columns
      .map((c) => {
        const value = row[c.alan];
        const text = value == null ? '' : String(value).replace(/;/g, ',');
        return text.includes('\n') ? `"${text.replace(/"/g, '""')}"` : text;
      })
      .join(';')
  );
  return [header, ...lines].join('\n');
}

function sendCsv(res, filename, rows, columns) {
  const csv = toCsv(rows, columns);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send('﻿' + csv);
}

function sendPdf(res, filename, title, rows, columns) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.pipe(res);

  doc.fontSize(16).text(title, { align: 'left' });
  doc.moveDown(0.5);
  doc.fontSize(9).fillColor('#555').text(`Olusturma tarihi: ${new Date().toLocaleString('tr-TR')}`);
  doc.moveDown(1);
  doc.fillColor('#000');

  const colWidth = (doc.page.width - doc.page.margins.left - doc.page.margins.right) / columns.length;

  doc.fontSize(10).font('Helvetica-Bold');
  columns.forEach((c, i) => {
    doc.text(c.baslik, doc.page.margins.left + i * colWidth, doc.y, { width: colWidth, continued: false });
  });
  doc.moveDown(0.5);
  doc.font('Helvetica');

  let y = doc.y;
  rows.forEach((row) => {
    if (y > doc.page.height - doc.page.margins.bottom - 20) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    columns.forEach((c, i) => {
      const value = row[c.alan];
      const text = value == null ? '' : String(value);
      doc.fontSize(9).text(text, doc.page.margins.left + i * colWidth, y, { width: colWidth });
    });
    y += 16;
  });

  doc.end();
}

module.exports = { toCsv, sendCsv, sendPdf };
