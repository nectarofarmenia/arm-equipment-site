/**
 * ArmEquipment — Gmail robot (Google Apps Script inside armequipment@gmail.com)
 *
 *  every 5 min   sends what the website queued (notifications, invoices, summaries)
 *  every 10 min  reads Gmail: equipment requests from Hilton staff → draft invoices (unchecked) on the website;
 *                new/changed invoices (.xlsx / .docx) → website, with a notification
 *                checks the manager's reply to the month-end email:
 *                  approval and/or corrected invoices → invoices updated → sent to the accountant
 *                  anything unclear → you get an email and decide on the website
 *                the accountant's reply → marked done; no reply after N days → polite reminder (follow-up)
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
  if (!P.getProperty('REQ_SINCE')) P.setProperty('REQ_SINCE', Utilities.formatDate(new Date(), TZ, 'yyyy/MM/01'));
  rpc('bot_settings');               // checks the password
  invoiceBlob({ num: '000', lines: [] }, {}, []);   // checks that Excel files can be made
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
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1);
}
function monthEn(ym) { return MONTHS_EN[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4); }
function monthHy(ym) { return ym.slice(0, 4) + ' թ. ' + MONTHS_HY_GEN[+ym.slice(5, 7) - 1]; }
function myEmail() { return (Session.getEffectiveUser().getEmail() || '').toLowerCase(); }

function pad2(n) { return (n < 10 ? '0' : '') + n; }
var LOGO_BLOB = null;
function logoBlob() {
  if (LOGO_BLOB === null) {
    try { var r = UrlFetchApp.fetch('https://www.arm-equipment.com/favicon-192.png', { muteHttpExceptions: true }); LOGO_BLOB = r.getResponseCode() === 200 ? r.getBlob() : false; }
    catch (e) { LOGO_BLOB = false; }
  }
  return LOGO_BLOB;
}
/* the invoice as a styled Excel file with live formulas */
function invoiceBlob(v, tp, eq) {
  var logo = logoBlob(), parts = xlsxParts(v, tp, eq || [], !!logo), blobs = [];
  for (var k in parts) blobs.push(Utilities.newBlob(parts[k], 'application/xml', k));
  if (logo) blobs.push(logo.copyBlob().setName('xl/media/logo.png'));
  var name = xlsxFileName(v);
  return Utilities.zip(blobs, name).setContentType('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet').setName(name);
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
/* site-style frame for emails: logo, gold rule, footer */
function brandWrap(inner) {
  return '<div style="background:#f3efe3;padding:24px 12px"><table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:10px;overflow:hidden;border:1px solid #e6dcc3">' +
    '<tr><td style="padding:18px 24px 14px"><a href="https://www.arm-equipment.com"><img src="https://www.arm-equipment.com/email-logo.png" width="200" height="32" alt="ARMEQUIPMENT" style="display:block;border:0"></a></td></tr>' +
    '<tr><td style="height:4px;background:#c9a24a;line-height:4px;font-size:0">&nbsp;</td></tr>' +
    '<tr><td style="padding:22px 24px;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5;color:#14284b">' + inner + '</td></tr>' +
    '<tr><td style="background:#14284b;padding:12px 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#d9d2bf">Berry Line ՍՊԸ · <a href="mailto:armequipment@gmail.com" style="color:#c9a24a;text-decoration:none">armequipment@gmail.com</a> · <a href="https://www.arm-equipment.com" style="color:#c9a24a;text-decoration:none">arm-equipment.com</a></td></tr>' +
    '</table></div>';
}
function sendWithThread(to, subject, text, html, attachments) {
  var d = GmailApp.createDraft(to, subject, text, { htmlBody: brandWrap(html), attachments: attachments, name: SENDER_NAME });
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
        else if (p[0] === 'followup_manager') followUp('manager', p[1], p[2], cfg, true);
        else if (p[0] === 'followup_accountant') followUp('accountant', p[1], p[2], cfg, true);
      } else {
        var o = { name: SENDER_NAME };
        if (m.html) o.htmlBody = m.html;
        if (m.cc) o.cc = m.cc;
        if (m.reply_to) o.replyTo = m.reply_to;
        if (m.invoice_id) {
          var inv = rpc('bot_invoices', { p: { ids: [m.invoice_id] } })[0];
          var st = rpc('bot_settings');
          if (inv) o.attachments = [invoiceBlob(inv, st.tpl || {}, st.equipment)];
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
  try { checkAccountantReplies(cfg); } catch (e) { Logger.log('accountant replies: ' + e); }
  try { followUps(cfg); } catch (e) { Logger.log('followUps: ' + e); }
  try { importRequests(cfg); } catch (e) { Logger.log('requests: ' + e); }
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
  var unchecked = (rpc('bot_invoices', { p: { client: client, month: ym } }) || []).filter(function (v) { return v.checked === false; });
  if (unchecked.length) {
    notifyMe('Ամսվա վերջ՝ ' + unchecked.length + ' հաշիվ դեռ չստուգված — ' + client + ' ' + monthHy(ym),
      'Էմմային դեռ չեմ ուղարկել, որովհետև ' + unchecked.length + ' հաշիվ ստեղծվել է նամակներից և դեռ չեք ստուգել (' +
      unchecked.map(function (v) { return '#' + v.num; }).join(', ') + ')։\nԲացեք կայքը → Նամակագրություն, ստուգեք և սեղմեք «Ուղարկել Էմմային»։\nhttps://www.arm-equipment.com/portal');
    return;
  }
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
  var threadId = sendWithThread(tp.managerEmail, subject, text, html, invs.map(function (v) { return invoiceBlob(v, tp, cfg.equipment); }));
  rpc('bot_set_status', { ids: invs.map(function (v) { return v.id; }), new_status: 'manager' });
  var nowIso = new Date().toISOString();
  rpc('bot_run', { p: { client: client, month: ym, status: 'sent_to_manager', thread_id: threadId, invoice_count: invs.length, total: tb.total,
    manager_sent_at: nowIso, manager_last_at: nowIso, manager_followups: 0, log: 'Ուղարկվեց ղեկավարին (' + tp.managerEmail + ')' } });
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
  var accThread = sendWithThread(tp.accountantEmail, subject, text, html, invs.map(function (v) { return invoiceBlob(v, tp, cfg.equipment); }));
  rpc('bot_set_status', { ids: invs.map(function (v) { return v.id; }), new_status: 'accountant' });
  var nowIso = new Date().toISOString();
  P.setProperty('ARUN_' + accThread, String(new Date().getTime()));
  rpc('bot_run', { p: { client: client, month: ym, status: 'sent_to_accountant', invoice_count: invs.length, total: tb.total, accountant_thread_id: accThread,
    accountant_sent_at: nowIso, accountant_last_at: nowIso, accountant_followups: 0, log: 'Ուղարկվեց հաշվապահին (' + tp.accountantEmail + ')' + (why ? '. ' + why.split('\n')[0] : '') } });
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
    if (run.status !== 'sent_to_manager' || !run.thread_id) return;
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
        if (!/\.(docx|xlsx)$/i.test(a.getName())) return;
        try {
          var p = readAttachment(a, msg.getDate(), run.client, cfg.clients || []);
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
    var text = texts.join('\n---\n'), tp = cfg.tpl || {}, replyAt = news[news.length - 1].getDate().toISOString();
    var approved = APPROVE_RE.test(text), changes = CHANGE_RE.test(text);
    var summary = (updated.length ? 'Ուղղված հաշիվներ՝ ' + updated.join(', ') + '\n' : '') + 'Պատասխան՝\n' + (text || '(առանց տեքստի)');
    if ((approved || updated.length) && !(changes && !updated.length) && tp.accountantAuto !== false) {
      rpc('bot_run', { p: { client: run.client, month: run.month, status: 'sent_to_manager', reply_text: text, manager_reply_at: replyAt, log: 'Ղեկավարը հաստատեց' + (updated.length ? ', ուղղումներ՝ ' + updated.join(', ') : '') } });
      sendToAccountant(run.client, run.month, cfg, 'Ղեկավարը հաստատեց։ ' + summary);
    } else {
      rpc('bot_run', { p: { client: run.client, month: run.month, status: 'needs_review', reply_text: text, manager_reply_at: replyAt, log: 'Ղեկավարի պատասխանը պետք է դիտել' } });
      notifyMe('Պետք է նայել՝ ' + (tp.managerName || 'ղեկավարը') + '-ը պատասխանել է — ' + run.client + ' ' + monthHy(run.month),
        summary + '\n\nՀաշիվները դեռ չեմ ուղարկել հաշվապահին։ Ուղղեք կայքում (Հաշիվներ → ' + run.client + ' → ' + run.month.slice(0, 4) + ') և սեղմեք «Ուղարկել հաշվապահին»։\nhttps://www.arm-equipment.com/portal');
    }
  });
}

/* the accountant's reply → the month is done */
function checkAccountantReplies(cfg) {
  var me = myEmail(), tp = cfg.tpl || {};
  (cfg.runs || []).forEach(function (run) {
    if (run.status !== 'sent_to_accountant' || !run.accountant_thread_id || run.accountant_reply_at) return;
    var th = GmailApp.getThreadById(run.accountant_thread_id);
    if (!th) return;
    var since = +(P.getProperty('ARUN_' + run.accountant_thread_id) || new Date(run.accountant_sent_at).getTime());
    var news = th.getMessages().filter(function (m) { return m.getDate().getTime() > since && String(m.getFrom()).toLowerCase().indexOf(me) < 0; });
    if (!news.length) return;
    var last = news[news.length - 1], text = replyText(last);
    rpc('bot_run', { p: { client: run.client, month: run.month, status: 'done', accountant_reply_at: last.getDate().toISOString(), accountant_reply_text: text, log: 'Հաշվապահը պատասխանեց' } });
    notifyMe('Հաշվապահը պատասխանեց — ' + run.client + ' ' + monthHy(run.month), (tp.accountantName || 'Հաշվապահ') + '՝\n\n' + (text || '(առանց տեքստի)'));
  });
}

/* no answer after N days → polite reminder in the same conversation (weekdays, 10:00–18:00 Yerevan) */
function followUps(cfg) {
  var now = new Date(), dow = +Utilities.formatDate(now, TZ, 'u'), hr = +Utilities.formatDate(now, TZ, 'H');
  if (dow > 5 || hr < 10 || hr >= 18) return;
  (cfg.runs || []).forEach(function (run) {
    if (run.status === 'sent_to_manager' && !run.manager_reply_at) followUp('manager', run.client, run.month, cfg, false, run);
    if (run.status === 'sent_to_accountant' && !run.accountant_reply_at) followUp('accountant', run.client, run.month, cfg, false, run);
  });
}
function followUp(who, client, ym, cfg, force, run) {
  var tp = cfg.tpl || {}, days = +(tp.followupDays || 3), max = +(tp.followupMax || 2);
  run = run || (cfg.runs || []).filter(function (r) { return r.client === client && r.month === ym; })[0];
  if (!run) throw new Error('no run for ' + client + ' ' + ym);
  var mgr = who === 'manager', lastAt = new Date(run[who + '_last_at'] || run[who + '_sent_at'] || run.sent_at).getTime(), n = +(run[who + '_followups'] || 0);
  if (!force) {
    if (Date.now() - lastAt < days * 24 * 3600 * 1000) return;
    if (n >= max) {
      var key = 'GIVEUP_' + who + '_' + client + '_' + ym;
      if (!P.getProperty(key)) {
        P.setProperty(key, '1');
        notifyMe('Պատասխան չկա՝ ' + (mgr ? tp.managerName || 'ղեկավար' : tp.accountantName || 'հաշվապահ') + ' — ' + client + ' ' + monthHy(ym),
          n + ' հիշեցումից հետո էլ պատասխան չկա։ Կարող եք զանգել կամ կայքում «Նամակագրություն» էջից ուղարկել ևս մեկ հիշեցում։');
      }
      return;
    }
  }
  var to = mgr ? tp.managerEmail : tp.accountantEmail;
  if (!to) throw new Error((mgr ? 'manager' : 'accountant') + ' email is empty');
  var invs = (rpc('bot_invoices', { p: { client: client, month: ym } }) || []).filter(function (v) { return mgr ? v.status !== 'accountant' : v.status !== 'draft'; });
  var tb = invoiceTable(invs, mgr ? 'en' : 'hy'), subject, text, html, sign;
  if (mgr) {
    var last = String(tp.managerName || '').trim().split(/\s+/).pop();
    subject = 'Re: ArmEquipment — ' + monthEn(ym) + ' invoices for your review and approval';
    sign = 'Kind regards,\n' + (tp.signerEn || 'Armen Sargsyan') + '\nArmEquipment · Berry Line LLC';
    var body = (last ? 'Dear Ms. ' + last + ',' : 'Dear Madam or Sir,') + '\n\nA gentle reminder about our invoices for ' + monthEn(ym) + ' (' + invs.length + ' invoices, total ' + fmt(tb.total) +
      ' AMD), sent on ' + dmy(run.manager_sent_at || run.sent_at) + '. Could you please review and confirm your approval, or let us know if anything needs to be changed? The invoices are attached again for your convenience.';
    text = body + '\n\n' + tb.text + '\n' + sign;
    html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#14284b"><p>' + esc(body).replace(/\n/g, '<br>') + '</p>' + tb.html + '<p>' + esc(sign).replace(/\n/g, '<br>') + '</p></div>';
  } else {
    var first = String(tp.accountantName || '').trim().split(/\s+/)[0];
    subject = 'Re: ' + client + ' — ' + monthHy(ym) + ' — հաշիվներ դուրս գրելու համար';
    sign = 'Շնորհակալություն,\n' + (tp.signer || 'Արմեն Սարգսյան') + '\nArmEquipment · Berry Line ՍՊԸ';
    var bodyHy = 'Բարև Ձեզ' + (first ? ', ' + first : '') + ',\n\nՀիշեցնում եմ ' + client + '-ի ' + monthHy(ym) + ' ամսվա հաշիվների մասին (' + invs.length + ' հաշիվ, ընդհանուր՝ ' + fmt(tb.total) +
      ' դր.), որոնք ուղարկել էի ' + dmy(run.accountant_sent_at) + '-ին։ Խնդրում եմ տեղեկացնել, երբ հաշիվները դուրս գրվեն։ Հաշիվները կրկին կցված են։';
    text = bodyHy + '\n\n' + tb.text + '\n' + sign;
    html = '<div style="font-family:Arial,sans-serif;font-size:14px;color:#14284b"><p>' + esc(bodyHy).replace(/\n/g, '<br>') + '</p>' + tb.html + '<p>' + esc(sign).replace(/\n/g, '<br>') + '</p></div>';
  }
  GmailApp.sendEmail(to, subject, text, { htmlBody: brandWrap(html), name: SENDER_NAME, attachments: invs.map(function (v) { return invoiceBlob(v, tp, cfg.equipment); }) });
  var f = {}; f.client = client; f.month = ym; f[who + '_followups'] = n + 1; f[who + '_last_at'] = new Date().toISOString();
  f.log = 'Հիշեցում #' + (n + 1) + ' ուղարկվեց ' + (mgr ? 'ղեկավարին' : 'հաշվապահին') + ' (' + to + ')';
  rpc('bot_run', { p: f });
  run[who + '_followups'] = n + 1; run[who + '_last_at'] = f[who + '_last_at'];
}

/* ---------- equipment requests (text emails from Hilton staff) → draft invoices ---------- */
var REQ_ITEMS = [
  { code: 'tv',       name: 'TV Հեռուստացույց',                    re: /\btv\b|television|հեռուստացույց|телевизор/i },
  { code: 'tmic',     name: 'Table microphone Սեղանի միկրոֆոն',     re: /table\s*mic|desk\s*mic|conference\s*mic|gooseneck|սեղանի\s*միկր|լարով\s*միկր|wired\s*mic|настольн/i },
  { code: 'hmic',     name: 'Clip microphone Կլիպ միկրոֆոն',        re: /clip|lapel|lavalier|lavalier|head\s*(set\s*)?mic|headset\s*mic|կլիպ|գլխի\s*միկր|петличк/i },
  { code: 'wmic',     name: 'Wireless microphone Անլար միկրոֆոն',   re: /wireless\s*mic|hand\s*held|radio\s*mic|cordless\s*mic|անլար\s*միկր|беспроводн|радиомикр/i },
  { code: 'rx',       name: 'Headphone Ականջակալ',                  re: /head\s*phone|receiver|ear\s*phone|ականջակալ|ընդունիչ|наушник|приемник/i },
  { code: 'booth',    name: 'Interpreter booth Թարգմանչական խցիկ',   re: /booth|խցիկ|кабин/i },
  { code: 'sound',    name: 'Sound system/ ձայնային համակարգ',      re: /sound\s*system|speaker|pa\s*system|ձայնային\s*համակարգ|բարձրախոս|звук|колонк/i },
  { code: 'zoom',     name: 'Zoom system',                          re: /zoom|online\s*(meeting|conference)|hybrid/i },
  { code: 'cam',      name: 'HD camera Տեսախցիկ',                   re: /camera|տեսախցիկ|камер/i },
  { code: 'proj',     name: 'Projector Պրոյեկտոր',                  re: /projector|պրոյեկտոր|проектор/i },
  { code: 'screen',   name: 'Screen Էկրան',                         re: /screen|էկրան|экран/i },
  { code: 'pc',       name: 'Laptop Նոութբուք',                     re: /laptop|notebook|computer|նոութբուք|համակարգիչ|ноутбук/i },
  { code: 'rec',      name: 'Audio recording Ձայնագրություն',       re: /record|ձայնագր|запис/i },
  { code: 'prompter', name: 'Teleprompter Սուֆլոր',                 re: /prompter|սուֆլոր|суфлер/i },
  { code: 'tmic',     name: 'Table microphone Սեղանի միկրոֆոն',     re: /\bmic(rophone)?s?\b|միկրոֆոն|микрофон/i }
];
var REQ_HINT = /equipment|provide|arrange|request|order|booking|interpret|headphone|microphone|sound|booth|projector|screen|zoom|camera|սարքավոր|տեխնիկա|պատվեր|оборудован/i;
var MONTH_WORDS = [
  ['jan', 'հունվ', 'январ', 'янв'], ['feb', 'փետր', 'феврал', 'фев'], ['mar', 'մարտ', 'март', 'мар'], ['apr', 'ապրիլ', 'апрел', 'апр'],
  ['may', 'մայիս', 'ма[йя]'], ['jun', 'հունիս', 'июн'], ['jul', 'հուլիս', 'июл'], ['aug', 'օգոստ', 'август', 'авг'],
  ['sep', 'սեպտ', 'сентябр', 'сен'], ['oct', 'հոկտ', 'октябр', 'окт'], ['nov', 'նոյեմ', 'ноябр', 'ноя'], ['dec', 'դեկտ', 'декабр', 'дек']];

function reqDates(text, sentDate) {
  var found = [], t = ' ' + String(text).toLowerCase() + ' ';
  MONTH_WORDS.forEach(function (w, mi) {
    var mw = '(?:' + w.join('|') + ')[\\wա-ֆа-я]*';
    var d = '(\\d{1,2})(?:st|nd|rd|th)?', rng = d + '(?:\\s*(?:-|–|/|&|,|and|և|и)\\s*' + d + ')?';
    var a = new RegExp(mw + '\\.?\\s+' + rng + '(?!\\d)', 'g'), b = new RegExp('(?:^|[^\\d])' + rng + '\\s+' + mw, 'g'), m;
    while ((m = a.exec(t))) { found.push([mi + 1, +m[1]]); if (m[2]) found.push([mi + 1, +m[2]]); }
    while ((m = b.exec(t))) { found.push([mi + 1, +m[1]]); if (m[2]) found.push([mi + 1, +m[2]]); }
  });
  var re = /(?:^|[^\d.:])(\d{1,2})\.(\d{1,2})(?:\.(\d{2,4}))?(?![\d:])/g, m2;
  while ((m2 = re.exec(t))) { var dd = +m2[1], mm = +m2[2]; if (mm >= 1 && mm <= 12 && dd >= 1 && dd <= 31) found.push([mm, dd, m2[3] ? (m2[3].length === 2 ? 2000 + +m2[3] : +m2[3]) : null]); }
  found = found.filter(function (f) { return f[1] >= 1 && f[1] <= 31; });
  if (!found.length) return null;
  var cnt = {}; found.forEach(function (f) { cnt[f[0]] = (cnt[f[0]] || 0) + 1; });
  var mon = +Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a]; })[0];
  var days = found.filter(function (f) { return f[0] === mon; }).map(function (f) { return f[1]; });
  var yr = (found.filter(function (f) { return f[0] === mon && f[2]; })[0] || [])[2];
  var sy = sentDate.getFullYear(), sm = sentDate.getMonth() + 1;
  if (!yr) yr = mon < sm - 6 ? sy + 1 : (mon > sm + 6 ? sy - 1 : sy);
  var last = new Date(yr, mon, 0).getDate();
  var d1 = Math.min(Math.min.apply(null, days), last), d2 = Math.min(Math.max.apply(null, days), last);
  if (d2 - d1 > 10) d2 = d1;
  return { start: yr + '-' + pad2(mon) + '-' + pad2(d1), end: yr + '-' + pad2(mon) + '-' + pad2(d2), month: yr + '-' + pad2(mon) };
}

function parseRequest(subject, body, sentDate, equipment, lastPrices) {
  var priceOf = {}; (equipment || []).forEach(function (e) { if (e.price != null) priceOf[e.code] = e.price; });
  var monRe = new RegExp('(?:' + MONTH_WORDS.map(function (w) { return w.join('|'); }).join('|') + ')[\\wա-ֆа-я]*\\.?\\s*\\d{1,2}(?:\\s*[-–]\\s*\\d{1,2})?|\\d{1,2}(?:\\s*[-–]\\s*\\d{1,2})?\\s+(?:' + MONTH_WORDS.map(function (w) { return w.join('|'); }).join('|') + ')[\\wա-ֆа-я]*', 'ig');
  var dated = false;
  var segs = String(body || '').split(/\r?\n|;|,(?!\d)|\s+and\s+|\s+և\s+/i), lines = [], seen = {};
  segs.forEach(function (seg) {
    var s = seg.trim(); if (!s || s.length > 220) return;
    var it = null;
    for (var i = 0; i < REQ_ITEMS.length; i++) if (REQ_ITEMS[i].re.test(s)) { it = REQ_ITEMS[i]; break; }
    if (!it) return;
    var price = null, pm = s.match(/(?:amd|դր\.?|dram|драм)\s*([\d][\d\s.,]*\d|\d)/i) || s.match(/([\d][\d\s.,]*\d|\d)\s*(?:amd|դր|dram|драм)/i);
    if (pm) price = toInt(pm[1]);
    var hasDate = monRe.test(s) || /\b\d{1,2}\.\d{1,2}\b/.test(s); monRe.lastIndex = 0;
    if (hasDate) dated = true;
    var rest = s.replace(monRe, ' ').replace(/(?:amd|դր\.?|dram|драм)\s*[\d][\d\s.,]*/ig, ' ').replace(/[\d][\d\s.,]*\s*(?:amd|դր|dram|драм)/ig, ' ')
      .replace(/\d{1,2}[.:]\d{2}(?:[.:]\d{2,4})?/g, ' ').replace(/\b20\d\d\b/g, ' ');
    var qm = rest.match(/(\d+)\s*(?:pcs|pieces|items|units|sets|հատ|шт|x\b|×)/i) || rest.match(/(?:x|×|qty:?|quantity:?)\s*(\d+)/i) || rest.match(/(\d+)/);
    var qty = qm ? +qm[1] : 1; if (!(qty > 0 && qty <= 2000)) qty = 1;
    if (price == null) price = priceOf[it.code] != null ? priceOf[it.code] : ((lastPrices || {})[it.name.toLowerCase()] || 0);
    var key = it.code + '|' + price;
    if (seen[key] != null) { var L = lines[seen[key]]; L.qty = (hasDate || L.dated) ? L.qty + qty : Math.max(L.qty, qty); return; }
    seen[key] = lines.length;
    lines.push({ name: it.name, price: price, qty: qty, dated: hasDate });
  });
  var d = reqDates(subject, sentDate) || reqDates(body, sentDate);
  var k = d ? Math.round((new Date(d.end) - new Date(d.start)) / 864e5) + 1 : 1;
  lines.forEach(function (l) {
    if (k > 1 && !dated) { l.qty *= k; l.name += ' (×' + k + ' օր)'; }
    delete l.dated;
  });
  return { lines: lines, dates: d };
}

function importRequests(cfg) {
  var tp = cfg.tpl || {}, me = myEmail();
  if (!P.getProperty('REQ_SINCE')) P.setProperty('REQ_SINCE', Utilities.formatDate(new Date(), TZ, 'yyyy/MM/01'));
  var domains = String(tp.requestDomains || 'hilton.com').split(/[\s,]+/).filter(String);
  if (!domains.length) return;
  var runThreads = (cfg.runs || []).map(function (r) { return r.thread_id; });
  var q = '(' + domains.map(function (d) { return 'from:' + d; }).join(' OR ') + ') after:' + P.getProperty('REQ_SINCE') + ' -subject:invoice -subject:invoices';
  var added = [];
  GmailApp.search(q, 0, 40).forEach(function (th) {
    if (runThreads.indexOf(th.getId()) >= 0) return;
    var key = 'REQT_' + th.getId(), lastSeen = +(P.getProperty(key) || 0);
    var ext = th.getMessages().filter(function (m) {
      var f = String(m.getFrom()).toLowerCase();
      return f.indexOf(me) < 0 && domains.some(function (d) { return f.indexOf(d.toLowerCase()) >= 0; });
    });
    if (!ext.length || ext[ext.length - 1].getDate().getTime() <= lastSeen) return;
    var subject = th.getFirstMessageSubject() || '', best = null;
    for (var i = ext.length - 1; i >= 0; i--) {
      var body = replyText(ext[i]);
      if (!REQ_HINT.test(subject + ' ' + body)) continue;
      var r = parseRequest(subject, body, ext[i].getDate(), cfg.equipment, cfg.lastPrices);
      if (r.lines.length) { best = { r: r, msg: ext[i] }; break; }
    }
    P.setProperty(key, String(ext[ext.length - 1].getDate().getTime()));
    if (!best) return;
    var d = best.r.dates, sd = best.msg.getDate();
    var from = String(best.msg.getFrom()).replace(/<.*>/, '').replace(/"/g, '').trim();
    var p = { thread_id: th.getId(), client: clientOf(from + ' ' + best.msg.getFrom(), cfg.clients || []) === 'Այլ' ? (tp.workflowClient || 'Hilton') : clientOf(from + ' ' + best.msg.getFrom(), cfg.clients || []),
      start_date: d ? d.start : Utilities.formatDate(sd, TZ, 'yyyy-MM-dd'), end_date: d ? d.end : Utilities.formatDate(sd, TZ, 'yyyy-MM-dd'),
      month: d ? d.month : Utilities.formatDate(sd, TZ, 'yyyy-MM'), lines: best.r.lines,
      note: 'Ավտոմատ՝ պատվերի նամակից, չստուգված։ «' + subject + '», ' + from + ', ' + Utilities.formatDate(sd, TZ, 'dd.MM.yyyy') +
            (best.r.lines.some(function (l) { return !l.price; }) ? '։ Ուշադրություն՝ որոշ տողերի գինը հայտնի չէ։' : '') };
    var res = rpc('bot_add_request', { p: p });
    if (/^(added|updated)/.test(res)) added.push((/^added/.test(res) ? 'Նոր' : 'Թարմացված') + ' #' + res.split(':')[1] + ' — ' + dmy(p.start_date) + ' — ' + fmt(invTotal(p)) + ' դր. — «' + subject + '»');
  });
  if (added.length) notifyMe('Հաշվի սևագրեր պատվերի նամակներից (' + added.length + ')',
    added.join('\n') + '\n\nՍտուգեք և պահպանեք կայքում (Նամակագրություն կամ Հաշիվներ)՝ https://www.arm-equipment.com/portal');
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
  return { subject: 'ArmEquipment — ամսվա ամփոփում ' + title + ' — ' + fmt(d.total) + ' դր.', html: brandWrap(h), text: t };
}

/* invoices that arrive or are sent by email (mostly from Hilton staff) */
function importFromGmail(cfg) {
  if (cfg.gmailImport === false) return;
  var label = GmailApp.getUserLabelByName(LABEL) || GmailApp.createLabel(LABEL);
  var runThreads = (cfg.runs || []).map(function (r) { return r.thread_id; });
  var q = 'has:attachment {filename:docx filename:xlsx} after:' + P.getProperty('IMPORT_SINCE') + ' -label:' + LABEL.replace('/', '-');
  GmailApp.search(q, 0, 30).forEach(function (th) {
    if (runThreads.indexOf(th.getId()) >= 0) return;          // handled by checkReplies
    var ok = true, me = myEmail();
    th.getMessages().forEach(function (msg) {
      var fromMe = String(msg.getFrom()).toLowerCase().indexOf(me) >= 0;
      msg.getAttachments().forEach(function (a) {
        var name = a.getName();
        if (!/\.(docx|xlsx)$/i.test(name) || !/invoice|հաշիվ/i.test(name) || /invoice\s*0+\s*-/i.test(name)) return;
        try {
          var p = readAttachment(a, msg.getDate(), (msg.getTo() || '') + ' ' + (msg.getFrom() || ''), cfg.clients || []);
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

/* .xlsx made by this system (read back from its hidden id column) or an older-style .docx */
function readAttachment(a, sentDate, people, clients) {
  var name = a.getName();
  if (/\.xlsx$/i.test(name)) {
    var files = Utilities.unzip(a.copyBlob().setContentType('application/zip')), sheet = '', shared = '';
    files.forEach(function (f) {
      if (f.getName() === 'xl/worksheets/sheet1.xml') sheet = f.getDataAsString('UTF-8');
      if (f.getName() === 'xl/sharedStrings.xml') shared = f.getDataAsString('UTF-8');
    });
    var r = sheet ? xlsxReadInvoice(sheet, shared) : null;
    if (!r || !r.lines.length) return null;
    if (!r.client) r.client = clientOf(people + ' ' + name, clients);
    return r;
  }
  return parseInvoice(docxXml(a), name, sentDate, people, clients);
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
           month: d ? d.start.slice(0, 7) : sentDate.getFullYear() + '-' + pad2(sentDate.getMonth() + 1) };
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

/* ---------- Excel invoice (same code as the website's invoice-xlsx.js) ---------- */
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
