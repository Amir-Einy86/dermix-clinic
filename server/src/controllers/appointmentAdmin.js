/* appointmentAdmin.js — مدیریت نوبت‌ها، تقویم روزانه و پرونده‌ی بیماران (پنل مدیریت) */
const mongoose = require('mongoose');
const M = require('../models');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../utils/audit');
const T = require('../utils/time');
const booking = require('../services/booking');
const sms = require('../services/sms');
const { ok, paginate, metaOf } = require('../utils/respond');
const { escapeRegex, normalizeDigits } = require('../utils/text');
const { bookAppointment } = require('./publicController');

const { STATUSES, HOLDING } = M.Appointment;
const qstr = (v, max) => (typeof v === 'string' ? v.slice(0, max || 80) : '');
const isId = (v) => typeof v === 'string' && mongoose.isValidObjectId(v);

// ---------- لیست با فیلتر ----------
exports.list = asyncHandler(async (req, res) => {
  const q = req.query;
  const { limit, page, skip } = paginate(q, { limit: 20 });
  const f = {};
  const status = qstr(q.status); if (status && status !== 'all') f.status = status;
  const branch = qstr(q.branch); if (branch && branch !== 'all') f.branch = branch;
  const source = qstr(q.source); if (source && source !== 'all') f.source = source;
  const date = qstr(q.date, 10); const from = qstr(q.from, 10); const to = qstr(q.to, 10);
  if (T.isValidDate(date)) f.date = date;
  else if (T.isValidDate(from) || T.isValidDate(to)) { f.date = {}; if (T.isValidDate(from)) f.date.$gte = from; if (T.isValidDate(to)) f.date.$lte = to; }
  if (q.upcoming === '1') f.startAt = { $gte: new Date() };
  if (isId(q.patient)) f.patient = q.patient;
  const text = qstr(q.q);
  if (text) { const rx = new RegExp(escapeRegex(normalizeDigits(text)), 'i'); f.$or = [{ fullName: rx }, { phone: rx }, { referenceNumber: rx }]; }
  const sort = q.sort === 'time' || q.upcoming === '1' || f.date ? { startAt: 1, time: 1 } : { createdAt: -1 };
  const [items, total] = await Promise.all([M.Appointment.find(f).sort(sort).skip(skip).limit(limit), M.Appointment.countDocuments(f)]);
  return ok(res, items, metaOf(total, page, limit));
});

exports.get = asyncHandler(async (req, res) => {
  const doc = await M.Appointment.findById(req.params.id);
  if (!doc) throw new AppError(404, 'مورد پیدا نشد.');
  const visits = doc.patient ? await M.Appointment.countDocuments({ patient: doc.patient }) : 1;
  return ok(res, Object.assign(doc.toJSON(), { patientVisits: visits }));
});

// ---------- ثبت نوبت توسط پذیرش (تلفنی/حضوری) ----------
exports.create = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const source = ['phone', 'walk_in', 'admin'].includes(b.source) ? b.source : 'phone';
  const status = STATUSES.includes(b.status) && HOLDING.includes(b.status) ? b.status : 'تأیید شده';
  const doc = await bookAppointment(b, { staff: true, user: req.user, source, status });
  audit(req, 'create', 'appointments', doc._id, doc.referenceNumber + ' — ' + doc.date + ' ' + doc.time);
  sms.notify(doc.phone, 'booked', sms.apptTokens(doc)); // شماره‌ی پیگیری برای نوبت تلفنی هم پیامک می‌شود
  return ok(res, doc, undefined, 201);
});

/* ---------- ویرایش: وضعیت، یادداشت، مسئول، جابجایی زمان ----------
   ظرفیت به‌درستی نگه داشته می‌شود: اگر نوبت از «لغو» برگردد یا به زمان دیگری برود، جای جدید رزرو و جای قبلی آزاد می‌شود. */
exports.update = asyncHandler(async (req, res) => {
  const doc = await M.Appointment.findById(req.params.id);
  if (!doc) throw new AppError(404, 'مورد پیدا نشد.');
  const b = req.body || {};
  const by = { by: req.user._id, byName: req.user.name };
  const before = { status: doc.status, branch: doc.branch, date: doc.date, time: doc.time };
  const notes = [];

  if (b.status !== undefined) {
    if (!STATUSES.includes(b.status)) throw new AppError(422, 'وضعیت نامعتبر است.', { status: 'وضعیت نامعتبر است.' });
    if (b.status !== doc.status) {
      doc.history.push({ ...by, action: 'status', note: doc.status + ' ← ' + b.status });
      notes.push('وضعیت: ' + b.status);
      doc.status = b.status;
      if (b.status === 'لغو شده') { doc.cancelledAt = new Date(); doc.cancelReason = typeof b.cancelReason === 'string' ? b.cancelReason.slice(0, 300) : ''; }
    }
  }
  if (typeof b.internalNote === 'string' && b.internalNote !== doc.internalNote) {
    doc.internalNote = b.internalNote; doc.history.push({ ...by, action: 'note', note: '' });
  }
  if (b.assignedTo !== undefined) {
    if (b.assignedTo === null || b.assignedTo === '') doc.assignedTo = undefined;
    else {
      if (!isId(b.assignedTo) || !(await M.TeamMember.exists({ _id: b.assignedTo }))) throw new AppError(422, 'عضو تیم انتخاب‌شده معتبر نیست.', { assignedTo: 'عضو تیم معتبر نیست.' });
      doc.assignedTo = b.assignedTo;
    }
    doc.history.push({ ...by, action: 'assign', note: '' });
  }

  // جابجایی زمان
  let slotCap = null;
  const wantsMove = (b.date && b.date !== doc.date) || (b.time && b.time !== doc.time) || (b.branch && b.branch !== doc.branch);
  if (wantsMove) {
    const branch = await M.Branch.findOne({ slug: String(b.branch || doc.branch) });
    if (!branch) throw new AppError(422, 'شعبه معتبر نیست.', { branch: 'شعبه معتبر نیست.' });
    const date = String(b.date || doc.date || ''); const time = String(b.time || doc.time || '');
    const slot = booking.assertBookable(branch, date, time, { online: false });
    doc.history.push({ ...by, action: 'reschedule', note: (doc.date || '—') + ' ' + (doc.time || '') + ' ← ' + date + ' ' + time });
    notes.push('جابجایی به ' + date + ' ' + time);
    Object.assign(doc, { branch: branch.slug, branchName: branch.name, date, time, startAt: slot.startAt, durationMin: slot.durationMin });
    slotCap = slot.capacity;
  }

  // مدیریت ظرفیت
  const key = (x) => x.branch + '|' + x.date + '|' + x.time;
  const heldBefore = HOLDING.includes(before.status) && before.date && before.time;
  const holdsAfter = HOLDING.includes(doc.status) && doc.date && doc.time;
  const needNew = holdsAfter && (!heldBefore || key(before) !== key(doc));
  if (needNew) {
    if (slotCap == null) { const br = await M.Branch.findOne({ slug: doc.branch }); slotCap = booking.settingsOf(br).capacity; }
    await booking.reserve(doc.branch, doc.date, doc.time, slotCap);
  }
  if (wantsMove) doc.reminderSentAt = null; // زمان عوض شد: یادآوری دوباره فرستاده شود
  try {
    await doc.save();
  } catch (error) {
    if (needNew) await booking.release(doc.branch, doc.date, doc.time);
    if (error.name === 'VersionError') throw new AppError(409, 'نوبت هم‌زمان تغییر کرده است. آن را دوباره باز کنید.');
    throw error;
  }
  if (heldBefore && (!holdsAfter || key(before) !== key(doc))) await booking.release(before.branch, before.date, before.time);

  if (notes.length) audit(req, 'update', 'appointments', doc._id, doc.referenceNumber + ' — ' + notes.join('، '));
  // پیامک به بیمار: تأیید یا لغو توسط کلینیک، یا جابجایی زمان نوبت
  if (doc.status !== before.status && doc.status === 'تأیید شده') sms.notify(doc.phone, 'status', { token: doc.referenceNumber, token10: 'تأیید شد' });
  else if (doc.status !== before.status && doc.status === 'لغو شده') sms.notify(doc.phone, 'status', { token: doc.referenceNumber, token10: 'لغو شد' });
  else if (wantsMove && HOLDING.includes(doc.status)) sms.notify(doc.phone, 'booked', sms.apptTokens(doc)); // زمان جدید با پیامک
  return ok(res, doc);
});

exports.remove = asyncHandler(async (req, res) => {
  const doc = await M.Appointment.findByIdAndDelete(req.params.id);
  if (!doc) throw new AppError(404, 'مورد پیدا نشد.');
  if (HOLDING.includes(doc.status)) await booking.release(doc.branch, doc.date, doc.time);
  if (doc.patient) await M.Patient.updateOne({ _id: doc.patient, appointmentsCount: { $gt: 0 } }, { $inc: { appointmentsCount: -1 } });
  audit(req, 'delete', 'appointments', doc._id, doc.referenceNumber);
  return ok(res, { deleted: req.params.id });
});

// ---------- تقویم یک روز یک شعبه ----------
exports.calendar = asyncHandler(async (req, res) => {
  const branch = await M.Branch.findOne({ slug: qstr(req.query.branch) });
  if (!branch) throw new AppError(422, 'شعبه را انتخاب کنید.', { branch: 'شعبه را انتخاب کنید.' });
  const date = T.isValidDate(qstr(req.query.date, 10)) ? req.query.date : T.localDate();
  const s = booking.settingsOf(branch);
  const [day] = await booking.availability(branch, date, 1, { ignoreLead: true });
  const appointments = await M.Appointment.find({ branch: branch.slug, date }).sort({ time: 1, createdAt: 1 });
  return ok(res, { date, weekday: T.weekday(date), branch: { slug: branch.slug, name: branch.name }, capacity: s.capacity, slotMinutes: s.slotMinutes, closed: !day || day.closed, slots: day ? day.slots : [], appointments });
});

// ---------- بیماران ----------
exports.patients = asyncHandler(async (req, res) => {
  const { limit, page, skip } = paginate(req.query, { limit: 20 });
  const text = qstr(req.query.q);
  const f = text ? { $or: [{ fullName: new RegExp(escapeRegex(text), 'i') }, { phone: new RegExp(escapeRegex(normalizeDigits(text)), 'i') }] } : {};
  const [items, total] = await Promise.all([M.Patient.find(f).sort({ lastAppointmentAt: -1, createdAt: -1 }).skip(skip).limit(limit), M.Patient.countDocuments(f)]);
  return ok(res, items, metaOf(total, page, limit));
});
exports.patient = asyncHandler(async (req, res) => {
  const p = await M.Patient.findById(req.params.id);
  if (!p) throw new AppError(404, 'بیمار پیدا نشد.');
  const appointments = await M.Appointment.find({ patient: p._id }).sort({ startAt: -1, createdAt: -1 }).limit(100);
  return ok(res, Object.assign(p.toJSON(), { appointments }));
});
exports.updatePatient = asyncHandler(async (req, res) => {
  const p = await M.Patient.findById(req.params.id);
  if (!p) throw new AppError(404, 'بیمار پیدا نشد.');
  const b = req.body || {};
  if (typeof b.notes === 'string') p.notes = b.notes;
  if (typeof b.fullName === 'string') p.fullName = b.fullName;
  await p.save();
  audit(req, 'update', 'patients', p._id, 'پرونده‌ی بیمار'); // فقط شناسه؛ نام بیمار در گزارش فعالیت تکرار نمی‌شود
  return ok(res, p);
});
