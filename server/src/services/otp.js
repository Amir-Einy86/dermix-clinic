/* otp.js — کد تأیید پیامکی موبایل برای ثبت نوبت آنلاین
   - کد ۵ رقمی تصادفی امن (crypto.randomInt)، فقط هش آن ذخیره می‌شود
   - اعتبار کد: ۵ دقیقه؛ حداکثر ۵ بار وارد کردن اشتباه، بعدش کد باطل و باید کد تازه گرفت
   - ارسال دوباره: حداقل ۶۰ ثانیه فاصله و حداکثر ۵ پیامک در ساعت برای هر شماره
   - بعد از وارد کردن کد درست، تا ۱۵ دقیقه برای ثبت نوبت معتبر می‌ماند (اگر ساعت انتخابی پر شد، لازم نیست کد تازه بگیرد)
   - هر کد هم‌زمان فقط در اختیار یک درخواست رزرو است و بعد از موفقیت دوباره قابل استفاده نیست */
const crypto = require('crypto');
const env = require('../config/env');
const M = require('../models');
const AppError = require('../utils/appError');
const sms = require('./sms');

const CODE_TTL = 5 * 60 * 1000;
const VERIFIED_TTL = 15 * 60 * 1000;
const RESEND_GAP = 60 * 1000;
const MAX_PER_HOUR = 5;
const MAX_ATTEMPTS = 5;
const SEND_WINDOW = 60 * 60 * 1000;

const hash = (phone, code) => crypto.createHmac('sha256', env.jwtSecret).update(phone + ':' + code).digest('hex');
const same = (a, b) => a.length === b.length && crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));

const required = () => env.sms.otpRequired && sms.enabled() && !(env.isProd && env.sms.driver === 'log');

exports.required = required;

exports.request = async (phone) => {
  const now = Date.now();
  const prev = await M.PhoneOtp.findOne({ phone });
  const tooSoon = (wait) => new AppError(429, 'برای دریافت دوباره‌ی کد ' + wait + ' ثانیه صبر کنید.', { retryAfter: wait });
  if (prev) {
    const wait = Math.ceil((prev.lastSentAt.getTime() + RESEND_GAP - now) / 1000);
    if (wait > 0) throw tooSoon(wait);
    if (prev.claimId && prev.verifiedUntil > new Date(now)) throw new AppError(409, 'درخواست ثبت نوبت در حال بررسی است.');
  }
  const inWindow = prev && now - prev.windowStart.getTime() < SEND_WINDOW;
  if (inWindow && prev.sentCount >= MAX_PER_HOUR) throw new AppError(429, 'تعداد درخواست کد برای این شماره زیاد بود. یک ساعت دیگر تلاش کنید یا با کلینیک تماس بگیرید.');
  const code = String(crypto.randomInt(10000, 100000));
  const windowStart = inWindow ? prev.windowStart : new Date(now);
  const next = {
    codeHash: hash(phone, code), attempts: 0, lastSentAt: new Date(now), validUntil: new Date(now + CODE_TTL),
    expiresAt: new Date(Math.max(windowStart.getTime() + SEND_WINDOW, now + VERIFIED_TTL)),
    verifiedUntil: null, claimId: null, consumed: false, windowStart, sentCount: inWindow ? prev.sentCount + 1 : 1,
  };
  try {
    if (prev) {
      const result = await M.PhoneOtp.updateOne({
        _id: prev._id, lastSentAt: prev.lastSentAt, claimId: prev.claimId ?? null,
      }, { $set: next });
      if (!result.matchedCount) throw tooSoon(RESEND_GAP / 1000);
    } else {
      await M.PhoneOtp.create({ phone, ...next });
    }
  } catch (error) {
    if (error.code === 11000) throw tooSoon(RESEND_GAP / 1000);
    throw error;
  }
  try { await sms.send(phone, 'otp', { token: code }); }
  catch (e) {
    await M.PhoneOtp.updateOne({ phone, lastSentAt: next.lastSentAt }, { $set: { consumed: true } });
    if (process.env.NODE_ENV !== 'test') console.error('✖ ارسال کد تأیید به ' + sms.mask(phone) + ' ناموفق بود.');
    throw new AppError(503, 'ارسال پیامک انجام نشد. چند دقیقه‌ی دیگر دوباره تلاش کنید یا با کلینیک تماس بگیرید.');
  }
  return { resendIn: RESEND_GAP / 1000 };
};

/* بررسی کد هنگام ثبت نوبت. خطای اعتبارسنجی روی فیلد otp برمی‌گرداند. */
exports.claim = async (phone, code) => {
  const bad = (msg) => new AppError(422, 'لطفاً خطاهای فرم را اصلاح کنید.', { otp: msg });
  const clean = String(code == null ? '' : code).replace(/[۰-۹]/g, (d) => '۰۱۲۳۴۵۶۷۸۹'.indexOf(d)).trim();
  if (!/^\d{5}$/.test(clean)) throw bad('کد تأیید ۵ رقمی پیامک‌شده را وارد کنید.');
  const doc = await M.PhoneOtp.findOne({ phone });
  const now = new Date();
  if (!doc || doc.consumed || (doc.verifiedUntil || doc.validUntil || doc.expiresAt) <= now) {
    throw bad('کد تأیید منقضی شده است؛ کد تازه بگیرید.');
  }
  if (doc.attempts >= MAX_ATTEMPTS) throw bad('کد را چند بار اشتباه وارد کردید؛ کد تازه بگیرید.');
  const current = { _id: doc._id, lastSentAt: doc.lastSentAt, attempts: { $lt: MAX_ATTEMPTS }, claimId: null, consumed: { $ne: true } };
  if (!same(doc.codeHash, hash(phone, clean))) {
    await M.PhoneOtp.updateOne(current, { $inc: { attempts: 1 } });
    throw bad('کد تأیید نادرست است.');
  }
  const claimId = crypto.randomUUID();
  const until = doc.verifiedUntil || new Date(now.getTime() + VERIFIED_TTL);
  const result = await M.PhoneOtp.updateOne(current, {
    $set: { claimId, verifiedUntil: until },
    $max: { expiresAt: until },
  });
  if (!result.matchedCount) throw bad('این کد در دسترس نیست؛ وضعیت نوبت را بررسی کنید یا کد تازه بگیرید.');
  return { _id: doc._id, claimId };
};

exports.finish = async (claim, consumed) => {
  try {
    await M.PhoneOtp.updateOne(claim, { $set: { consumed }, $unset: { claimId: 1 } });
  } catch (error) {
    // نتیجه‌ی ثبت نوبت به پاک‌سازی کد وابسته نیست. قفل کد تا انقضا جلوی استفاده‌ی مجدد را می‌گیرد.
    if (process.env.NODE_ENV !== 'test') console.error('✖ به‌روزرسانی وضعیت کد تأیید ناموفق بود.');
  }
};
