/* adminController.js — داشبورد، تنظیمات، آمار، مدیران، گزارش فعالیت، آپلود */
const M = require('../models');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../utils/audit');
const T = require('../utils/time');
const { ok, paginate, metaOf } = require('../utils/respond');
const { escapeRegex } = require('../utils/text');

exports.dashboard = asyncHandler(async (req, res) => {
  const today = T.localDate();
  const weekEnd = T.addDays(today, 6);
  const HOLD = M.Appointment.HOLDING;
  const [appointmentsTotal, appointmentsNew, messagesUnread, a, j, recent, todayList, upcoming, byStatus, patientsTotal] = await Promise.all([
    M.Appointment.countDocuments(), M.Appointment.countDocuments({ status: 'جدید' }), M.ContactMessage.countDocuments({ read: false }),
    M.Article.countDocuments(), M.JournalArticle.countDocuments(), M.Appointment.find().sort({ createdAt: -1 }).limit(6),
    M.Appointment.find({ date: today, status: { $in: HOLD } }).sort({ time: 1 }).limit(60),
    M.Appointment.aggregate([{ $match: { date: { $gte: today, $lte: weekEnd }, status: { $in: HOLD } } }, { $group: { _id: '$date', count: { $sum: 1 } } }]),
    M.Appointment.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
    M.Patient.countDocuments(),
  ]);
  // اطلاعات شخصی بیماران فقط برای مدیر ارشد و پذیرش؛ مدیر محتوا فقط اعداد را می‌بیند
  if (!['super_admin', 'receptionist'].includes(req.user.role)) { recent.length = 0; todayList.length = 0; }
  const todayCount = await M.Appointment.countDocuments({ date: today, status: { $in: HOLD } });
  const upMap = new Map(upcoming.map((x) => [x._id, x.count]));
  const week = Array.from({ length: 7 }, (_, i) => { const d = T.addDays(today, i); return { date: d, weekday: T.weekday(d), count: upMap.get(d) || 0 }; });
  return ok(res, {
    today, appointmentsTotal, appointmentsNew, messagesUnread, articlesTotal: a + j, patientsTotal, recent,
    todayCount, todayList, week, weekTotal: week.reduce((s, d) => s + d.count, 0),
    byStatus: M.Appointment.STATUSES.map((s) => ({ status: s, count: (byStatus.find((x) => x._id === s) || {}).count || 0 })),
  });
});

const pickStr = (src, keys) => keys.reduce((o, k) => { if (typeof src[k] === 'string') o[k] = src[k]; return o; }, {});
const SETTING_KEYS = ['clinicName', 'tagline', 'phone1', 'phone2', 'whatsapp', 'email', 'consultationInfo', 'consultationHours', 'coverageText', 'heroTitle', 'heroAccent', 'heroDoctor', 'heroLead', 'introTitle', 'introText'];

exports.getSettings = asyncHandler(async (req, res) => ok(res, await M.SiteSetting.getSingleton()));
exports.updateSettings = asyncHandler(async (req, res) => {
  const doc = await M.SiteSetting.getSingleton();
  doc.set({ ...pickStr(req.body || {}, SETTING_KEYS), isPlaceholder: false });
  if (typeof req.body?.showTestimonials === 'boolean') doc.showTestimonials = req.body.showTestimonials;
  await doc.save();
  audit(req, 'update', 'settings', doc._id, 'اطلاعات کلینیک');
  return ok(res, doc);
});

exports.getStatistics = asyncHandler(async (req, res) => ok(res, await M.Statistic.getSingleton()));
exports.updateStatistics = asyncHandler(async (req, res) => {
  const doc = await M.Statistic.getSingleton();
  ['patients', 'wounds', 'years'].forEach((k) => {
    if (!(k in (req.body || {}))) return;
    const v = req.body[k];
    doc[k] = v === null || v === '' ? null : Number(v); // خالی = نمایش «—» در سایت
  });
  await doc.save();
  audit(req, 'update', 'statistics', doc._id, 'آمار سایت');
  return ok(res, doc);
});

// ---------- مدیران (فقط super_admin) ----------
const lastSuperAdminGuard = async (user) => {
  if (user.role !== 'super_admin') return;
  const others = await M.User.countDocuments({ role: 'super_admin', active: true, _id: { $ne: user._id } });
  if (others === 0) throw new AppError(400, 'حداقل یک مدیر ارشد فعال باید باقی بماند.');
};
const pwError = (p) => { const m = M.User.passwordProblem(p); if (m) throw new AppError(422, 'اطلاعات واردشده معتبر نیست.', { password: m }); };
const ROLE_OK = (r) => M.User.ROLES.includes(r);

exports.listUsers = asyncHandler(async (req, res) => {
  const { limit, page, skip } = paginate(req.query, { limit: 20 });
  const q = typeof req.query.q === 'string' ? req.query.q.slice(0, 80) : '';
  const f = q ? { $or: ['name', 'email'].map((k) => ({ [k]: new RegExp(escapeRegex(q), 'i') })) } : {};
  const [items, total] = await Promise.all([M.User.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit), M.User.countDocuments(f)]);
  return ok(res, items, metaOf(total, page, limit));
});
exports.createUser = asyncHandler(async (req, res) => {
  const b = req.body || {};
  pwError(b.password);
  if (b.role && !ROLE_OK(b.role)) throw new AppError(422, 'نقش نامعتبر است.', { role: 'نقش نامعتبر است.' });
  const user = await M.User.create({ name: b.name, email: b.email, role: b.role, passwordHash: await M.User.hashPassword(b.password) });
  audit(req, 'create', 'users', user._id, user.email + ' (' + user.role + ')');
  return ok(res, user, undefined, 201);
});
exports.updateUser = asyncHandler(async (req, res) => {
  const user = await M.User.findById(req.params.id);
  if (!user) throw new AppError(404, 'مورد پیدا نشد.');
  const b = req.body || {};
  if (b.role && !ROLE_OK(b.role)) throw new AppError(422, 'نقش نامعتبر است.', { role: 'نقش نامعتبر است.' });
  if ((b.role && b.role !== user.role) || b.active === false) await lastSuperAdminGuard(user);
  let revoke = false;
  if (typeof b.name === 'string') user.name = b.name;
  if (typeof b.email === 'string') user.email = b.email;
  if (b.role && b.role !== user.role) { user.role = b.role; revoke = true; }
  if (typeof b.active === 'boolean') { if (!b.active) revoke = true; user.active = b.active; }
  if (b.password) { pwError(b.password); user.passwordHash = await M.User.hashPassword(b.password); user.passwordChangedAt = new Date(); revoke = true; }
  if (revoke) user.tokenVersion = (user.tokenVersion || 0) + 1; // نشست‌های فعلی آن کاربر باطل می‌شوند
  await user.save();
  audit(req, 'update', 'users', user._id, user.email);
  return ok(res, user);
});
exports.deleteUser = asyncHandler(async (req, res) => {
  const user = await M.User.findById(req.params.id);
  if (!user) throw new AppError(404, 'مورد پیدا نشد.');
  if (String(user._id) === String(req.user._id)) throw new AppError(400, 'نمی‌توانید حساب خودتان را حذف کنید.');
  await lastSuperAdminGuard(user);
  await user.deleteOne();
  audit(req, 'delete', 'users', user._id, user.email);
  return ok(res, { deleted: req.params.id });
});

// ---------- گزارش فعالیت (فقط super_admin) ----------
exports.auditLog = asyncHandler(async (req, res) => {
  const { limit, page, skip } = paginate(req.query, { limit: 30 });
  const f = {};
  if (typeof req.query.action === 'string' && req.query.action && req.query.action !== 'all') f.action = req.query.action.slice(0, 40);
  if (typeof req.query.resource === 'string' && req.query.resource && req.query.resource !== 'all') f.resource = req.query.resource.slice(0, 40);
  if (typeof req.query.q === 'string' && req.query.q) { const rx = new RegExp(escapeRegex(req.query.q.slice(0, 80)), 'i'); f.$or = [{ userName: rx }, { summary: rx }, { ip: rx }]; }
  const [items, total] = await Promise.all([M.AuditLog.find(f).sort({ createdAt: -1 }).skip(skip).limit(limit), M.AuditLog.countDocuments(f)]);
  return ok(res, items, metaOf(total, page, limit));
});

exports.uploaded = (req, res) => {
  if (!req.file) throw new AppError(400, 'فایلی ارسال نشد.');
  audit(req, 'upload', 'uploads', '', req.file.filename);
  return ok(res, { url: '/uploads/' + req.file.filename, size: req.file.size, type: req.file.mimetype }, undefined, 201);
};
