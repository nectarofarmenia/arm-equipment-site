/**
 * ArmEquipment — Gmail robot (Google Apps Script inside armequipment@gmail.com)
 *
 *  every 5 min   sends what the website queued (notifications, invoices, summaries)
 *  every 10 min  reads Gmail: new/changed invoices (.docx) → website, with a notification
 *                checks the manager's reply to the month-end email:
 *                  approval and/or corrected invoices → invoices updated → sent to the accountant
 *                  anything unclear → you get an email and decide on the website
 *  last day of the month, 18:00 Yerevan   all invoices of the month → manager, for approval (English)
 *  1st of the month, 9:00 Yerevan         last month's summary → you
 *
 * Setup (once): ⚙ Project Settings → Script properties:
 *     SUPABASE_URL = https://lrxhmydzxkkpvhhobzqa.supabase.co
 *     SUPABASE_KEY = the publishable key (sb_publishable_…)
 *     BOT_SECRET   = robot password from the website (Income → Email link)
 * then select the function "setup", press Run and allow access.
 */

var P = PropertiesService.getScriptProperties();
var SENDER_NAME = 'ArmEquipment';
var LABEL = 'ArmEquipment/imported';
var TZ = 'Asia/Yerevan';
var MONTHS_HY = ['Հունվար','Փետրվար','Մարտ','Ապրիլ','Մայիս','Հունիս','Հուլիս','Օգոստոս','Սեպտեմբեր','Հոկտեմբեր','Նոյեմբեր','Դեկտեմբեր'];
var MONTHS_HY_GEN = ['հունվար','փետրվար','մարտ','ապրիլ','մայիս','հունիս','հուլիս','օգոստոս','սեպտեմբեր','հոկտեմբեր','նոյեմբեր','դեկտեմբեր'];
var MONTHS_EN = ['January','February','March','April','May','June','July','August','September','October','November','December'];
var APPROVE_RE = /approv|confirm|\bok\b|\bokay\b|agreed|all good|all fine|looks good|accepted|հաստատ|համաձայն|ճիշտ է|утвержд|подтвержд|согласов|\bок\b/i;
var CHANGE_RE = /chang|amend|correction|corrected|please correct|to be corrected|instead|wrong|mistake|should be|please (fix|update|revise)|not (correct|right)|remove|add |փոխ|ուղղ|սխալ|հանել|ավելացն|исправ|измен|ошиб/i;

/* ---------- setup ---------- */
function setup() {
  ['SUPABASE_URL', 'SUPABASE_KEY', 'BOT_SECRET'].forEach(function (k) {
    if (!P.getProperty(k)) throw new Error('Script property missing: ' + k);
  });
  ScriptApp.getProjectTriggers().forEach(function (t) { ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('sendQueue').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('watch').timeBased().everyMinutes(10).create();
  if (!P.getProperty('IMPORT_SINCE')) P.setProperty('IMPORT_SINCE', Utilities.formatDate(new Date(), TZ, 'yyyy/MM/dd'));
  rpc('bot_settings');               // checks the password
  docxBlob({ num: '000', lines: [] }, {});   // checks that Word files can be made
  sendQueue();
  Logger.log('Ready. Reading Gmail from ' + P.getProperty('IMPORT_SINCE') + ' onward.');
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
function notifyMe(subject, text) {
  var cfg = rpc('bot_settings');
  if (cfg.notifyTo) GmailApp.sendEmail(cfg.notifyTo, subject, text, { name: SENDER_NAME });
}

/* ---------- helpers ---------- */
function fmt(n) { return String(Math.round(+n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' '); }
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
function dmy(iso) { if (!iso) return ''; var p = String(iso).slice(0, 10).split('-'); return p[2] + '.' + p[1] + '.' + p[0]; }
function invTotal(v) { return (v.lines || []).reduce(function (a, l) { return a + (+l.price || 0) * (+l.qty || 0); }, 0); }
function dateRange(v) { return dmy(v.start_date) + (v.end_date && v.end_date !== v.start_date ? ' – ' + dmy(v.end_date) : ''); }
function ymNow(offsetMonths) {
  var d = new Date(Utilities.formatDate(new Date(), TZ, "yyyy-MM-01'T'12:00:00"));
  d.setMonth(d.getMonth() + (offsetMonths || 0));
  return d.getFullYear() + '-' + docxPad(d.getMonth() + 1);
}
function monthEn(ym) { return MONTHS_EN[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4); }
function monthHy(ym) { return ym.slice(0, 4) + ' թ. ' + MONTHS_HY_GEN[+ym.slice(5, 7) - 1]; }
function myEmail() { return (Session.getEffectiveUser().getEmail() || '').toLowerCase(); }

function docxBlob(v, tp) {
  var name = docxFileName(v);
  try {
    var z = Utilities.zip([
      Utilities.newBlob(DOCX_CT, 'application/xml', '[Content_Types].xml'),
      Utilities.newBlob(DOCX_RELS, 'application/xml', '_rels/.rels'),
      Utilities.newBlob(docxDocumentXml(v, tp), 'application/xml', 'word/document.xml')
    ], name);
    return z.setContentType('application/vnd.openxmlformats-officedocument.wordprocessingml.document').setName(name);
  } catch (e) {   // fallback: Word-readable HTML
    var rows = (v.lines || []).map(function (l) { return '<tr><td>' + esc(l.name) + '</td><td>' + fmt(l.price) + '</td><td>' + l.qty + '</td><td>' + docxDate(v) + '</td><td>' + fmt(l.price * l.qty) + '</td></tr>'; }).join('');
    var html = '<html><head><meta charset="utf-8"></head><body><p align=center style="font-size:20pt">Հաշիվ # ' + esc(v.num) + '</p><p>' + esc(tp.client || '').replace(/\n/g, '<br>') +
      '</p><table border=1 cellpadding=6 style="border-collapse:collapse"><tr><th>Անուն</th><th>Գին</th><th>Հատ</th><th>Ամսաթիվ</th><th>Ընդ.</th></tr>' + rows +
      '<tr><td colspan=3 align=center><b>Ընդ. ' + fmt(invTotal(v)) + ' դր.</b></td></tr></table><p>______________<br>' + esc(tp.signer || '') + '</p></body></html>';
    return Utilities.newBlob('﻿' + html, 'application/msword', name.replace(/\.docx$/, '.doc'));
  }
}
function invoiceTable(invs, lang) {
  var th = 'style="text-align:left;padding:6px 10px;border-bottom:2px solid #c9a24a;font-size:12px;color:#555"';
  var td = 'style="padding:6px 10px;border-bottom:1px solid #e3e3e3"';
  var tdr = 'style="padding:6px 10px;border-bottom:1px solid #e3e3e3;text-align:right;white-space:nowrap"';
  var en = lang === 'en';
  var h = '<table style="border-collapse:collapse;min-width:420px"><tr><th ' + th + '>' + (en ? 'Invoice' : 'Հաշիվ') + '</th><th ' + th + '>' + (en ? 'Date' : 'Ամսաթիվ') + '</th><th ' + th + ' align="right">' + (en ? 'Amount, AMD' : 'Գումար, դր.') + '</th></tr>';
  var t = '';
  invs.forEach(function (v) {
    h += '<tr><td ' + td + '>#' + esc(v.num) + '</td><td ' + td + '>' + dateRange(v) + '</td><td ' + tdr + '>' + fmt(invTotal(v)) + '</td></tr>';
    t += '#' + v.num + '   ' + dateRange(v) + '   ' + fmt(invTotal(v)) + (en ? ' AMD' : ' դր.') + '\n';
  });
  var tot = invs.reduce(function (a, v) { return a + invTotal(v); }, 0);
  h += '<tr><td ' + td + ' colspan="2"><b>' + (en ? 'Total' : 'Ընդամենը') + '</b></td><td ' + tdr + '><b>' + fmt(tot) + '</b></td></tr></table>';
  t += (en ? 'Total: ' : 'Ընդամենը՝ ') + fmt(tot) + (en ? ' AMD' : ' դր.') + '\n';
  return { html: h, text: t, total: tot };
}
function sendWithThread(to, subject, text, html, attachments) {
  var d = GmailApp.createDraft(to, subject, text, { htmlBody: html, attachments: attachments, name: SENDER_NAME });
  var m = d.send();
  return m.getThread().getId();
}

/* ---------- 1. queued emails ---------- */
function sendQueue() {
  var rows = rpc('bot_take') || [];
  rows.forEach(function (m) {
    try {
      if (m.kind === 'summary') {
        var s = summaryEmail(m.subject);
        GmailApp.sendEmail(m.to_addr, s.subject, s.text, { htmlBody: s.html, name: SENDER_NAME });
      } else if (m.kind === 'workflow') {
        var p = m.subject.split(':');               // manager:Hilton:2026-10  /  accountant:Hilton:2026-10
        var cfg = rpc('bot_settings');
        if (p[0] === 'manager') sendToManager(p[1], p[2], cfg);
        else if (p[0] === 'accountant') sendToAccountant(p[1], p[2], cfg, '');
      } else {
        var o = { name: SENDER_NAME };
        if (m.html) o.htmlBody = m.html;
        if (m.cc) o.cc = m.cc;
        if (m.reply_to) o.replyTo = m.reply_to;
        if (m.invoice_id) {
          var inv = rpc('bot_invoices', { p: { ids: [m.invoice_id] } })[0];
          if (inv) o.attachments = [docxBlob(inv, rpc('bot_settings').tpl || {})];
        } else if (m.att_html) {
          o.attachments = [Utilities.newBlob('﻿' + m.att_html, 'application/msword', m.att_name || 'Invoice.doc')];
        }
        GmailApp.sendEmail(m.to_addr, m.subject, m.body || ' ', o);
      }
      rpc('bot_done', { msg_id: m.id, ok: true, err: null });
    } catch (e) {
      rpc('bot_done', { msg_id: m.id, ok: false, err: String(e).slice(0, 900) });
    }
  });
}

/* ---------- 2. every 10 minutes ---------- */
function watch() {
  var cfg = rpc('bot_settings');
  try { checkReplies(cfg); } catch (e) { Logger.log('checkReplies: ' + e); }
  try { importFromGmail(cfg); } catch (e) { Logger.log('import: ' + e); }
  try { monthEnd(cfg); } catch (e) { Logger.log('monthEnd: ' + e); notifyMe('ArmEquipment — սխալ ամսվա վերջի նամակում', String(e)); }
  try { monthStartSummary(cfg); } catch (e) { Logger.log('summary: ' + e); }
}

/* last day of the month after 18:00 Yerevan → invoices to the manager */
function monthEnd(cfg) {
  var tp = cfg.tpl || {};
  if (tp.monthEndAuto === false || !tp.managerEmail) return;
  var now = new Date(), tomorrow = new Date(now.getTime() + 24 * 3600 * 1000);
  if (Utilities.formatDate(tomorrow, TZ, 'd') !== '1' || +Utilities.formatDate(now, TZ, 'H') < 18) return;
  var ym = Utilities.formatDate(now, TZ, 'yyyy-MM'), client = tp.workflowClient || 'Hilton', key = 'ME_' + client + '_' + ym;
  if (P.getProperty(key)) return;
  P.setProperty(key, '1');
  sendToManager(client, ym, cfg);
}

function sendToManager(client, ym, cfg) {
  var tp = cfg.tpl || {};
  if (!tp.managerEmail) throw new Error('manager email is empty');
  var invs = (rpc('bot_invoices', { p: { client: client, month: ym } }) || []).filter(function (v) { return v.status !== 'accountant'; });
  if (!invs.length) { notifyMe('ArmEquipment — ' + monthHy(ym) + '՝ հաշիվ չկա', client + '-ի ' + monthHy(ym) + ' ամսվա համար ուղարկելու հաշիվ չգտա։'); return; }
  var tb = invoiceTable(invs, 'en');
  var last = String(tp.managerName || '').trim().split(/\s+/).pop();
  var greet = last ? 'Dear Ms. ' + last + ',' : 'Dear Madam or Sir,';
  var subject = 'ArmEquipment — ' + monthEn(ym) + ' invoices for your review and approval';
  var intro = 'Please find attached our invoices for ' + monthEn(ym) + ' — ' + invs.length + ' invoice' + (invs.length > 1 ? 's' : '') + ', total ' + fmt(tb.total) + ' AMD.';
  var ask = 'Kindly review and approve them. If anything needs to be changed, please let us know or reply with the corrected invoice, and we will update it.';
  var sign = 'Kind regards,\n' + (tp.signerEn || 'Armen Sargsyan') + '\nArmEquipment · Berry Line LLC\narmequipment@gmail.com';
  var text = greet + '\n\n' + intro + '\n\n' + tb.text + '\n' + ask + '\n\n' + sign;
  var html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#14284b"><p>' + greet + '</p><p>' + intro + '</p>' + tb.html + '<p>' + ask + '</p><p>' + esc(sign).replace(/\n/g, '<br>') + '</p></div>';
  var threadId = sendWithThread(tp.managerEmail, subject, text, html, invs.map(function (v) { return docxBlob(v, tp); }));
  rpc('bot_set_status', { ids: invs.map(function (v) { return v.id; }), new_status: 'manager' });
  rpc('bot_run', { p: { client: client, month: ym, status: 'sent_to_manager', thread_id: threadId, invoice_count: invs.length, total: tb.total, log: 'Ուղարկվեց ղեկավարին (' + tp.managerEmail + ')' } });
  P.setProperty('RUN_' + threadId, String(new Date().getTime()));
}

function sendToAccountant(client, ym, cfg, why) {
  var tp = cfg.tpl || {};
  if (!tp.accountantEmail) throw new Error('accountant email is empty');
  var invs = (rpc('bot_invoices', { p: { client: client, month: ym } }) || []).filter(function (v) { return v.status !== 'draft'; });
  if (!invs.length) return;
  var tb = invoiceTable(invs, 'hy');
  var first = String(tp.accountantName || '').trim().split(/\s+/)[0];
  var greet = 'Բարև Ձեզ' + (first ? ', ' + first : '') + ',';
  var intro = 'Կից ուղարկում եմ ' + client + '-ի ' + monthHy(ym) + ' ամսվա հաշիվները՝ ' + invs.length + ' հաշիվ, ընդհանուր՝ ' + fmt(tb.total) + ' դր.։ Հաշիվները հաստատված են հյուրանոցի կողմից։';
  var ask = 'Խնդրում եմ դուրս գրել հաշիվները։';
  var sign = 'Շնորհակալություն,\n' + (tp.signer || 'Արմեն Սարգսյան') + '\nArmEquipment · Berry Line ՍՊԸ';
  var subject = client + ' — ' + monthHy(ym) + ' — հաշիվներ դուրս գրելու համար';
  var text = greet + '\n\n' + intro + '\n\n' + tb.text + '\n' + ask + '\n\n' + sign;
  var html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#14284b"><p>' + greet + '</p><p>' + intro + '</p>' + tb.html + '<p>' + ask + '</p><p>' + esc(sign).replace(/\n/g, '<br>') + '</p></div>';
  sendWithThread(tp.accountantEmail, subject, text, html, invs.map(function (v) { return docxBlob(v, tp); }));
  rpc('bot_set_status', { ids: invs.map(function (v) { return v.id; }), new_status: 'accountant' });
  rpc('bot_run', { p: { client: client, month: ym, status: 'sent_to_accountant', invoice_count: invs.length, total: tb.total, log: 'Ուղարկվեց հաշվապահին (' + tp.accountantEmail + ')' + (why ? '. ' + why : '') } });
  notifyMe('Ուղարկվեց հաշվապահին — ' + client + ' ' + monthHy(ym) + ' — ' + fmt(tb.total) + ' դր.',
    (why ? why + '\n\n' : '') + invs.length + ' հաշիվ ուղարկվեց ' + (tp.accountantName || '') + ' <' + tp.accountantEmail + '>-ին։\n\n' + tb.text +
    '\nՀաստատված հաշիվները կպահվեն համակարգչի պանակում, երբ բացեք կայքը Chrome-ով։');
}

/* the manager's reply to the month-end email */
function replyText(msg) {
  var lines = String(msg.getPlainBody() || '').split(/\r?\n/), out = [];
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i];
    if (/^\s*>/.test(l)) continue;
    if (/^On .+wrote:\s*$/.test(l) || /^-{2,}\s*Original Message/i.test(l) || /^From:\s/.test(l) || /^\S.*<[^>]+@[^>]+>\s*(wrote|գրել է)/i.test(l)) break;
    out.push(l);
  }
  return out.join('\n').trim();
}
function checkReplies(cfg) {
  var me = myEmail();
  (cfg.runs || []).forEach(function (run) {
    if (!run.thread_id) return;
    var th = GmailApp.getThreadById(run.thread_id);
    if (!th) return;
    var seenKey = 'SEEN_' + run.thread_id, seen = +(P.getProperty(seenKey) || P.getProperty('RUN_' + run.thread_id) || new Date(run.sent_at).getTime());
    var news = th.getMessages().filter(function (m) { return m.getDate().getTime() > seen && String(m.getFrom()).toLowerCase().indexOf(me) < 0; });
    if (!news.length) return;
    P.setProperty(seenKey, String(news[news.length - 1].getDate().getTime()));
    var texts = [], updated = [], unchanged = 0;
    news.forEach(function (msg) {
      texts.push(replyText(msg));
      msg.getAttachments().forEach(function (a) {
        if (!/\.docx$/i.test(a.getName())) return;
        try {
          var p = parseInvoice(docxXml(a), a.getName(), msg.getDate(), run.client, cfg.clients || []);
          if (!p) return;
          p.client = run.client;
          p.gmail_id = msg.getId() + '/' + a.getName();
          p.note = 'ղեկավարի ուղղում, ' + Utilities.formatDate(msg.getDate(), TZ, 'dd.MM.yyyy');
          p.quiet = 'yes';
          var r = rpc('bot_add_invoice', { p: p });
          if (r === 'updated' || r === 'added') updated.push('#' + p.num + ' → ' + fmt(invTotal(p)) + ' դր.');
          else unchanged++;
        } catch (e) { Logger.log(a.getName() + ': ' + e); }
      });
    });
    var text = texts.join('\n---\n'), tp = cfg.tpl || {};
    var approved = APPROVE_RE.test(text), changes = CHANGE_RE.test(text);
    var summary = (updated.length ? 'Ուղղված հաշիվներ՝ ' + updated.join(', ') + '\n' : '') + 'Պատասխան՝\n' + (text || '(առանց տեքստի)');
    if ((approved || updated.length) && !(changes && !updated.length) && tp.accountantAuto !== false) {
      rpc('bot_run', { p: { client: run.client, month: run.month, status: 'sent_to_manager', reply_text: text, log: 'Ղեկավարը հաստատեց' + (updated.length ? ', ուղղումներ՝ ' + updated.join(', ') : '') } });
      sendToAccountant(run.client, run.month, cfg, 'Ղեկավարը հաստատեց։ ' + summary);
    } else {
      rpc('bot_run', { p: { client: run.client, month: run.month, status: 'needs_review', reply_text: text, log: 'Ղեկավարի պատասխանը պետք է դիտել' } });
      notifyMe('Պետք է նայել՝ ' + (tp.managerName || 'ղեկավարը') + '-ը պատասխանել է — ' + run.client + ' ' + monthHy(run.month),
        summary + '\n\nՀաշիվները դեռ չեմ ուղարկել հաշվապահին։ Ուղղեք կայքում (Հաշիվներ → ' + run.client + ' → ' + run.month.slice(0, 4) + ') և սեղմեք «Ուղարկել հաշվապահին»։\nhttps://www.arm-equipment.com/portal');
    }
  });
}

/* 1st of the month after 9:00 Yerevan → last month's summary */
function monthStartSummary(cfg) {
  var now = new Date();
  if (Utilities.formatDate(now, TZ, 'd') !== '1' || +Utilities.formatDate(now, TZ, 'H') < 9 || !cfg.summaryTo) return;
  var ym = ymNow(-1), key = 'SUM_' + ym;
  if (P.getProperty(key)) return;
  P.setProperty(key, '1');
  var s = summaryEmail(ym);
  GmailApp.sendEmail(cfg.summaryTo, s.subject, s.text, { htmlBody: s.html, name: SENDER_NAME });
}

function summaryEmail(ym) {
  var d = rpc('bot_month_summary', { ym: ym });
  var title = MONTHS_HY[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);
  var td = 'style="padding:6px 10px;border-bottom:1px solid #e3e3e3"';
  var tdr = 'style="padding:6px 10px;border-bottom:1px solid #e3e3e3;text-align:right;white-space:nowrap"';
  var th = 'style="text-align:left;padding:6px 10px;border-bottom:2px solid #c9a24a;font-size:12px;color:#555"';
  var h = '<div style="font-family:Arial,sans-serif;color:#14284b;max-width:640px"><h2 style="margin:0 0 4px">ArmEquipment — ' + esc(title) + '</h2>' +
    '<p style="margin:0 0 16px;color:#555">' + d.count + ' հաշիվ · ' + d.days + ' աշխատանքային օր</p><p style="font-size:26px;font-weight:bold;margin:0 0 18px">' + fmt(d.total) + ' դր.</p>' +
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
  h += '</table><h3>Հաշիվներ</h3><table style="border-collapse:collapse;width:100%"><tr><th ' + th + '>#</th><th ' + th + '>Կազմակերպություն</th><th ' + th + '>Ամսաթիվ</th><th ' + th + '>Գումար</th></tr>';
  t += '\nՀաշիվներ\n';
  (d.invoices || []).forEach(function (v) {
    var dt = dmy(v.start) + (v.end && v.end !== v.start ? ' – ' + dmy(v.end) : '');
    h += '<tr><td ' + td + '>' + esc(v.num) + '</td><td ' + td + '>' + esc(v.client) + '</td><td ' + td + '>' + dt + '</td><td ' + tdr + '>' + fmt(v.total) + '</td></tr>';
    t += '#' + v.num + '  ' + v.client + '  ' + dt + '  ' + fmt(v.total) + ' դր.\n';
  });
  h += '</table><p style="margin-top:20px"><a href="https://www.arm-equipment.com/portal" style="color:#14284b">Բացել կայքում</a></p></div>';
  if (!d.count) { h = '<p style="font-family:Arial">' + esc(title) + '՝ հաշիվներ չկան։</p>'; t = title + ': հաշիվներ չկան։'; }
  return { subject: 'ArmEquipment — ամսվա ամփոփում ' + title + ' — ' + fmt(d.total) + ' դր.', html: h, text: t };
}

/* invoices that arrive or are sent by email (mostly from Hilton staff) */
function importFromGmail(cfg) {
  if (cfg.gmailImport === false) return;
  var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  var runThreads = (cfg.runs || []).map(function (r) { return r.thread_id; });
  var q = 'has:attachment filename:docx after:' + P.getProperty('IMPORT_SINCE') + ' -label:' + LABEL.replace('/', '-');
  GmailApp.search(q, 0, 30).forEach(function (th) {
    if (runThreads.indexOf(th.getId()) >= 0) return;          // handled by checkReplies
    var ok = true, me = myEmail();
    th.getMessages().forEach(function (msg) {
      var fromMe = String(msg.getFrom()).toLowerCase().indexOf(me) >= 0;
      msg.getAttachments().forEach(function (a) {
        var name = a.getName();
        if (!/\.docx$/i.test(name) || !/invoice|հաշիվ/i.test(name) || /invoice\s*0+\s*-/i.test(name)) return;
        try {
          var p = parseInvoice(docxXml(a), name, msg.getDate(), (msg.getTo() || '') + ' ' + (msg.getFrom() || ''), cfg.clients || []);
          if (!p) return;
          p.gmail_id = msg.getId() + '/' + name;
          p.note = 'Gmail՝ «' + msg.getSubject() + '», ' + String(msg.getFrom()).replace(/<.*>/, '').trim() + ', ' + Utilities.formatDate(msg.getDate(), TZ, 'dd.MM.yyyy');
          p.status = fromMe ? 'manager' : 'draft';
          Logger.log(name + ' → ' + rpc('bot_add_invoice', { p: p }));
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

/* ---------- reading an invoice .docx ---------- */
function xmlText(s) {
  return s.replace(/<w:tab\/>/g, ' ').replace(/<\/w:p>/g, ' ').replace(/<w:br\/>/g, ' ')
    .replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/[ \s]+/g, ' ').trim();
}
function toInt(s) {
  var m = String(s || '').replace(/[  ,]/g, '').match(/\d+(?:\.\d{3})*/);
  return m ? parseInt(m[0].replace(/\./g, ''), 10) : null;
}
function parseInvoice(xml, fileName, sentDate, people, knownClients) {
  var paras = xmlText(xml.replace(/<w:tbl>[\s\S]*?<\/w:tbl>/g, ' ')), all = xmlText(xml), rows = [];
  (xml.match(/<w:tr[ >][\s\S]*?<\/w:tr>/g) || []).forEach(function (tr) { rows.push((tr.match(/<w:tc>[\s\S]*?<\/w:tc>/g) || []).map(xmlText)); });
  var nm = paras.match(/#\s*(\d+)/) || fileName.match(/invoice\s*(\d+)/i);
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
    if (c.length >= 6) { name = c[3] || c[0]; up = c[1]; q = c[2]; lt = c[5]; } else { name = c[0]; up = c[1]; q = c[2]; lt = c[4]; }
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
  var d = fileDates(fileName, sentDate);
  return { num: nm ? nm[1] : '', client: clientOf(all + ' ' + fileName + ' ' + people, knownClients), lines: lines,
           start_date: d ? d.start : null, end_date: d ? d.end : null,
           month: d ? d.start.slice(0, 7) : sentDate.getFullYear() + '-' + docxPad(sentDate.getMonth() + 1) };
}
function fileDates(fileName, sentDate) {
  var m = fileName.replace(/docx/gi, ' ').match(/(\d{1,2})[.\-](\d{1,2})(?:[.\-](\d{1,2}))?\.?\s*(20\d\d)/);
  if (!m) return null;
  var y = +m[4], a = +m[1], b = +m[2], c = m[3] ? +m[3] : null;
  var sep1 = fileName.charAt(fileName.indexOf(m[0]) + m[1].length), sm = sentDate ? sentDate.getMonth() + 1 : null, mon, d1, d2;
  if (c != null) {
    if (sep1 === '-') { d1 = a; d2 = b; mon = c; } else { mon = a; d1 = b; d2 = c; }
    if (mon > 12) { var x = mon; mon = d1; d1 = x; }
  } else {
    var aIsMonth;
    if (a > 12) aIsMonth = false;
    else if (b > 12) aIsMonth = true;
    else if (sm && b === sm && a !== sm) aIsMonth = false;
    else if (sm && a !== sm && Math.abs(b - sm) < Math.abs(a - sm)) aIsMonth = false;
    else aIsMonth = true;
    if (aIsMonth) { mon = a; d1 = d2 = b; } else { mon = b; d1 = d2 = a; }
  }
  if (mon < 1 || mon > 12) return null;
  var last = new Date(y, mon, 0).getDate();
  d1 = Math.min(Math.max(d1, 1), last); d2 = Math.min(Math.max(d2 || d1, d1), last);
  return { start: y + '-' + docxPad(mon) + '-' + docxPad(d1), end: y + '-' + docxPad(mon) + '-' + docxPad(d2) };
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

/* ---------- Word file (same code as the website's invoice-docx.js) ---------- */
//@@DOCX@@
