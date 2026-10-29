/**
 * ArmEquipment — Gmail robot (Google Apps Script, runs inside armequipment@gmail.com)
 *
 *  • every 5 minutes: sends the emails the website queued (notifications, invoices)
 *  • on the 1st of each month at 9:00: sends last month's summary
 *  • every hour: finds invoice .docx files in Gmail and adds them to the website
 *
 * Setup (once): Project Settings → Script properties → add
 *     SUPABASE_URL  = https://lrxhmydzxkkpvhhobzqa.supabase.co
 *     SUPABASE_KEY  = the publishable key (sb_publishable_…)
 *     BOT_SECRET    = the robot password shown on the website (Income → Email)
 * then choose the function "setup" and press Run, and allow access.
 */

var P = PropertiesService.getScriptProperties();
var SENDER_NAME = 'ArmEquipment';
var LABEL = 'ArmEquipment/imported';
var MONTHS_HY = ['Հունվար','Փետրվար','Մարտ','Ապրիլ','Մայիս','Հունիս','Հուլիս','Օգոստոս','Սեպտեմբեր','Հոկտեմբեր','Նոյեմբեր','Դեկտեմբեր'];

/* ---------- setup ---------- */
function setup() {
  ['SUPABASE_URL', 'SUPABASE_KEY', 'BOT_SECRET'].forEach(function (k) {
    if (!P.getProperty(k)) throw new Error('Script property missing: ' + k);
  });
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendQueue').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('importFromGmail').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('monthlySummary').timeBased().onMonthDay(1).atHour(9).create();
  if (!P.getProperty('IMPORT_SINCE')) {
    P.setProperty('IMPORT_SINCE', Utilities.formatDate(new Date(), 'Asia/Yerevan', 'yyyy/MM/dd'));
  }
  rpc('bot_settings');   // checks the password
  sendQueue();
  Logger.log('Ready. Importing invoices from Gmail dated ' + P.getProperty('IMPORT_SINCE') + ' and later.');
}

/* ---------- website database ---------- */
function rpc(name, args) {
  var url = P.getProperty('SUPABASE_URL').replace(/\/+$/, '') + '/rest/v1/rpc/' + name;
  var body = { secret: P.getProperty('BOT_SECRET') };
  for (var k in (args || {})) body[k] = args[k];
  var r = UrlFetchApp.fetch(url, {
    method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { apikey: P.getProperty('SUPABASE_KEY') }, payload: JSON.stringify(body)
  });
  if (r.getResponseCode() >= 300) throw new Error(name + ' → ' + r.getResponseCode() + ' ' + r.getContentText());
  var t = r.getContentText();
  return t ? JSON.parse(t) : null;
}

/* ---------- 1. send queued emails ---------- */
function sendQueue() {
  var rows = rpc('bot_take') || [];
  rows.forEach(function (m) {
    try {
      if (m.kind === 'summary') {
        var s = summaryEmail(m.subject);
        GmailApp.sendEmail(m.to_addr, s.subject, s.text, { htmlBody: s.html, name: SENDER_NAME });
      } else {
        var o = { name: SENDER_NAME };
        if (m.html) o.htmlBody = m.html;
        if (m.cc) o.cc = m.cc;
        if (m.reply_to) o.replyTo = m.reply_to;
        if (m.att_html) o.attachments = [Utilities.newBlob('﻿' + m.att_html, 'application/msword', m.att_name || 'Invoice.doc')];
        GmailApp.sendEmail(m.to_addr, m.subject, m.body || ' ', o);
      }
      rpc('bot_done', { msg_id: m.id, ok: true, err: null });
    } catch (e) {
      rpc('bot_done', { msg_id: m.id, ok: false, err: String(e).slice(0, 900) });
    }
  });
}

/* ---------- 2. month-end summary ---------- */
function monthlySummary() {
  var d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1);
  var ym = Utilities.formatDate(d, 'Asia/Yerevan', 'yyyy-MM');
  var s = summaryEmail(ym);
  if (!s.to) return;
  GmailApp.sendEmail(s.to, s.subject, s.text, { htmlBody: s.html, name: SENDER_NAME });
}

function fmt(n) { return String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function dmy(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }

function summaryEmail(ym) {
  var d = rpc('bot_month_summary', { ym: ym });
  var mm = +ym.slice(5, 7), title = MONTHS_HY[mm - 1] + ' ' + ym.slice(0, 4);
  var th = 'style="text-align:left;padding:6px 10px;border-bottom:2px solid #c9a24a;font-size:12px;color:#555"';
  var td = 'style="padding:6px 10px;border-bottom:1px solid #e3e3e3"';
  var tdr = 'style="padding:6px 10px;border-bottom:1px solid #e3e3e3;text-align:right;white-space:nowrap"';
  var h = '<div style="font-family:Arial,sans-serif;color:#14284b;max-width:640px">' +
    '<h2 style="margin:0 0 4px">ArmEquipment — ' + esc(title) + '</h2>' +
    '<p style="margin:0 0 16px;color:#555">' + d.count + ' հաշիվ · ' + d.days + ' աշխատանքային օր</p>' +
    '<p style="font-size:26px;font-weight:bold;margin:0 0 18px">' + fmt(d.total) + ' դր.</p>' +
    '<h3>Բաժանում</h3><table style="border-collapse:collapse;width:100%">';
  var t = 'ArmEquipment — ' + title + '\n' + d.count + ' հաշիվ, ' + d.days + ' օր\nԸնդամենը: ' + fmt(d.total) + ' դր.\n\nԲաժանում\n';
  (d.people || []).forEach(function (p) {
    h += '<tr><td ' + td + '>' + esc(p.name) + (p.tax ? ' (հարկ)' : '') + '</td><td ' + tdr + '><b>' + fmt(p.amount) + ' դր.</b></td></tr>';
    t += p.name + ': ' + fmt(p.amount) + ' դր.\n';
  });
  h += '</table><h3>Ըստ կազմակերպությունների</h3><table style="border-collapse:collapse;width:100%">';
  t += '\nԸստ կազմակերպությունների\n';
  (d.clients || []).forEach(function (c) {
    h += '<tr><td ' + td + '>' + esc(c.client) + '</td><td ' + tdr + '>' + c.count + ' հաշիվ</td><td ' + tdr + '><b>' + fmt(c.total) + ' դր.</b></td></tr>';
    t += c.client + ': ' + c.count + ' հաշիվ, ' + fmt(c.total) + ' դր.\n';
  });
  h += '</table><h3>Հաշիվներ</h3><table style="border-collapse:collapse;width:100%"><tr><th ' + th + '>#</th><th ' + th + '>Կազմակերպություն</th><th ' + th + '>Ամսաթիվ</th><th ' + th + ' align="right">Գումար</th></tr>';
  t += '\nՀաշիվներ\n';
  (d.invoices || []).forEach(function (v) {
    var dt = dmy(v.start) + (v.end && v.end !== v.start ? ' – ' + dmy(v.end) : '');
    h += '<tr><td ' + td + '>' + esc(v.num) + '</td><td ' + td + '>' + esc(v.client) + '</td><td ' + td + '>' + dt + '</td><td ' + tdr + '>' + fmt(v.total) + '</td></tr>';
    t += '#' + v.num + '  ' + v.client + '  ' + dt + '  ' + fmt(v.total) + ' դր.\n';
  });
  h += '</table><p style="margin-top:20px"><a href="https://www.arm-equipment.com/portal" style="color:#14284b">Բացել կայքում</a></p></div>';
  if (!d.count) { h = '<p style="font-family:Arial">' + esc(title) + '՝ հաշիվներ չկան։</p>'; t = title + ': հաշիվներ չկան։'; }
  return { to: d.summaryTo, subject: 'ArmEquipment — ամսվա ամփոփում ' + title + ' — ' + fmt(d.total) + ' դր.', html: h, text: t };
}

/* ---------- 3. invoices from Gmail ---------- */
function importFromGmail() {
  var cfg = rpc('bot_settings');
  if (cfg.gmailImport === false) return;
  var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  var q = 'has:attachment filename:docx after:' + P.getProperty('IMPORT_SINCE') + ' -label:' + LABEL.replace('/', '-');
  var threads = GmailApp.search(q, 0, 30);
  threads.forEach(function (th) {
    var ok = true;
    th.getMessages().forEach(function (msg) {
      msg.getAttachments().forEach(function (a) {
        var name = a.getName();
        if (!/\.docx$/i.test(name) || !/invoice|հաշիվ/i.test(name)) return;
        if (/invoice\s*0+\s*-/i.test(name)) return;                         // empty template "Invoice 000"
        try {
          var xml = docxXml(a);
          var p = parseInvoice(xml, name, msg.getDate(), (msg.getTo() || '') + ' ' + (msg.getFrom() || ''), cfg.clients || []);
          if (!p) return;
          p.gmail_id = msg.getId() + '/' + name;
          p.note = 'Gmail-ից՝ «' + msg.getSubject() + '», ' + Utilities.formatDate(msg.getDate(), 'Asia/Yerevan', 'dd.MM.yyyy');
          p.status = 'manager';
          var res = rpc('bot_add_invoice', { p: p });
          Logger.log(name + ' → ' + res);
        } catch (e) { ok = false; Logger.log(name + ' → ' + e); }
      });
    });
    if (ok) th.addLabel(label);
  });
}

function docxXml(blob) {
  var files = Utilities.unzip(blob.copyBlob().setContentType('application/zip'));
  for (var i = 0; i < files.length; i++) if (files[i].getName() === 'word/document.xml') return files[i].getDataAsString('UTF-8');
  throw new Error('not a docx');
}

/* ---------- invoice parser (pure JavaScript, no Google services) ---------- */
function xmlText(s) {
  return s.replace(/<w:tab\/>/g, ' ').replace(/<\/w:p>/g, ' ').replace(/<w:br\/>/g, ' ')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/[ \s]+/g, ' ').trim();
}
function toInt(s) {
  var m = String(s || '').replace(/[  ,]/g, '').match(/\d+(?:\.\d{3})*/);
  return m ? parseInt(m[0].replace(/\./g, ''), 10) : null;
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }

function parseInvoice(xml, fileName, sentDate, people, knownClients) {
  var body = xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, ' ');
  var paras = xmlText(body);
  var all = xmlText(xml);
  var rows = [];
  (xml.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []).forEach(function (tr) {
    rows.push((tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map(xmlText));
  });

  // number
  var nm = paras.match(/#\s*(\d+)/) || fileName.match(/invoice\s*(\d+)/i);
  var num = nm ? nm[1] : '';

  // lines and total
  var lines = [], total = null;
  rows.forEach(function (c) {
    var j = c.join(' ').toLowerCase();
    if (/^ընդ|total/.test(j) && c.length <= 3) {
      var nums = (j.replace(/\d+\s*%/g, '').match(/\d{1,3}(?:[ ,.]\d{3})+|\d+/g) || []).map(toInt).filter(function (n) { return n >= 1000; });
      if (nums.length) total = /-/.test(j) ? nums[nums.length - 1] : nums[0];
      return;
    }
    if (c.length < 5 || !c[0] || /^(անուն|type of service|description)/i.test(c[0])) return;
    var name, up, q, lt;
    if (c.length >= 6) { name = c[3] || c[0]; up = c[1]; q = c[2]; lt = c[5]; }
    else { name = c[0]; up = c[1]; q = c[2]; lt = c[4]; }
    var price = toInt(up), qty = toInt(q), sum = toInt(lt);
    if (qty == null && sum == null) return;
    if (price == null && sum != null && qty) price = Math.round(sum / qty);
    if (qty == null) qty = 1;
    lines.push({ name: name, price: price || 0, qty: qty });
  });
  var pay = paras.match(/payment of the\s*(\d[\d.,\s]*\d)/i);
  if (pay) total = toInt(pay[1]);
  if (!lines.length && !total) return null;
  var ls = lines.reduce(function (a, l) { return a + l.price * l.qty; }, 0);
  if (!lines.length) lines.push({ name: 'Ընդհանուր գումար', price: total, qty: 1 });
  else if (total && total !== ls) {
    var k = total / ls;
    if (ls > 0 && k === Math.round(k) && k >= 2 && k <= 10) lines.forEach(function (l) { l.qty *= k; l.name += ' (×' + k + ' օր)'; });
    else lines.push({ name: 'Ճշգրտում (զեղչ / ընդհանուր գումարի տարբերություն)', price: total - ls, qty: 1 });
  }

  // dates — from the file name, with the email date deciding day/month order
  var d = fileDates(fileName, sentDate);
  // client
  var client = clientOf(all + ' ' + fileName + ' ' + people, knownClients);
  return {
    num: num, client: client, lines: lines,
    start_date: d ? d.start : null, end_date: d ? d.end : null,
    month: d ? d.start.slice(0, 7) : Utilities_ym(sentDate)
  };
}

function Utilities_ym(dt) { return dt.getFullYear() + '-' + pad2(dt.getMonth() + 1); }

function fileDates(fileName, sentDate) {
  var m = fileName.replace(/docx/gi, ' ').match(/(\d{1,2})[.\-](\d{1,2})(?:[.\-](\d{1,2}))?\.?\s*(20\d\d)/);
  if (!m) return null;
  var y = +m[4], a = +m[1], b = +m[2], c = m[3] ? +m[3] : null;
  var sep1 = fileName.charAt(fileName.indexOf(m[0]) + m[1].length);
  var sm = sentDate ? sentDate.getMonth() + 1 : null;
  var mon, d1, d2;
  if (c != null) {
    if (sep1 === '-') { d1 = a; d2 = b; mon = c; }        // 17-18.01.2024
    else { mon = a; d1 = b; d2 = c; }                    // 12.8-12.2025
    if (mon > 12) { var x = mon; mon = d1; d1 = x; }
  } else {
    var aIsMonth;
    if (a > 12) aIsMonth = false;
    else if (b > 12) aIsMonth = true;
    else if (sm && b === sm && a !== sm) aIsMonth = false;
    else if (sm && a !== sm && Math.abs(b - sm) < Math.abs(a - sm)) aIsMonth = false;
    else aIsMonth = true;                                // newer files use MM.DD.YYYY
    if (aIsMonth) { mon = a; d1 = d2 = b; } else { mon = b; d1 = d2 = a; }
  }
  if (mon < 1 || mon > 12) return null;
  var last = new Date(y, mon, 0).getDate();
  d1 = Math.min(Math.max(d1, 1), last); d2 = Math.min(Math.max(d2 || d1, d1), last);
  return { start: y + '-' + pad2(mon) + '-' + pad2(d1), end: y + '-' + pad2(mon) + '-' + pad2(d2) };
}

function clientOf(text, known) {
  var t = text.toLowerCase();
  if (/hilton|հիլթն|հիլտոն|դաբլթրի/.test(t)) return 'Hilton';
  if (/royal tulip/.test(t)) return 'Royal Tulip';
  if (/open society|osf/.test(t)) return 'OSF Armenia';
  if (/congress|կոնգրես/.test(t)) return 'Congress';
  for (var i = 0; i < known.length; i++) if (known[i] && known[i] !== 'Այլ' && t.indexOf(String(known[i]).toLowerCase()) >= 0) return known[i];
  return 'Այլ';
}
