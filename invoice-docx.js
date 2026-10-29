/* ArmEquipment — invoice as a real Word (.docx) file, same layout as the existing invoices.
   Shared by the website (portal) and the Gmail robot (Code.gs keeps a copy of this block). */
/* ==== DOCX-START ==== */
var DOCX_CT = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>';
var DOCX_RELS = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>';

function docxEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function docxFmt(n) { return String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
function docxPad(n) { return (n < 10 ? '0' : '') + n; }

/* date as written on the existing invoices: "01 22 2025", "12 8-12 2025" */
function docxDate(v) {
  if (!v.start_date) return '';
  var a = String(v.start_date).slice(0, 10).split('-'), b = String(v.end_date || v.start_date).slice(0, 10).split('-');
  if (a.join() === b.join()) return a[1] + ' ' + a[2] + ' ' + a[0];
  if (a[0] === b[0] && a[1] === b[1]) return a[1] + ' ' + a[2] + '-' + b[2] + ' ' + a[0];
  return a[1] + ' ' + a[2] + ' ' + a[0] + ' - ' + b[1] + ' ' + b[2] + ' ' + b[0];
}

function docxRun(text, o) {
  o = o || {};
  var pr = '<w:rFonts w:ascii="Sylfaen" w:hAnsi="Sylfaen" w:cs="Sylfaen"/>' + (o.b ? '<w:b/>' : '') + (o.i ? '<w:i/>' : '') +
           '<w:sz w:val="' + (o.sz || 24) + '"/><w:szCs w:val="' + (o.sz || 24) + '"/>';
  return String(text).split('\n').map(function (t, k) {
    return (k ? '<w:r><w:rPr>' + pr + '</w:rPr><w:br/></w:r>' : '') + '<w:r><w:rPr>' + pr + '</w:rPr><w:t xml:space="preserve">' + docxEsc(t) + '</w:t></w:r>';
  }).join('');
}
function docxPara(text, o) {
  o = o || {};
  return '<w:p><w:pPr><w:spacing w:before="' + (o.before || 0) + '" w:after="' + (o.after == null ? 120 : o.after) + '"/>' +
         (o.jc ? '<w:jc w:val="' + o.jc + '"/>' : '') + '</w:pPr>' + docxRun(text, o) + '</w:p>';
}
function docxCell(text, w, o) {
  o = o || {};
  return '<w:tc><w:tcPr><w:tcW w:w="' + w + '" w:type="dxa"/>' + (o.span ? '<w:gridSpan w:val="' + o.span + '"/>' : '') +
         (o.noBorder ? '<w:tcBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>' : '') +
         '<w:vAlign w:val="center"/></w:tcPr>' + docxPara(text, { jc: o.jc, b: o.b, i: o.i, after: 60, before: 60 }) + '</w:tc>';
}
function docxTable(widths, rowsXml) {
  var tw = widths.reduce(function (a, b) { return a + b; }, 0);
  return '<w:tbl><w:tblPr><w:tblW w:w="' + tw + '" w:type="dxa"/><w:tblBorders>' +
    ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'].map(function (s) { return '<w:' + s + ' w:val="single" w:sz="4" w:space="0" w:color="000000"/>'; }).join('') +
    '</w:tblBorders><w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="100" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>' +
    widths.map(function (w) { return '<w:gridCol w:w="' + w + '"/>'; }).join('') + '</w:tblGrid>' + rowsXml + '</w:tbl>';
}

/* v = invoice row {num, start_date, end_date, lines:[{name,price,qty}]}, tp = invoice template {client, signer} */
function docxDocumentXml(v, tp) {
  tp = tp || {};
  var W = [3300, 1400, 1000, 1900, 1750], total = 0, dt = docxDate(v);
  var rows = '<w:tr>' + ['Անուն', 'Գին', 'Հատ', 'Ամսաթիվ', 'Ընդ.'].map(function (h, k) { return docxCell(h, W[k], { jc: 'center', i: true }); }).join('') + '</w:tr>';
  (v.lines || []).forEach(function (l) {
    var s = (+l.price || 0) * (+l.qty || 0); total += s;
    rows += '<w:tr>' + docxCell(String(l.name || '').replace(/ \/ /g, '\n'), W[0]) + docxCell(docxFmt(l.price), W[1], { jc: 'center' }) +
            docxCell(String(l.qty), W[2], { jc: 'center' }) + docxCell(dt, W[3], { jc: 'center' }) + docxCell(docxFmt(s), W[4], { jc: 'center' }) + '</w:tr>';
  });
  rows += '<w:tr>' + docxCell('Ընդ.    ' + docxFmt(total) + ' դր.', W[0] + W[1] + W[2], { span: 3, jc: 'center', b: true }) +
          docxCell('', W[3] + W[4], { span: 2, noBorder: true }) + '</w:tr>';
  var body = docxPara('Հաշիվ  # ' + v.num, { jc: 'center', sz: 40, after: 240 });
  if (tp.client) body += docxTable([9350], '<w:tr>' + docxCell(tp.client, 9350) + '</w:tr>') + docxPara('', { after: 200 });
  body += docxTable(W, rows);
  body += docxPara('', { after: 600 }) + docxPara('___________________________', { after: 60 }) + docxPara(tp.signer || '', {});
  return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>' +
    body + '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>';
}

/* "Invoice 007 - 12.08-12.2025.docx" — month.day like the existing files */
function docxFileName(v) {
  var s = String(v.start_date || ((v.month || '') + '-01')).slice(0, 10).split('-'), e = String(v.end_date || v.start_date || '').slice(0, 10).split('-');
  var d = s[1] + '.' + s[2];
  if (e.length === 3 && e.join('-') !== s.join('-')) d += (e[0] === s[0] && e[1] === s[1]) ? '-' + e[2] : '-' + e[1] + '.' + e[2];
  return 'Invoice ' + String(v.num).replace(/[\\\/:*?"<>|]/g, '-') + ' - ' + d + '.' + (e.length === 3 ? e : s)[0] + '.docx';
}
/* ==== DOCX-END ==== */
