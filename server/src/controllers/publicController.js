/* publicController.js — تنظیمات، آمار، دسته‌بندی‌ها، نوبت‌دهی آنلاین و فرم تماس */
const crypto = require('crypto');
const env = require('../config/env');
const M = require('../models');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const { ok } = require('../utils/respond');
const booking = require('../services/booking');
const otp = require('../services/otp');
const sms = require('../services/sms');
const { validateAppointment, validateMessage, validateLookup } = require('../validators/forms');

exports.settings = asyncHandler(async (req, res) => ok(res, await M.SiteSetting.getSingleton()));

exports.statistics = asyncHandler(async (req, res) => {
  const [stat, branches] = await Promise.all([M.Statistic.getSingleton(), M.Branch.countDocuments({ active: { $ne: false } })]);
  return ok(res, { patients: stat.patients, wounds: stat.wounds, years: stat.years, branches });
});

exports.categories = (scope) => asyncHandler(async (req, res) => ok(res, await M.ArticleCategory.find({ scope }).sort({ createdAt: 1 })));

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // بدون حروف شبیه هم (O/0 و I/1)
const makeRef = () => {
  const d = new Date(); const p = (n) => String(n).padStart(2, '0');
  const rnd = Array.from({ length: 10 }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');
  return 'DMX-' + String(d.getFullYear()).slice(2) + p(d.getMonth() + 1) + p(d.getDate()) + '-' + rnd;
};
exports.makeRef = makeRef;
const onlineBookingEnabled = () => !env.isProd || otp.required();

const activeBranch = async (slug) => {
  const branch = await M.Branch.findOne({ slug: String(slug || ''), active: { $ne: false } });
  if (!branch) throw new AppError(422, 'لطفاً خطاهای فرم را اصلاح کنید.', { branch: 'شعبه‌ی انتخابی معتبر نیست.' });
  return branch;
};

// GET /api/availability?branch=slug&from=YYYY-MM-DD&days=14
exports.availability = asyncHandler(async (req, res) => {
  const branch = await activeBranch(req.query.branch);
  const s = booking.settingsOf(branch);
  if (!onlineBookingEnabled()) return ok(res, { branch: branch.slug, enabled: false, slotMinutes: s.slotMinutes, otpRequired: false, days: [] });
  const days = await booking.availability(branch, String(req.query.from || ''), req.query.days);
  return ok(res, { branch: branch.slug, enabled: s.enabled, slotMinutes: s.slotMinutes, otpRequired: otp.required(), days });
});

/* ساخت نوبت (مشترک بین رزرو آنلاین و ثبت توسط پذیرش)
   ترتیب: اعتبارسنجی → بررسی بازه → رزرو اتمیک ظرفیت → ساخت پرونده‌ی بیمار → ساخت نوبت (در صورت خطا، ظرفیت آزاد می‌شود) */
const MAX_ACTIVE_PER_PHONE = 3;
exports.bookAppointment = async (input, { staff, user, source, status } = {}) => {
  const { errors, data } = validateAppointment(input, { staff });
  if (Object.keys(errors).length) throw new AppError(422, 'لطفاً خطاهای فرم را اصلاح کنید.', errors);
  const branch = await activeBranch(data.branch);
  if (data.visitType === 'home' && !branch.homeVisit) throw new AppError(422, 'لطفاً خطاهای فرم را اصلاح کنید.', { visitType: 'این شعبه ویزیت در منزل ندارد.' });
  const slot = booking.assertBookable(branch, data.date, data.time, { online: !staff });

  if (!staff) {
    const active = await M.Appointment.find({ phone: data.phone, status: { $in: M.Appointment.CANCELLABLE }, startAt: { $gte: new Date() } });
    const sameDay = active.find((a) => a.branch === data.branch && a.date === data.date);
    if (sameDay) throw new AppError(409, 'شما برای همین روز در این شعبه نوبت دارید. شماره‌ی پیگیری: ' + sameDay.referenceNumber, { duplicateOf: sameDay.referenceNumber });
    if (active.length >= MAX_ACTIVE_PER_PHONE) throw new AppError(409, 'با این شماره ' + MAX_ACTIVE_PER_PHONE + ' نوبت فعال دارید. برای نوبت بیشتر با کلینیک تماس بگیرید.');
  }

  await booking.reserve(branch.slug, data.date, data.time, slot.capacity);
  try {
    const patient = await M.Patient.findOneAndUpdate(
      { phone: data.phone },
      { $set: { fullName: data.fullName }, $inc: { appointmentsCount: 1 }, $max: { lastAppointmentAt: slot.startAt } },
      { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true },
    );
    let doc;
    for (let i = 0; i < 5 && !doc; i += 1) {
      try {
        doc = await M.Appointment.create({
          ...data, branchName: branch.name, patient: patient._id, startAt: slot.startAt, durationMin: slot.durationMin,
          referenceNumber: makeRef(), status: status || 'جدید', source: source || 'online',
          history: [{ action: 'created', by: user && user._id, byName: user ? user.name : 'بیمار (آنلاین)', note: '' }],
        });
      } catch (e) { if (!(e.code === 11000 && e.keyPattern && e.keyPattern.referenceNumber)) throw e; }
    }
    if (!doc) throw new AppError(500, 'ثبت نوبت انجام نشد؛ دوباره تلاش کنید.');
    return doc;
  } catch (e) {
    await booking.release(branch.slug, data.date, data.time);
    throw e;
  }
};

exports.createAppointment = asyncHandler(async (req, res) => {
  if (!onlineBookingEnabled()) throw new AppError(503, 'نوبت‌دهی آنلاین فعلاً غیرفعال است؛ لطفاً با کلینیک تماس بگیرید.');
  const body = req.body || {};
  // honeypot: فیلد مخفی را فقط ربات پر می‌کند؛ پاسخ موفق ساختگی می‌دهیم و چیزی ذخیره نمی‌کنیم
  if (body.website) return ok(res, { referenceNumber: makeRef(), status: 'جدید' }, undefined, 201);
  // کد تأیید پیامکی: قبل از هر کار دیگری بررسی می‌شود (موبایل باید واقعاً مال همین شخص باشد)
  const needOtp = otp.required();
  let claim;
  if (needOtp) {
    // اول خود فرم (تا کاربر همه‌ی خطاها را با هم ببیند)، بعد کد تأیید
    const { errors, data } = validateAppointment(body);
    if (Object.keys(errors).length) throw new AppError(422, 'لطفاً خطاهای فرم را اصلاح کنید.', errors);
    claim = await otp.claim(data.phone, body.otp);
  }
  let doc;
  try {
    doc = await exports.bookAppointment(body, {});
  } catch (error) {
    if (claim) await otp.finish(claim, false);
    throw error;
  }
  if (claim) await otp.finish(claim, true);
  sms.notify(doc.phone, 'booked', sms.apptTokens(doc)); // شماره‌ی پیگیری با پیامک (شکست آن جلوی ثبت را نمی‌گیرد)
  // فقط اطلاعات لازم برای نمایش رسید برمی‌گردد، نه اطلاعات شخصی
  return ok(res, { referenceNumber: doc.referenceNumber, status: doc.status, date: doc.date, time: doc.time, branchName: doc.branchName, visitType: doc.visitType }, undefined, 201);
});

// درخواست کد تأیید پیامکی برای ثبت نوبت
exports.requestOtp = asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (body.website) return ok(res, { resendIn: 60 }); // honeypot
  if (!otp.required()) return ok(res, { required: false });
  const phone = String(typeof body.phone === 'string' ? body.phone : '').replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).replace(/[\s-]/g, '');
  if (!/^09\d{9}$/.test(phone)) throw new AppError(422, 'لطفاً خطاهای فرم را اصلاح کنید.', { phone: 'شماره موبایل معتبر نیست؛ مثال: ۰۹۱۲۳۴۵۶۷۸۹' });
  return ok(res, await otp.request(phone));
});

// پیگیری توسط بیمار — پاسخ یکسان برای «پیدا نشد» و «موبایل اشتباه» (جلوگیری از حدس)
const findOwn = async (body) => {
  const { errors, data } = validateLookup(body || {});
  if (Object.keys(errors).length) throw new AppError(422, 'لطفاً خطاهای فرم را اصلاح کنید.', errors);
  const doc = await M.Appointment.findOne({ referenceNumber: data.referenceNumber, phone: data.phone });
  if (!doc) throw new AppError(404, 'نوبتی با این شماره‌ی پیگیری و موبایل پیدا نشد.');
  return { doc, data };
};
const receipt = (d) => {
  const lead = 2 * 60 * 60 * 1000;
  return {
    referenceNumber: d.referenceNumber, status: d.status, date: d.date || '', time: d.time || '', branchName: d.branchName || d.branch,
    visitType: d.visitType, fullName: d.fullName.replace(/^(\S+).*/, '$1') + ' …', // فقط بخش اول نام
    canCancel: M.Appointment.CANCELLABLE.includes(d.status) && (!d.startAt || d.startAt.getTime() > Date.now() + lead),
    preferredDate: d.preferredDate || '', createdAt: d.createdAt,
  };
};

exports.lookupAppointment = asyncHandler(async (req, res) => ok(res, receipt((await findOwn(req.body)).doc)));

exports.cancelAppointment = asyncHandler(async (req, res) => {
  const { doc, data } = await findOwn(req.body);
  if (!receipt(doc).canCancel) throw new AppError(409, 'این نوبت دیگر از طریق سایت قابل لغو نیست؛ لطفاً با کلینیک تماس بگیرید.');
  const cancelled = await M.Appointment.findOneAndUpdate({
    _id: doc._id, status: doc.status, branch: doc.branch, date: doc.date ?? null, time: doc.time ?? null,
    startAt: doc.startAt ?? null,
  }, {
    $set: { status: 'لغو شده', cancelledAt: new Date(), cancelReason: data.reason },
    $push: { history: { action: 'cancel', byName: 'بیمار (آنلاین)', note: data.reason } },
    $inc: { __v: 1 },
  }, { returnDocument: 'after' });
  if (!cancelled) throw new AppError(409, 'وضعیت نوبت تغییر کرده است. دوباره آن را پیگیری کنید.');
  await booking.release(doc.branch, doc.date, doc.time);
  return ok(res, receipt(cancelled));
});

exports.createMessage = asyncHandler(async (req, res) => {
  const body = req.body || {};
  if (body.website) return ok(res, { received: true }, undefined, 201);
  const { errors, data } = validateMessage(body);
  if (Object.keys(errors).length) throw new AppError(422, 'لطفاً خطاهای فرم را اصلاح کنید.', errors);
  await M.ContactMessage.create(data);
  return ok(res, { received: true }, undefined, 201);
});
