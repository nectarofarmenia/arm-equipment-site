/* ArmEquipment — invoice as an Excel (.xlsx) file in the site's navy and gold style.
   Price × quantity and the total are live Excel formulas; the item name has a drop-down from the price list
   (sheet «Գնացուցակ»), and spare rows let you add items. Hidden column H carries the invoice id data so the
   robot can read a corrected file back.
   Shared by the website and the Gmail robot (Code.gs keeps a copy of this block). */
/* ==== XLSX-START ==== */
var XLSX_FIRST = 10;              // first item row
var XLSX_SHEET2 = 'Գնացուցակ';

function xEsc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ''); }
function xPad(n) { return (n < 10 ? '0' : '') + n; }
function xDmy(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
function xDates(v) { return xDmy(v.start_date) + (v.end_date && String(v.end_date).slice(0, 10) !== String(v.start_date).slice(0, 10) ? ' – ' + xDmy(v.end_date) : ''); }
var X_MONTHS = ['Հունվար','Փետրվար','Մարտ','Ապրիլ','Մայիս','Հունիս','Հուլիս','Օգոստոս','Սեպտեմբեր','Հոկտեմբեր','Նոյեմբեր','Դեկտեմբեր'];
var X_MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/* cells */
function xStr(ref, text, s) { return '<c r="' + ref + '" t="inlineStr"' + (s ? ' s="' + s + '"' : '') + '><is><t xml:space="preserve">' + xEsc(text) + '</t></is></c>'; }
function xNum(ref, n, s) { return '<c r="' + ref + '"' + (s ? ' s="' + s + '"' : '') + '><v>' + (+n || 0) + '</v></c>'; }
function xBlank(ref, s) { return '<c r="' + ref + '"' + (s ? ' s="' + s + '"' : '') + '/>'; }
function xFormula(ref, f, cached, s) {
  var isNum = typeof cached === 'number';
  return '<c r="' + ref + '"' + (s ? ' s="' + s + '"' : '') + (isNum ? '' : ' t="str"') + '><f>' + xEsc(f) + '</f><v>' + (isNum ? cached : xEsc(cached || '')) + '</v></c>';
}
function xRow(r, cells, ht) { return '<row r="' + r + '"' + (ht ? ' ht="' + ht + '" customHeight="1"' : '') + '>' + cells.join('') + '</row>'; }

/* styles: index → meaning (see cellXfs below) */
var XS = { brand: 1, contact: 2, gold: 3, title: 4, label: 5, value: 6, th: 7, td: 8, tdNum: 9, tdQty: 10, totLabel: 11, totVal: 12, sign: 13, note: 14, box: 15, tdNo: 16, valueB: 17, labelL: 18 };
var XLSX_STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
  '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>' +
  '<fonts count="11">' +
    '<font><sz val="11"/><color rgb="FF14284B"/><name val="Arial"/></font>' +                    // 0 base
    '<font><b/><sz val="22"/><color rgb="FF14284B"/><name val="Arial"/></font>' +                // 1 brand
    '<font><sz val="9"/><color rgb="FF5B6475"/><name val="Arial"/></font>' +                     // 2 contact
    '<font><b/><sz val="18"/><color rgb="FF14284B"/><name val="Arial"/></font>' +                // 3 title
    '<font><sz val="9"/><color rgb="FF7A8599"/><name val="Arial"/></font>' +                     // 4 label
    '<font><sz val="11"/><color rgb="FF14284B"/><name val="Arial"/></font>' +                    // 5 value
    '<font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Arial"/></font>' +                // 6 th
    '<font><b/><sz val="12"/><color rgb="FF14284B"/><name val="Arial"/></font>' +                // 7 total label
    '<font><b/><sz val="14"/><color rgb="FF14284B"/><name val="Arial"/></font>' +                // 8 total value
    '<font><i/><sz val="9"/><color rgb="FF7A8599"/><name val="Arial"/></font>' +                 // 9 note
    '<font><b/><sz val="11"/><color rgb="FF14284B"/><name val="Arial"/></font>' +                // 10 value bold
  '</fonts>' +
  '<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>' +
    '<fill><patternFill patternType="solid"><fgColor rgb="FF14284B"/><bgColor indexed="64"/></patternFill></fill>' +   // 2 navy
    '<fill><patternFill patternType="solid"><fgColor rgb="FFC9A24A"/><bgColor indexed="64"/></patternFill></fill>' +   // 3 gold
    '<fill><patternFill patternType="solid"><fgColor rgb="FFF6F2E7"/><bgColor indexed="64"/></patternFill></fill>' +   // 4 cream
  '</fills>' +
  '<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>' +
    '<border><left style="thin"><color rgb="FFDCD5C3"/></left><right style="thin"><color rgb="FFDCD5C3"/></right><top style="thin"><color rgb="FFDCD5C3"/></top><bottom style="thin"><color rgb="FFDCD5C3"/></bottom><diagonal/></border>' +
    '<border><left/><right/><top/><bottom style="medium"><color rgb="FF14284B"/></bottom><diagonal/></border>' +
  '</borders>' +
  '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
  '<cellXfs count="19">' +
    '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +                                                                               // 0
    '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>' +              // 1 brand
    '<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center" wrapText="1"/></xf>' + // 2 contact
    '<xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/>' +                                                                    // 3 gold rule
    '<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>' +              // 4 title
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' + // 5 label
    '<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' + // 6 value
    '<xf numFmtId="0" fontId="6" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>' + // 7 th
    '<xf numFmtId="0" fontId="5" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>' + // 8 td
    '<xf numFmtId="164" fontId="5" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' + // 9 td number
    '<xf numFmtId="164" fontId="5" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + // 10 td qty
    '<xf numFmtId="0" fontId="7" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' + // 11 total label
    '<xf numFmtId="164" fontId="8" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' + // 12 total value
    '<xf numFmtId="0" fontId="5" fillId="0" borderId="2" xfId="0" applyFont="1" applyBorder="1"/>' +                                                     // 13 signature line
    '<xf numFmtId="0" fontId="9" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment wrapText="1" vertical="top"/></xf>' +      // 14 note
    '<xf numFmtId="0" fontId="5" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>' + // 15 client box
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>' + // 16 td number-of-line
    '<xf numFmtId="0" fontId="10" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>' + // 17 value bold
    '<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>' +                 // 18 label left
  '</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';

/* v = {num, client, start_date, end_date, month, lines:[{name,price,qty}]}
   tp = invoice template {client, signer, signerEn}; eq = price list [{name, price}]
   returns {path: text} plus 'xl/media/logo.png' which the caller fills with the PNG bytes (or drops) */
function xlsxParts(v, tp, eq, withLogo) {
  tp = tp || {}; eq = eq || [];
  var lines = (v.lines || []).filter(function (l) { return l && (l.name || l.price || l.qty); });
  var spare = Math.max(5, 12 - lines.length), last = XLSX_FIRST + lines.length + spare - 1, eqLast = Math.max(2, eq.length + 1);
  var ym = v.month || String(v.start_date || '').slice(0, 7);
  var rows = [], merges = [], r;

  var brand = '<c r="B1" t="inlineStr" s="' + XS.brand + '"><is><r><rPr><b/><sz val="22"/><color rgb="FFC9A24A"/><rFont val="Arial"/></rPr><t>ARM</t></r><r><rPr><b/><sz val="22"/><color rgb="FF14284B"/><rFont val="Arial"/></rPr><t>EQUIPMENT</t></r></is></c>';
  rows.push(xRow(1, [xBlank('A1', XS.brand), brand, xStr('C1', 'Berry Line ՍՊԸ\narmequipment@gmail.com\narm-equipment.com', XS.contact), xBlank('D1', XS.contact), xBlank('E1', XS.contact)], 50));
  merges.push('C1:E1');
  rows.push(xRow(2, ['A', 'B', 'C', 'D', 'E'].map(function (c) { return xBlank(c + '2', XS.gold); }), 4));
  rows.push(xRow(4, [xStr('A4', 'Հաշիվ / Invoice  № ' + v.num, XS.title), xStr('C4', 'Ամսաթիվ / Date', XS.label), xStr('D4', xDates(v), XS.valueB), xBlank('E4', XS.valueB)], 30));
  merges.push('A4:B4', 'D4:E4');
  rows.push(xRow(5, [xStr('C5', 'Ամիս / Month', XS.label), xStr('D5', ym ? X_MONTHS[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4) : '', XS.value), xBlank('E5', XS.value)], 18));
  merges.push('D5:E5');
  var clientText = (v.client || '') + (tp.client ? '\n' + tp.client : '');
  var clientLines = clientText.split('\n').length;
  rows.push(xRow(6, [xStr('A6', 'Պատվիրատու / Client', XS.labelL)], 16));
  rows.push(xRow(7, [xStr('A7', clientText.trim(), XS.box), xBlank('B7', XS.box), xBlank('C7', XS.box), xBlank('D7', XS.box), xBlank('E7', XS.box)], Math.min(15 * clientLines + 10, 220)));
  merges.push('A7:E7');
  rows.push(xRow(9, [xStr('A9', '№', XS.th), xStr('B9', 'Անուն / Description', XS.th), xStr('C9', 'Գին, դր. / Price', XS.th), xStr('D9', 'Քանակ / Qty', XS.th), xStr('E9', 'Ընդ., դր. / Amount', XS.th)], 30));

  var total = 0, priceRange = "'" + XLSX_SHEET2 + "'!$A$2:$B$" + eqLast;
  for (r = XLSX_FIRST; r <= last; r++) {
    var l = lines[r - XLSX_FIRST], n = r - XLSX_FIRST + 1, cells = [];
    if (l) {
      var s = (+l.price || 0) * (+l.qty || 0); total += s;
      cells.push(xFormula('A' + r, 'IF(B' + r + '="","",ROW()-' + (XLSX_FIRST - 1) + ')', n, XS.tdNo));
      cells.push(xStr('B' + r, String(l.name || '').replace(/ \/ /g, ' / '), XS.td));
      cells.push(xNum('C' + r, l.price, XS.tdNum));
      cells.push(xNum('D' + r, l.qty, XS.tdQty));
      cells.push(xFormula('E' + r, 'IF(OR(C' + r + '="",D' + r + '=""),"",C' + r + '*D' + r + ')', s, XS.tdNum));
    } else {
      cells.push(xFormula('A' + r, 'IF(B' + r + '="","",ROW()-' + (XLSX_FIRST - 1) + ')', '', XS.tdNo));
      cells.push(xBlank('B' + r, XS.td));
      cells.push(xFormula('C' + r, 'IF(B' + r + '="","",IFERROR(VLOOKUP(B' + r + ',' + priceRange + ',2,FALSE),""))', '', XS.tdNum));
      cells.push(xBlank('D' + r, XS.tdQty));
      cells.push(xFormula('E' + r, 'IF(OR(C' + r + '="",D' + r + '=""),"",C' + r + '*D' + r + ')', '', XS.tdNum));
    }
    rows.push(xRow(r, cells, 22));
  }
  var tr = last + 1;
  rows.push(xRow(tr, [xStr('A' + tr, 'Ընդամենը / Total, դր.', XS.totLabel), xBlank('B' + tr, XS.totLabel), xBlank('C' + tr, XS.totLabel), xBlank('D' + tr, XS.totLabel),
    xFormula('E' + tr, 'SUM(E' + XLSX_FIRST + ':E' + last + ')', total, XS.totVal)], 28));
  merges.push('A' + tr + ':D' + tr);
  var sr = tr + 4;
  rows.push(xRow(sr, [xBlank('B' + sr, XS.sign)]));
  rows.push(xRow(sr + 1, [xStr('B' + (sr + 1), (tp.signer || 'Արմեն Սարգսյան') + (tp.signerEn ? ' / ' + tp.signerEn : ''), 0), xStr('E' + (sr + 1), 'Berry Line ՍՊԸ', XS.label)]));
  var nr = sr + 4;
  rows.push(xRow(nr, [xStr('A' + nr, 'Փոխեք քանակը կամ գինը՝ գումարները կհաշվվեն ինքնաշխատ։ Նոր տող՝ լրացրեք դատարկ տողը (ընտրեք տեխնիկան ցուցակից)։\nChange a quantity or price and the amounts update automatically. To add an item, fill in an empty row (pick it from the list).', XS.note)], 30));
  merges.push('A' + nr + ':E' + nr);

  // hidden id data (column H) — lets the robot read a corrected file back
  var meta = [['AE-INVOICE', 1], [v.num, 2], [String(v.start_date || '').slice(0, 10), 3], [String(v.end_date || v.start_date || '').slice(0, 10), 4], [ym || '', 5], [v.client || '', 6], [String(XLSX_FIRST) + ':' + last, 7]];
  rows = rows.map(function (x) {
    var m = x.match(/^<row r="(\d+)"/), rn = +m[1];
    var md = meta.filter(function (q) { return q[1] === rn; })[0];
    return md ? x.replace('</row>', xStr('H' + rn, md[0], 0) + '</row>') : x;
  });
  meta.forEach(function (q) { if (!rows.some(function (x) { return x.indexOf('<row r="' + q[1] + '"') === 0; })) rows.push(xRow(q[1], [xStr('H' + q[1], q[0], 0)])); });
  rows.sort(function (a, b) { return +a.match(/^<row r="(\d+)"/)[1] - +b.match(/^<row r="(\d+)"/)[1]; });

  var sheet1 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><dimension ref="A1:H' + nr + '"/>' +
    '<sheetViews><sheetView workbookViewId="0" showGridLines="0" tabSelected="1"><selection activeCell="B' + (XLSX_FIRST + lines.length) + '" sqref="B' + (XLSX_FIRST + lines.length) + '"/></sheetView></sheetViews>' +
    '<sheetFormatPr defaultRowHeight="15"/>' +
    '<cols><col min="1" max="1" width="7.5" customWidth="1"/><col min="2" max="2" width="50" customWidth="1"/><col min="3" max="3" width="15" customWidth="1"/><col min="4" max="4" width="12" customWidth="1"/><col min="5" max="5" width="18" customWidth="1"/><col min="8" max="8" width="12" hidden="1" customWidth="1"/></cols>' +
    '<sheetData>' + rows.join('') + '</sheetData>' +
    '<mergeCells count="' + merges.length + '">' + merges.map(function (m) { return '<mergeCell ref="' + m + '"/>'; }).join('') + '</mergeCells>' +
    '<dataValidations count="1"><dataValidation type="list" allowBlank="1" showInputMessage="1" showErrorMessage="0" sqref="B' + XLSX_FIRST + ':B' + last + '"><formula1>' + xEsc(priceRange.replace(':$B$', ':$A$')) + '</formula1></dataValidation></dataValidations>' +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>' +
    '<pageSetup paperSize="9" orientation="portrait" fitToWidth="1" fitToHeight="0"/>' +
    (withLogo ? '<drawing r:id="rId1"/>' : '') + '</worksheet>';

  var eqRows = [xRow(1, [xStr('A1', 'Անուն / Name', XS.th), xStr('B1', 'Գին, դր. / Price', XS.th)], 22)];
  eq.forEach(function (e, i) { eqRows.push(xRow(i + 2, [xStr('A' + (i + 2), e.name, XS.td), e.price == null ? xStr('B' + (i + 2), '', XS.tdNum) : xNum('B' + (i + 2), e.price, XS.tdNum)])); });
  var sheet2 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><sheetFormatPr defaultRowHeight="15"/>' +
    '<cols><col min="1" max="1" width="50" customWidth="1"/><col min="2" max="2" width="16" customWidth="1"/></cols><sheetData>' + eqRows.join('') + '</sheetData>' +
    '<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/></worksheet>';

  var parts = {
    '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>' +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      (withLogo ? '<Override PartName="/xl/drawings/drawing1.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>' : '') + '</Types>',
    '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<bookViews><workbookView activeTab="0"/></bookViews><sheets><sheet name="Հաշիվ" sheetId="1" r:id="rId1"/><sheet name="' + XLSX_SHEET2 + '" sheetId="2" r:id="rId2"/></sheets>' +
      '<definedNames><definedName name="_xlnm.Print_Area" localSheetId="0">\'Հաշիվ\'!$A$1:$E$' + (sr + 1) + '</definedName></definedNames><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>' +
      '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>' +
      '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': XLSX_STYLES,
    'xl/worksheets/sheet1.xml': sheet1,
    'xl/worksheets/sheet2.xml': sheet2
  };
  if (withLogo) {
    parts['xl/worksheets/_rels/sheet1.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing1.xml"/></Relationships>';
    parts['xl/drawings/_rels/drawing1.xml.rels'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="../media/logo.png"/></Relationships>';
    var emu = 9525 * 42;  // 42 px
    parts['xl/drawings/drawing1.xml'] = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
      '<xdr:oneCellAnchor><xdr:from><xdr:col>0</xdr:col><xdr:colOff>9525</xdr:colOff><xdr:row>0</xdr:row><xdr:rowOff>76200</xdr:rowOff></xdr:from><xdr:ext cx="' + emu + '" cy="' + emu + '"/>' +
      '<xdr:pic><xdr:nvPicPr><xdr:cNvPr id="2" name="ArmEquipment logo"/><xdr:cNvPicPr><a:picLocks noChangeAspect="1"/></xdr:cNvPicPr></xdr:nvPicPr>' +
      '<xdr:blipFill><a:blip r:embed="rId1"/><a:stretch><a:fillRect/></a:stretch></xdr:blipFill>' +
      '<xdr:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="' + emu + '" cy="' + emu + '"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></xdr:spPr></xdr:pic><xdr:clientData/></xdr:oneCellAnchor></xdr:wsDr>';
  }
  return parts;
}

/* "Invoice 014 - 10.27-28.2026.xlsx" — month.day like the existing files */
function xlsxFileName(v) {
  var s = String(v.start_date || ((v.month || '') + '-01')).slice(0, 10).split('-'), e = String(v.end_date || v.start_date || '').slice(0, 10).split('-');
  var d = s[1] + '.' + s[2];
  if (e.length === 3 && e.join('-') !== s.join('-')) d += (e[0] === s[0] && e[1] === s[1]) ? '-' + e[2] : '-' + e[1] + '.' + e[2];
  return 'Invoice ' + String(v.num).replace(/[\\\/:*?"<>|]/g, '-') + ' - ' + d + '.' + (e.length === 3 ? e : s)[0] + '.xlsx';
}

/* read an invoice back from the sheet XML (+ shared strings), as saved by Excel after editing */
function xlsxReadInvoice(sheetXml, sharedXml) {
  var shared = [];
  (String(sharedXml || '').match(/<si>[\s\S]*?<\/si>/g) || []).forEach(function (si) {
    shared.push((si.match(/<t[^>]*>[^<]*<\/t>/g) || []).map(function (t) { return t.replace(/<[^>]+>/g, ''); }).join(''));
  });
  var unx = function (s) { return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&'); };
  var cells = {};
  (sheetXml.match(/<c [^>]*?(?:\/>|>[\s\S]*?<\/c>)/g) || []).forEach(function (c) {
    var ref = (c.match(/ r="([A-Z]+\d+)"/) || [])[1]; if (!ref) return;
    var t = (c.match(/ t="(\w+)"/) || [])[1], val = '';
    if (t === 'inlineStr') val = (c.match(/<t[^>]*>[^<]*<\/t>/g) || []).map(function (x) { return x.replace(/<[^>]+>/g, ''); }).join('');
    else { var v = (c.match(/<v>([^<]*)<\/v>/) || [])[1]; if (v == null) return; val = t === 's' ? shared[+v] : v; }
    cells[ref] = unx(String(val));
  });
  if (cells.H1 !== 'AE-INVOICE') return null;
  var rng = String(cells.H7 || '').split(':'), first = +rng[0] || XLSX_FIRST, lines = [];
  for (var r = first; r < first + 200; r++) {
    var a = cells['A' + r] || '', b = (cells['B' + r] || '').trim();
    if (/^Ընդամենը/.test(a)) break;
    if (!b) continue;
    var price = Math.round(parseFloat(String(cells['C' + r] || '0').replace(/[^\d.\-]/g, '')) || 0);
    var qty = Math.round((parseFloat(String(cells['D' + r] || '0').replace(/[^\d.\-]/g, '')) || 0) * 100) / 100;
    if (!qty && !price) continue;
    lines.push({ name: b, price: price, qty: qty });
  }
  return { num: cells.H2 || '', start_date: cells.H3 || null, end_date: cells.H4 || cells.H3 || null, month: cells.H5 || (cells.H3 || '').slice(0, 7), client: cells.H6 || '', lines: lines };
}
/* ==== XLSX-END ==== */
