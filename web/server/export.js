const path = require('path');
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

// PDF'ler DejaVu Sans ile yazilir: standart Helvetica'da ş, ğ, ı, İ harfleri yoktur.
const FONT_NORMAL = path.join(__dirname, 'fonts', 'DejaVuSans.ttf');
const FONT_KALIN = path.join(__dirname, 'fonts', 'DejaVuSans-Bold.ttf');

function sendPdf(res, filename, title, rows, columns) {
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  const doc = new PDFDocument({ margin: 40, size: 'A4' });
  doc.registerFont('govde', FONT_NORMAL);
  doc.registerFont('kalin', FONT_KALIN);
  doc.pipe(res);

  const sol = doc.page.margins.left;
  const genislik = doc.page.width - sol - doc.page.margins.right;
  const colWidth = genislik / columns.length;
  const altSinir = () => doc.page.height - doc.page.margins.bottom;

  doc.font('kalin').fontSize(16).fillColor('#000').text(title, { align: 'left' });
  doc.moveDown(0.3);
  doc.font('govde').fontSize(9).fillColor('#555').text(`Oluşturma tarihi: ${new Date().toLocaleString('tr-TR')}`);
  doc.moveDown(0.8);

  // Her satirin yuksekligi en uzun hucreye gore hesaplanir; boylece alt satira
  // kayan metin bir sonraki satirin ustune binmez.
  const satirYuksekligi = (degerler, font, boyut) => {
    doc.font(font).fontSize(boyut);
    return Math.max(...degerler.map((d) => doc.heightOfString(d, { width: colWidth - 4 }))) + 6;
  };
  const satirYaz = (degerler, font, boyut, y) => {
    doc.font(font).fontSize(boyut).fillColor('#000');
    degerler.forEach((d, i) => doc.text(d, sol + i * colWidth, y + 3, { width: colWidth - 4 }));
  };
  const basliklar = columns.map((c) => c.baslik);
  const baslikYaz = (y) => {
    const h = satirYuksekligi(basliklar, 'kalin', 9.5);
    doc.save().rect(sol, y, genislik, h).fill('#eef0e6').restore();
    satirYaz(basliklar, 'kalin', 9.5, y);
    return y + h;
  };

  let y = baslikYaz(doc.y);
  rows.forEach((row) => {
    const degerler = columns.map((c) => (row[c.alan] == null ? '' : String(row[c.alan])));
    const h = satirYuksekligi(degerler, 'govde', 9);
    if (y + h > altSinir()) {
      doc.addPage();
      y = baslikYaz(doc.page.margins.top);
    }
    satirYaz(degerler, 'govde', 9, y);
    y += h;
    doc.save().moveTo(sol, y).lineTo(sol + genislik, y).lineWidth(0.5).strokeColor('#dddddd').stroke().restore();
  });
  if (!rows.length) doc.font('govde').fontSize(10).fillColor('#555').text('Kayıt bulunamadı', sol, y + 8);

  doc.end();
}

module.exports = { toCsv, sendCsv, sendPdf };
