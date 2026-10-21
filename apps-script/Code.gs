/**
 * Цагийн ажлын бүртгэл — Google Apps Script backend.
 *
 * Script properties (Project Settings → Script properties):
 *   <нэвтрэх нэр>   заавал. Property-ийн нэр = админы нэвтрэх нэр, утга = нууц үг. Хэд хэдэн админ нэмж болно.
 *   NOTIFY_EMAIL    сонголттой (хуучин). Одоо админ апп-ын Тохиргоо хэсгээс удирдана.
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
  ['experience', 'Туршлага'], ['note', 'Тэмдэглэл'], ['gender', 'Хүйс']
];
const KEYS = COLS.map(c => c[0]);
const DAYS = ['Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба', 'Ням'];
const SHIFTS = ['Өглөө (08–12)', 'Өдөр (12–17)', 'Орой (17–22)'];
const TYPES = ['Их, дээд сургуулийн оюутан', 'Коллеж, МСҮТ-ийн сурагч', 'Ахлах ангийн сурагч', 'Төгссөн / ажил хайж буй', 'Бусад'];
const GENDERS = ['Эрэгтэй', 'Эмэгтэй'];
const GENDER_MODES = ['off', 'optional', 'required'];
const STATUSES = ['Шинэ', 'Холбогдсон', 'Ажилд авсан', 'Татгалзсан'];
const TOKEN_DAYS = 30;
const MAX_ADMINS = 4;
const RESERVED = ['NOTIFY_EMAIL', 'ADMIN_URL', 'TOKEN_SECRET', 'JOB', 'CONFIG'];

/** Нэг удаа ажиллуулна: хүснэгт үүсгээд эрх зөвшөөрүүлнэ. */
function setup() {
  sheet_();
  if (!admins_().length) {
    throw new Error('Project Settings → Script properties хэсэгт админ нэмнэ үү: Property = нэвтрэх нэр, Value = нууц үг.');
  }
  MailApp.getRemainingDailyQuota();
  Logger.log('Бэлэн. Одоо Deploy → New deployment → Web app хийнэ үү.');
}

function doGet() {
  return out_(public_());
}

function public_() {
  const c = config_();
  return { ok: true, job: job_(), options: { days: c.days, shifts: c.shifts, types: c.types, genderMode: c.genderMode, genders: c.genders } };
}

function doPost(e) {
  try {
    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (p.action) {
      case 'job': return out_(public_());
      case 'apply': return out_(apply_(p.data || {}));
      case 'login': return out_(login_(p.user, p.password));
    }
    const user = auth_(p.token);
    switch (p.action) {
      case 'list': return out_({ ok: true, rows: list_(), job: job_(), options: public_().options });
      case 'status': return out_(setStatus_(p.id, p.status));
      case 'delete': return out_(remove_(p.id));
      case 'saveJob': return out_(saveJob_(p.job || {}));
      case 'getSettings': return out_(getSettings_(user));
      case 'saveSettings': return out_(saveSettings_(p.settings || {}));
      case 'changePassword': return out_(changePassword_(user, p.current, p.next));
      case 'addAdmin': return out_(addAdmin_(p.name, p.password));
      case 'removeAdmin': return out_(removeAdmin_(user, p.name));
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
  const c = config_();
  const a = {
    lastName: clean_(d.lastName, 60), firstName: clean_(d.firstName, 60),
    phone: clean_(d.phone, 20), email: clean_(d.email, 100), age: clean_(d.age, 2),
    type: c.types.indexOf(d.type) >= 0 ? d.type : '',
    school: clean_(d.school, 100), major: clean_(d.major, 100),
    days: pick_(d.days, c.days), shifts: pick_(d.shifts, c.shifts),
    experience: clean_(d.experience, 800), note: clean_(d.note, 800),
    gender: c.genderMode !== 'off' && c.genders.indexOf(d.gender) >= 0 ? d.gender : ''
  };
  const miss = [];
  if (!a.lastName) miss.push('овог');
  if (!a.firstName) miss.push('нэр');
  if (a.phone.replace(/\D/g, '').length < 8) miss.push('утас (8 оронтой)');
  if (!/^\d{1,2}$/.test(a.age)) miss.push('нас');
  if (!a.type) miss.push('та хэн бэ');
  if (c.genderMode === 'required' && !a.gender) miss.push('хүйс');
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
  const p = props_(), c = config_();
  if (!c.notify) return;
  const to = c.notifyEmail || Session.getEffectiveUser().getEmail();
  if (!to) return;
  const url = p.getProperty('ADMIN_URL');
  const body = [
    a.lastName + ' ' + a.firstName + ' (' + a.age + ' нас' + (a.gender ? ', ' + a.gender : '') + ')',
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

function login_(user, pw) {
  const cache = CacheService.getScriptCache();
  const fails = Number(cache.get('fails') || 0);
  if (fails >= 5) throw fail_('locked', 'Олон удаа буруу оруулсан тул 10 минут түгжигдлээ.');
  if (!admins_().length) throw fail_('setup', 'Админ тохируулаагүй байна.');
  user = String(user || '').trim();
  const real = adminPassword_(user);
  if (real === null || String(pw || '') !== real) {
    cache.put('fails', String(fails + 1), 600);
    throw fail_('auth', 'Нэр эсвэл нууц үг буруу байна.');
  }
  cache.remove('fails');
  return { ok: true, user: user, token: token_(user) };
}

function token_(user) {
  const exp = Date.now() + TOKEN_DAYS * 864e5;
  const u = Utilities.base64EncodeWebSafe(user, Utilities.Charset.UTF_8);
  return exp + '.' + u + '.' + sign_(exp, user);
}

function auth_(token) {
  const parts = String(token || '').split('.');
  let user = '';
  try { user = Utilities.newBlob(Utilities.base64DecodeWebSafe(parts[1] || '')).getDataAsString('UTF-8'); } catch (e) {}
  const sig = user && adminPassword_(user) !== null ? sign_(parts[0], user) : null;
  if (parts.length !== 3 || Number(parts[0]) < Date.now() || !sig || parts[2] !== sig) {
    throw fail_('auth', 'Дахин нэвтэрнэ үү.');
  }
  return user;
}

// Property-ийн нэр = нэвтрэх нэр, утга = нууц үг. Тохиргооны нэрс админ биш.
function admins_() {
  return Object.keys(props_().getProperties()).filter(k => RESERVED.indexOf(k) < 0);
}

function adminPassword_(user) {
  if (!user || RESERVED.indexOf(user) >= 0) return null;
  const pw = props_().getProperty(user);
  return pw ? pw : null;
}

// Нууц үг солигдох эсвэл админ устгагдахад тэр админы token хүчингүй болно.
function sign_(exp, user) {
  const p = props_();
  let secret = p.getProperty('TOKEN_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    p.setProperty('TOKEN_SECRET', secret);
  }
  const key = secret + '|' + adminPassword_(user);
  return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(exp + '|' + user, key));
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

/* ---------- Тохиргоо ---------- */

function config_() {
  let c = {};
  try { c = JSON.parse(props_().getProperty('CONFIG') || '{}'); } catch (e) {}
  const legacy = props_().getProperty('NOTIFY_EMAIL');
  return {
    notify: c.notify !== undefined ? c.notify : legacy !== 'off',
    notifyEmail: c.notifyEmail !== undefined ? c.notifyEmail : (legacy && legacy !== 'off' ? legacy : ''),
    days: c.days && c.days.length ? c.days : DAYS,
    shifts: c.shifts && c.shifts.length ? c.shifts : SHIFTS,
    types: c.types && c.types.length ? c.types : TYPES,
    genderMode: GENDER_MODES.indexOf(c.genderMode) >= 0 ? c.genderMode : 'optional',
    genders: c.genders && c.genders.length ? c.genders : GENDERS
  };
}

function getSettings_(user) {
  const c = config_();
  c.user = user;
  c.ownerEmail = Session.getEffectiveUser().getEmail();
  c.admins = admins_().sort();
  c.maxAdmins = MAX_ADMINS;
  return { ok: true, settings: c };
}

function saveSettings_(s) {
  // Өдөр, цагийг Sheet-д ", "-ээр нийлүүлж хадгалдаг тул тэдгээрт таслал хориотой.
  const list = (v, name, noComma) => {
    const out = [];
    (Array.isArray(v) ? v : []).forEach(x => {
      x = clean_(x, 60);
      if (noComma) x = x.replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
      if (x && out.indexOf(x) < 0) out.push(x);
    });
    if (!out.length) throw fail_('invalid', name + ' хоосон байж болохгүй.');
    if (out.length > 14) throw fail_('invalid', name + ' 14-өөс олон байж болохгүй.');
    return out;
  };
  const email = clean_(s.notifyEmail, 100);
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw fail_('invalid', 'Имэйл хаяг буруу байна.');
  const c = {
    notify: s.notify === true, notifyEmail: email,
    days: list(s.days, 'Өдрүүд', true), shifts: list(s.shifts, 'Цаг', true), types: list(s.types, '"Та хэн бэ" сонголт'),
    genderMode: GENDER_MODES.indexOf(s.genderMode) >= 0 ? s.genderMode : 'optional',
    genders: list(s.genders, 'Хүйсийн сонголт')
  };
  props_().setProperty('CONFIG', JSON.stringify(c));
  return getSettings_('');
}

function changePassword_(user, current, next) {
  if (adminPassword_(user) !== String(current || '')) throw fail_('invalid', 'Одоогийн нууц үг буруу байна.');
  next = String(next || '');
  if (next.length < 8) throw fail_('invalid', 'Шинэ нууц үг 8-аас дээш тэмдэгттэй байна.');
  if (next === user) throw fail_('invalid', 'Нууц үг нэвтрэх нэртэйгээ ижил байж болохгүй.');
  props_().setProperty(user, next);
  return { ok: true, token: token_(user) };
}

function addAdmin_(name, password) {
  name = String(name || '').trim();
  password = String(password || '');
  if (!/^[A-Za-z0-9._-]{3,30}$/.test(name)) {
    throw fail_('invalid', 'Нэвтрэх нэр 3–30 тэмдэгт, зөвхөн латин үсэг, тоо, . _ - байна.');
  }
  if (RESERVED.some(r => r.toLowerCase() === name.toLowerCase())) throw fail_('invalid', 'Энэ нэрийг ашиглах боломжгүй.');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const list = admins_();
    if (list.some(a => a.toLowerCase() === name.toLowerCase())) throw fail_('invalid', 'Ийм нэртэй админ байна.');
    if (list.length >= MAX_ADMINS) throw fail_('invalid', 'Хамгийн ихдээ ' + MAX_ADMINS + ' админ байна.');
    if (password.length < 8) throw fail_('invalid', 'Нууц үг 8-аас дээш тэмдэгттэй байна.');
    if (password === name) throw fail_('invalid', 'Нууц үг нэвтрэх нэртэйгээ ижил байж болохгүй.');
    props_().setProperty(name, password);
    return { ok: true, admins: admins_().sort() };
  } finally {
    lock.releaseLock();
  }
}

// Устгагдсан админы token дараагийн хүсэлтэд хүчингүй болно (adminPassword_ null буцаана).
function removeAdmin_(user, name) {
  name = String(name || '');
  if (name === user) throw fail_('invalid', 'Өөрийгөө устгах боломжгүй.');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const list = admins_();
    if (list.indexOf(name) < 0) throw fail_('not_found', 'Админ олдсонгүй.');
    if (list.length <= 1) throw fail_('invalid', 'Сүүлчийн админыг устгах боломжгүй.');
    props_().deleteProperty(name);
    return { ok: true, admins: admins_().sort() };
  } finally {
    lock.releaseLock();
  }
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
  } else if (sh.getLastColumn() < COLS.length) {
    const from = sh.getLastColumn() + 1;
    sh.getRange(1, from, 1, COLS.length - from + 1)
      .setValues([COLS.slice(from - 1).map(c => c[1])]).setFontWeight('bold');
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
