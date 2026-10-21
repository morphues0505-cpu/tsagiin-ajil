/**
 * Цагийн ажлын зарын самбар — Google Apps Script backend.
 *
 * Байгууллага зар илгээнэ → админ батална → оюутан зар сонгож анкет илгээнэ → анкет байгууллагын имэйл рүү очно.
 *
 * Script properties (Project Settings → Script properties):
 *   <нэвтрэх нэр>   заавал. Property-ийн нэр = админы нэвтрэх нэр, утга = нууц үг. Хамгийн ихдээ 4 админ.
 *   NOTIFY_EMAIL    сонголттой (хуучин). Одоо админ апп-ын Тохиргоо хэсгээс удирдана.
 *   ADMIN_URL       сонголттой. Мэдэгдэл имэйлд оруулах dashboard линк.
 */

// Script нь Sheet-ээс тусдаа (script.google.com дээр) үүссэн бол Sheet-ийн ID-г энд тавина.
// Sheet-ийн Extensions → Apps Script-ээр үүсгэсэн бол хоосон үлдээнэ.
const SPREADSHEET_ID = '1UnM0vId0e1R1_pNm5zY1L_NJQB3C4xItt15kzBZ_qBg';

// Хуучин хүснэгтэд шинэ багана төгсгөлд нь нэмэгддэг тул дарааллыг бүү өөрчил, зөвхөн төгсгөлд нэм.
const APPS = {
  name: 'Бүртгэл',
  cols: [
    ['id', 'id'], ['createdAt', 'Бүртгүүлсэн'], ['updatedAt', 'Зассан'], ['status', 'Төлөв'],
    ['lastName', 'Овог'], ['firstName', 'Нэр'], ['phone', 'Утас'], ['email', 'Имэйл'], ['age', 'Нас'],
    ['type', 'Төрөл'], ['school', 'Сургууль'], ['major', 'Мэргэжил, курс'], ['days', 'Өдрүүд'], ['shifts', 'Цаг'],
    ['experience', 'Туршлага'], ['note', 'Тэмдэглэл'], ['gender', 'Хүйс'],
    ['jobId', 'Зарын id'], ['jobTitle', 'Зар'], ['sentAt', 'Байгууллагад илгээсэн']
  ]
};
const JOBS = {
  name: 'Зарууд',
  cols: [
    ['id', 'id'], ['createdAt', 'Илгээсэн'], ['status', 'Төлөв'],
    ['org', 'Байгууллага'], ['contactName', 'Холбогдох хүн'], ['contactPhone', 'Утас'], ['contactEmail', 'Имэйл'],
    ['title', 'Албан тушаал'], ['place', 'Байршил'], ['pay', 'Цалин'], ['schedule', 'Ажлын цаг'],
    ['deadline', 'Хаагдах'], ['desc', 'Тайлбар'], ['approvedAt', 'Баталсан'], ['approvedBy', 'Баталсан админ']
  ]
};
[APPS, JOBS].forEach(t => { t.keys = t.cols.map(c => c[0]); });

const DAYS = ['Даваа', 'Мягмар', 'Лхагва', 'Пүрэв', 'Баасан', 'Бямба', 'Ням'];
const SHIFTS = ['Өглөө (08–12)', 'Өдөр (12–17)', 'Орой (17–22)'];
const TYPES = ['Их, дээд сургуулийн оюутан', 'Коллеж, МСҮТ-ийн сурагч', 'Ахлах ангийн сурагч', 'Төгссөн / ажил хайж буй', 'Бусад'];
const GENDERS = ['Эрэгтэй', 'Эмэгтэй'];
const GENDER_MODES = ['off', 'optional', 'required'];
const STATUSES = ['Шинэ', 'Холбогдсон', 'Ажилд авсан', 'Татгалзсан'];
const JOB_STATUSES = { pending: 'Хүлээгдэж буй', approved: 'Нийтлэгдсэн', closed: 'Хаагдсан', rejected: 'Татгалзсан' };
const TOKEN_DAYS = 30;
const MAX_ADMINS = 4;
const MAX_PENDING_JOBS = 50;
const MAX_POSTS_PER_HOUR = 20;
const RESERVED = ['NOTIFY_EMAIL', 'ADMIN_URL', 'TOKEN_SECRET', 'JOB', 'CONFIG'];

/** Нэг удаа ажиллуулна: хүснэгтүүд үүсгээд эрх зөвшөөрүүлнэ. */
function setup() {
  table_(APPS);
  table_(JOBS);
  if (!admins_().length) {
    throw new Error('Project Settings → Script properties хэсэгт админ нэмнэ үү: Property = нэвтрэх нэр, Value = нууц үг.');
  }
  MailApp.getRemainingDailyQuota();
  Logger.log('Бэлэн. Одоо Deploy → New deployment → Web app хийнэ үү.');
}

function doGet() {
  return out_(board_());
}

function doPost(e) {
  try {
    const p = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    switch (p.action) {
      case 'job':
      case 'board': return out_(board_());
      case 'apply': return out_(apply_(p.data || {}));
      case 'postJob': return out_(postJob_(p.data || {}));
      case 'login': return out_(login_(p.user, p.password));
    }
    const user = auth_(p.token);
    switch (p.action) {
      case 'list': return out_({ ok: true, rows: list_(APPS), jobs: list_(JOBS), job: site_(), options: options_() });
      case 'status': return out_(setStatus_(p.id, p.status));
      case 'delete': return out_(withRow_(APPS, p.id, (sh, row) => sh.deleteRow(row)));
      case 'resend': return out_(resend_(p.id));
      case 'jobStatus': return out_(setJobStatus_(user, p.id, p.status));
      case 'deleteJob': return out_(withRow_(JOBS, p.id, (sh, row) => sh.deleteRow(row)));
      case 'saveJob': return out_(saveSite_(p.job || {}));
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

/* ---------- Нээлттэй хэсэг ---------- */

// Холбоо барих мэдээлэл (утас, имэйл) нийтэд харагдахгүй.
function board_() {
  const jobs = list_(JOBS)
    .filter(j => j.status === JOB_STATUSES.approved)
    .map(j => ({ id: j.id, org: j.org, title: j.title, place: j.place, pay: j.pay, schedule: j.schedule, deadline: j.deadline, desc: j.desc, createdAt: j.createdAt }));
  return { ok: true, job: site_(), options: options_(), jobs: jobs };
}

function options_() {
  const c = config_();
  return { days: c.days, shifts: c.shifts, types: c.types, genderMode: c.genderMode, genders: c.genders };
}

function postJob_(d) {
  if (d.website) return { ok: true }; // spam bot-ын хавх
  if (site_().postsOpen === false) throw fail_('closed', 'Одоогоор шинэ зар хүлээж авахгүй байна.');
  const j = {
    org: clean_(d.org, 100), contactName: clean_(d.contactName, 60), contactPhone: clean_(d.contactPhone, 20),
    contactEmail: clean_(d.contactEmail, 100), title: clean_(d.title, 100), place: clean_(d.place, 100),
    pay: clean_(d.pay, 60), schedule: clean_(d.schedule, 120), deadline: clean_(d.deadline, 60), desc: clean_(d.desc, 2000)
  };
  const miss = [];
  if (!j.org) miss.push('байгууллагын нэр');
  if (!j.contactName) miss.push('холбогдох хүн');
  if (j.contactPhone.replace(/\D/g, '').length < 8) miss.push('утас (8 оронтой)');
  if (!/^\S+@\S+\.\S+$/.test(j.contactEmail)) miss.push('имэйл');
  if (!j.title) miss.push('албан тушаал');
  if (!j.place) miss.push('байршил');
  if (!j.pay) miss.push('цалин');
  if (!j.desc) miss.push('тайлбар');
  if (miss.length) throw fail_('invalid', 'Дараахыг бөглөнө үү: ' + miss.join(', '));

  const cache = CacheService.getScriptCache();
  const posts = Number(cache.get('posts') || 0);
  if (posts >= MAX_POSTS_PER_HOUR) throw fail_('busy', 'Хэт олон зар ирж байна. Түр хүлээгээд дахин оролдоно уу.');
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = table_(JOBS);
    const pending = rows_(sh, JOBS).filter(r => r[JOBS.keys.indexOf('status')] === JOB_STATUSES.pending).length;
    if (pending >= MAX_PENDING_JOBS) throw fail_('busy', 'Батлагдахыг хүлээж буй зар олон байна. Дараа дахин оролдоно уу.');
    const meta = { id: Utilities.getUuid(), createdAt: new Date(), status: JOB_STATUSES.pending, approvedAt: '', approvedBy: '' };
    sh.appendRow(JOBS.keys.map(k => (k in meta ? meta[k] : j[k])).map(text_));
    cache.put('posts', String(posts + 1), 3600);
  } finally {
    lock.releaseLock();
  }
  notifyAdmin_('Шинэ зар батлах хүлээгдэж байна: ' + j.org + ' — ' + j.title, [
    j.org + ' — ' + j.title,
    'Байршил: ' + j.place, 'Цалин: ' + j.pay, j.schedule && 'Цаг: ' + j.schedule,
    'Холбогдох: ' + j.contactName + ', ' + j.contactPhone + ', ' + j.contactEmail,
    '\n' + j.desc,
    '\nАдмин апп-ын «Зарууд» хэсгээс батална уу.'
  ]);
  return { ok: true };
}

function apply_(d) {
  if (d.website) return { ok: true, updated: false }; // spam bot-ын хавх
  if (site_().closed) throw fail_('closed', 'Бүртгэл хаагдсан байна.');
  const job = findJob_(d.jobId);
  if (!job || job.status !== JOB_STATUSES.approved) throw fail_('closed', 'Энэ зар хаагдсан байна. Өөр зар сонгоно уу.');
  if (d.consent !== true) throw fail_('invalid', 'Мэдээллээ байгууллагад илгээхийг зөвшөөрнө үү.');
  const c = config_();
  const a = {
    lastName: clean_(d.lastName, 60), firstName: clean_(d.firstName, 60),
    phone: clean_(d.phone, 20), email: clean_(d.email, 100), age: clean_(d.age, 2),
    type: c.types.indexOf(d.type) >= 0 ? d.type : '',
    school: clean_(d.school, 100), major: clean_(d.major, 100),
    days: pick_(d.days, c.days), shifts: pick_(d.shifts, c.shifts),
    experience: clean_(d.experience, 800), note: clean_(d.note, 800),
    gender: c.genderMode !== 'off' && c.genders.indexOf(d.gender) >= 0 ? d.gender : '',
    jobId: job.id, jobTitle: job.org + ' — ' + job.title
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
  let rowNo, updated;
  try {
    const sh = table_(APPS), data = rows_(sh, APPS), K = APPS.keys, now = new Date();
    const digits = a.phone.replace(/\D/g, '');
    // Нэг утасны дугаараар нэг зарт дахин илгээвэл хуучин анкетыг шинэчилнэ, төлөв хэвээр.
    const idx = data.findIndex(r => String(r[K.indexOf('phone')]).replace(/\D/g, '') === digits && String(r[K.indexOf('jobId')]) === job.id);
    if (idx >= 0) {
      const row = data[idx].slice();
      Object.keys(a).forEach(k => { row[K.indexOf(k)] = a[k]; });
      row[K.indexOf('updatedAt')] = now;
      sh.getRange(idx + 2, 1, 1, K.length).setValues([row.map(text_)]);
      rowNo = idx + 2;
      updated = true;
    } else {
      const meta = { id: Utilities.getUuid(), createdAt: now, updatedAt: now, status: STATUSES[0], sentAt: '' };
      sh.appendRow(K.map(k => (k in meta ? meta[k] : a[k])).map(text_));
      rowNo = sh.getLastRow();
      updated = false;
    }
  } finally {
    lock.releaseLock();
  }
  if (forward_(job, a, updated)) table_(APPS).getRange(rowNo, APPS.keys.indexOf('sentAt') + 1).setValue(new Date());
  if (!updated) {
    notifyAdmin_('Шинэ анкет: ' + a.lastName + ' ' + a.firstName + ' → ' + a.jobTitle, summary_(a));
  }
  return { ok: true, updated: updated };
}

function summary_(a) {
  return [
    a.lastName + ' ' + a.firstName + ' (' + a.age + ' нас' + (a.gender ? ', ' + a.gender : '') + ')',
    'Утас: ' + a.phone,
    a.email && 'Имэйл: ' + a.email,
    a.type + (a.school ? ' · ' + a.school : '') + (a.major ? ' · ' + a.major : ''),
    'Өдөр: ' + a.days,
    'Цаг: ' + a.shifts,
    a.experience && '\nТуршлага: ' + a.experience,
    a.note && 'Нэмэлт: ' + a.note
  ].filter(Boolean);
}

// Анкетыг байгууллагын имэйл рүү илгээнэ. Gmail-ийн өдрийн хязгаар дууссан бол false.
function forward_(job, a, updated) {
  if (!job.contactEmail) return false;
  try {
    if (MailApp.getRemainingDailyQuota() < 1) return false;
    const site = site_().title || 'Цагийн ажлын самбар';
    const body = [
      'Сайн байна уу, ' + (job.contactName || job.org) + '.',
      '',
      'Таны "' + job.title + '" зарт ' + (updated ? 'анкетаа шинэчилсэн' : 'шинэ анкет ирлээ') + ':',
      ''
    ].concat(summary_(a), ['', '—', site + '-аар дамжуулан илгээв. Оюутан мэдээллээ танд илгээхийг зөвшөөрсөн.']);
    const opts = a.email ? { replyTo: a.email } : {};
    MailApp.sendEmail(job.contactEmail, (updated ? 'Анкет шинэчлэгдсэн: ' : 'Анкет: ') + job.title + ' — ' + a.lastName + ' ' + a.firstName, body.join('\n'), opts);
    return true;
  } catch (e) {
    console.error(e);
    return false;
  }
}

function notifyAdmin_(subject, lines) {
  const c = config_();
  if (!c.notify) return;
  const to = c.notifyEmail || Session.getEffectiveUser().getEmail();
  if (!to) return;
  const url = props_().getProperty('ADMIN_URL');
  try {
    if (MailApp.getRemainingDailyQuota() < 1) return;
    MailApp.sendEmail(to, subject, lines.concat([url && '\nDashboard: ' + url]).filter(Boolean).join('\n'));
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

function setStatus_(id, status) {
  if (STATUSES.indexOf(status) < 0) throw fail_('invalid', 'Буруу төлөв.');
  return withRow_(APPS, id, (sh, row) => {
    sh.getRange(row, APPS.keys.indexOf('status') + 1).setValue(status);
  });
}

function resend_(id) {
  const app = list_(APPS).filter(r => r.id === String(id))[0];
  if (!app) throw fail_('not_found', 'Бүртгэл олдсонгүй.');
  const job = findJob_(app.jobId);
  if (!job) throw fail_('not_found', 'Энэ анкетын зар устгагдсан байна.');
  if (!forward_(job, app, false)) throw fail_('mail', 'Имэйл илгээж чадсангүй. Өдрийн хязгаар дууссан байж магадгүй, маргааш дахин оролдоно уу.');
  const now = new Date();
  withRow_(APPS, id, (sh, row) => sh.getRange(row, APPS.keys.indexOf('sentAt') + 1).setValue(now));
  return { ok: true, sentAt: now.getTime() };
}

function setJobStatus_(user, id, key) {
  const status = JOB_STATUSES[key];
  if (!status) throw fail_('invalid', 'Буруу төлөв.');
  let job;
  withRow_(JOBS, id, (sh, row) => {
    const K = JOBS.keys;
    job = objOf_(sh.getRange(row, 1, 1, K.length).getValues()[0], JOBS);
    sh.getRange(row, K.indexOf('status') + 1).setValue(status);
    if (key === 'approved' && !job.approvedAt) {
      sh.getRange(row, K.indexOf('approvedAt') + 1, 1, 2).setValues([[new Date(), text_(user)]]);
    }
  });
  // Анх батлахад байгууллагад мэдэгдэнэ.
  if (key === 'approved' && !job.approvedAt && job.contactEmail) {
    try {
      if (MailApp.getRemainingDailyQuota() > 0) {
        MailApp.sendEmail(job.contactEmail, 'Таны зар нийтлэгдлээ: ' + job.title, [
          'Сайн байна уу, ' + (job.contactName || job.org) + '.', '',
          'Таны "' + job.title + '" зар цагийн ажлын самбарт нийтлэгдлээ.',
          'Оюутнуудын анкет энэ имэйл рүү ирнэ.'
        ].join('\n'));
      }
    } catch (e) {
      console.error(e);
    }
  }
  return { ok: true, status: status };
}

function findJob_(id) {
  if (!id) return null;
  return list_(JOBS).filter(j => j.id === String(id))[0] || null;
}

function withRow_(t, id, fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try {
    const sh = table_(t), n = sh.getLastRow() - 1;
    const ids = n > 0 ? sh.getRange(2, 1, n, 1).getValues().map(r => String(r[0])) : [];
    const i = ids.indexOf(String(id));
    if (i < 0) throw fail_('not_found', 'Мөр олдсонгүй. Жагсаалтаа шинэчилнэ үү.');
    fn(sh, i + 2);
    return { ok: true };
  } finally {
    lock.releaseLock();
  }
}

function site_() {
  try { return JSON.parse(props_().getProperty('JOB') || '{}'); } catch (e) { return {}; }
}

function saveSite_(j) {
  const site = {
    title: clean_(j.title, 120), desc: clean_(j.desc, 2000),
    closed: j.closed === true, postsOpen: j.postsOpen !== false
  };
  props_().setProperty('JOB', JSON.stringify(site));
  return { ok: true, job: site };
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
  c.mailQuota = MailApp.getRemainingDailyQuota();
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

function table_(t) {
  const ss = SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(t.name);
  if (!sh) {
    sh = ss.insertSheet(t.name);
    sh.appendRow(t.cols.map(c => c[1]));
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, t.cols.length).setFontWeight('bold');
    sh.hideColumns(1);
  } else if (sh.getLastColumn() < t.cols.length) {
    const from = sh.getLastColumn() + 1;
    sh.getRange(1, from, 1, t.cols.length - from + 1)
      .setValues([t.cols.slice(from - 1).map(c => c[1])]).setFontWeight('bold');
  }
  return sh;
}

function rows_(sh, t) {
  const n = sh.getLastRow() - 1;
  return n > 0 ? sh.getRange(2, 1, n, t.keys.length).getValues() : [];
}

function list_(t) {
  return rows_(table_(t), t).map(r => objOf_(r, t)).filter(r => r.id).reverse();
}

function objOf_(r, t) {
  const o = {};
  t.keys.forEach((k, i) => {
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
