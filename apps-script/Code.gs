/**
 * Цагийн ажлын бүртгэл — Google Apps Script backend.
 *
 * Script properties (Project Settings → Script properties):
 *   ADMIN_PASSWORD  заавал. Admin dashboard-ын нууц үг.
 *   NOTIFY_EMAIL    сонголттой. Шинэ анкетын мэдэгдэл очих имэйл. Хоосон бол таны Google имэйл, "off" бол илгээхгүй.
 *   ADMIN_URL       сонголттой. Мэдэгдэл имэйлд оруулах dashboard линк.
 */

// Script нь Sheet-ээс тусдаа (script.google.com дээр) үүссэн бол Sheet-ийн ID-г энд тавина.
// Sheet-ийн Extensions → Apps Script-ээр үүсгэсэн бол хоосон үлдээнэ.
const SPREADSHEET_ID = '1UnM0vId0e1R1_pNm5zY1L_NJQB3C4xItt15kzBZ_qBg';
const SHEET_NAME = 'Бүртгэл';
const COLS = [
  ['id', 'id'], ['createdAt', 'Бүртгүүлсэн'], ['updatedAt', 'Зассан'], ['status', 'Төлөв'],
  ['lastName', 'Овог'], ['firstName', 'Нэр'], ['phone', 'Утас'], ['email', 'Имэйл'], ['age', 'Нас'],
  ['type', 'Төрөл'], ['school', 'Сургууль'], ['major', 'Мэргэжил, курс'], ['days', 'Өдрүүд'], ['shifts', 'Цаг'],
  ['experience', 'Туршлага'], ['note', 'Тэмдэглэл']
];
const KEYS = COLS.map(c => c[0]);
const DAYS = ['Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба', 'Ням'];
const SHIFTS = ['Өглөө (08–12)', 'Өдөр (12–17)', 'Орой (17–22)'];
const TYPES = ['Их, дээд сургуулийн оюутан', 'Коллеж, МСҮТ-ийн сурагч', 'Ахлах ангийн сурагч', 'Төгссөн / ажил хайж буй', 'Бусад'];
const STATUSES = ['Шинэ', 'Холбогдсон', 'Ажилд авсан', 'Татгалзсан'];
const TOKEN_DAYS = 30;

/** Нэг удаа ажиллуулна: хүснэгт үүсгээд эрх зөвшөөрүүлнэ. */
function setup() {
  sheet_();
  if (!props_().getProperty('ADMIN_PASSWORD')) {
    throw new Error('Project Settings → Script properties хэсэгт ADMIN_PASSWORD нэмээд дахин ажиллуулна уу.');
  }
  MailApp.getRemainingDailyQuota();
  Logger.log('Бэлэн. Одоо Deploy → New deployment → Web app хийнэ үү.');
}

function doGet() {
  return out_({ ok: true, job: job_() });
}

function doPost(e) {
  try {
    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (p.action) {
      case 'job': return out_({ ok: true, job: job_() });
      case 'apply': return out_(apply_(p.data || {}));
      case 'login': return out_(login_(p.password));
    }
    auth_(p.token);
    switch (p.action) {
      case 'list': return out_({ ok: true, rows: list_(), job: job_() });
      case 'status': return out_(setStatus_(p.id, p.status));
      case 'delete': return out_(remove_(p.id));
      case 'saveJob': return out_(saveJob_(p.job || {}));
    }
    throw fail_('bad_action', 'Үл мэдэгдэх үйлдэл.');
  } catch (err) {
    console.error(err);
    return out_({ ok: false, code: err.code || 'error', error: err.code ? err.message : 'Серверийн алдаа: ' + err.message });
  }
}

/* ---------- Анкет ---------- */

function apply_(d) {
  if (d.website) return { ok: true, updated: false }; // spam bot-ын хавх
  if (job_().closed) throw fail_('closed', 'Бүртгэл хаагдсан байна.');
  const a = {
    lastName: clean_(d.lastName, 60), firstName: clean_(d.firstName, 60),
    phone: clean_(d.phone, 20), email: clean_(d.email, 100), age: clean_(d.age, 2),
    type: TYPES.indexOf(d.type) >= 0 ? d.type : '',
    school: clean_(d.school, 100), major: clean_(d.major, 100),
    days: pick_(d.days, DAYS), shifts: pick_(d.shifts, SHIFTS),
    experience: clean_(d.experience, 800), note: clean_(d.note, 800)
  };
  const miss = [];
  if (!a.lastName) miss.push('овог');
  if (!a.firstName) miss.push('нэр');
  if (a.phone.replace(/\D/g, '').length < 8) miss.push('утас (8 оронтой)');
  if (!/^\d{1,2}$/.test(a.age)) miss.push('нас');
  if (!a.type) miss.push('та хэн бэ');
  if (!a.days) miss.push('өдөр');
  if (!a.shifts) miss.push('цаг');
  if (a.email && !/^\S+@\S+\.\S+$/.test(a.email)) miss.push('имэйл зөв биш');
  if (miss.length) throw fail_('invalid', 'Дараахыг бөглөнө үү: ' + miss.join(', '));

  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = sheet_(), data = rows_(sh), now = new Date();
    const digits = a.phone.replace(/\D/g, ''), pi = KEYS.indexOf('phone');
    const idx = data.findIndex(r => String(r[pi]).replace(/\D/g, '') === digits);
    if (idx >= 0) {
      // Нэг утасны дугаараар дахин илгээвэл хуучин анкетыг шинэчилнэ, төлөв хэвээр.
      const row = data[idx].slice();
      Object.keys(a).forEach(k => { row[KEYS.indexOf(k)] = a[k]; });
      row[KEYS.indexOf('updatedAt')] = now;
      sh.getRange(idx + 2, 1, 1, KEYS.length).setValues([row.map(text_)]);
      return { ok: true, updated: true };
    }
    const meta = { id: Utilities.getUuid(), createdAt: now, updatedAt: now, status: STATUSES[0] };
    sh.appendRow(KEYS.map(k => (k in meta ? meta[k] : a[k])).map(text_));
    notify_(a);
    return { ok: true, updated: false };
  } finally {
    lock.releaseLock();
  }
}

function notify_(a) {
  const p = props_();
  const to = p.getProperty('NOTIFY_EMAIL') || Session.getEffectiveUser().getEmail();
  if (!to || to === 'off') return;
  const url = p.getProperty('ADMIN_URL');
  const body = [
    a.lastName + ' ' + a.firstName + ' (' + a.age + ' нас)',
    'Утас: ' + a.phone,
    a.email && 'Имэйл: ' + a.email,
    a.type + (a.school ? ' · ' + a.school : '') + (a.major ? ' · ' + a.major : ''),
    'Өдөр: ' + a.days,
    'Цаг: ' + a.shifts,
    url && '\nDashboard: ' + url
  ].filter(Boolean).join('\n');
  try {
    MailApp.sendEmail(to, 'Шинэ анкет: ' + a.lastName + ' ' + a.firstName, body);
  } catch (e) {
    console.error(e);
  }
}

/* ---------- Admin ---------- */

function login_(pw) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('fails') || 0);
  if (fails >= 5) throw fail_('locked', 'Олон удаа буруу оруулсан тул 10 минут түгжигдлээ.');
  const real = props_().getProperty('ADMIN_PASSWORD');
  if (!real) throw fail_('setup', 'ADMIN_PASSWORD тохируулаагүй байна.');
  if (String(pw || '') !== real) {
    cache.put('fails', String(fails + 1), 600);
    throw fail_('auth', 'Нууц үг буруу байна.');
  }
  cache.remove('fails');
  const exp = Date.now() + TOKEN_DAYS * 864e5;
  return { ok: true, token: exp + '.' + sign_(exp) };
}

function auth_(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2 || Number(parts[0]) < Date.now() || parts[1] !== sign_(parts[0])) {
    throw fail_('auth', 'Дахин нэвтэрнэ үү.');
  }
}

// Нууц үг солигдоход бүх хуучин token хүчингүй болно.
function sign_(exp) {
  const p = props_();
  let secret = p.getProperty('TOKEN_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    p.setProperty('TOKEN_SECRET', secret);
  }
  const key = secret + '|' + (p.getProperty('ADMIN_PASSWORD') || '');
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(String(exp), key));
}

function list_() {
  return rows_(sheet_()).map(toObj_).filter(r => r.id).reverse();
}

function setStatus_(id, status) {
  if (STATUSES.indexOf(status) < 0) throw fail_('invalid', 'Буруу төлөв.');
  return withRow_(id, (sh, row) => {
    sh.getRange(row, KEYS.indexOf('status') + 1).setValue(status);
  });
}

function remove_(id) {
  return withRow_(id, (sh, row) => sh.deleteRow(row));
}

function withRow_(id, fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = sheet_(), n = sh.getLastRow() - 1;
    const ids = n > 0 ? sh.getRange(2, 1, n, 1).getValues().map(r => String(r[0])) : [];
    const i = ids.indexOf(String(id));
    if (i < 0) throw fail_('not_found', 'Бүртгэл олдсонгүй. Жагсаалтаа шинэчилнэ үү.');
    fn(sh, i + 2);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function job_() {
  try { return JSON.parse(props_().getProperty('JOB') || '{}'); } catch (e) { return {}; }
}

function saveJob_(j) {
  const job = {
    title: clean_(j.title, 120), org: clean_(j.org, 100), place: clean_(j.place, 100),
    pay: clean_(j.pay, 60), deadline: clean_(j.deadline, 60), desc: clean_(j.desc, 2000),
    closed: j.closed === true
  };
  props_().setProperty('JOB', JSON.stringify(job));
  return { ok: true, job: job };
}

/* ---------- Туслах ---------- */

function sheet_() {
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(SHEET_NAME);
  if (!sh) {
    sh = ss.insertSheet(SHEET_NAME);
    sh.appendRow(COLS.map(c => c[1]));
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, COLS.length).setFontWeight('bold');
    sh.hideColumns(1);
  }
  return sh;
}

function rows_(sh) {
  const n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, KEYS.length).getValues() : [];
}

function toObj_(r) {
  const o = {};
  KEYS.forEach((k, i) => {
    const v = r[i];
    o[k] = v instanceof Date ? v.getTime() : (v === null || v === undefined ? '' : String(v));
  });
  return o;
}

function clean_(v, max) {
  return String(v === null || v === undefined ? '' : v)
    .replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, '')
    .trim()
    .slice(0, max);
}

function pick_(arr, list) {
  return Array.isArray(arr) ? list.filter(x => arr.indexOf(x) >= 0).join(', ') : '';
}

// Урд нь ' тавьснаар текст хэвээр хадгалагдана: утасны дугаар тоо болохгүй, "=" томьёо ажиллахгүй.
function text_(v) {
  return typeof v === 'string' && v !== '' ? "'" + v : v;
}

function props_() {
  return PropertiesService.getScriptProperties();
}

function fail_(code, message) {
  const e = new Error(message);
  e.code = code;
  return e;
}

function out_(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
