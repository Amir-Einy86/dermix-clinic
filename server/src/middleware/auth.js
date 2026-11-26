/* auth.js — احراز هویت (JWT در کوکی httpOnly یا هدر Bearer) و کنترل نقش */
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const { User, RevokedToken } = require('../models');

const tokenFrom = (req) => {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7);
  return req.cookies && req.cookies[env.cookieName];
};

// v = نسخه‌ی توکن؛ با تغییر رمز یا «خروج از همه‌ی دستگاه‌ها» بالا می‌رود و توکن‌های قبلی باطل می‌شوند
// jti = شناسه‌ی یکتای همین توکن؛ با «خروج» فقط همین توکن باطل می‌شود (دستگاه‌های دیگر وارد می‌مانند)
exports.signToken = (user) => jwt.sign({ sub: String(user._id), role: user.role, v: user.tokenVersion || 0, jti: crypto.randomUUID() }, env.jwtSecret, { expiresIn: env.jwtExpires, algorithm: 'HS256' });

// باطل کردن توکن فعلی درخواست (برای خروج). توکن نامعتبر یا منقضی نیازی به ثبت ندارد.
exports.revokeCurrentToken = async (req) => {
  const token = tokenFrom(req);
  if (!token) return;
  let payload;
  try { payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] }); } catch (e) { return; }
  if (!payload.jti || !payload.exp) return;
  await RevokedToken.updateOne({ jti: payload.jti }, { $setOnInsert: { jti: payload.jti, expiresAt: new Date(payload.exp * 1000) } }, { upsert: true });
};

exports.authenticate = asyncHandler(async (req, res, next) => {
  const token = tokenFrom(req);
  if (!token) throw new AppError(401, 'برای ادامه باید وارد پنل مدیریت شوید.');
  let payload;
  try { payload = jwt.verify(token, env.jwtSecret, { algorithms: ['HS256'] }); } catch (e) { throw new AppError(401, 'نشست شما منقضی شده است؛ دوباره وارد شوید.'); }
  if (payload.jti && (await RevokedToken.exists({ jti: payload.jti }))) throw new AppError(401, 'نشست شما بسته شده است؛ دوباره وارد شوید.');
  const user = await User.findById(payload.sub);
  if (!user || !user.active) throw new AppError(401, 'حساب کاربری معتبر نیست.');
  if ((payload.v || 0) !== (user.tokenVersion || 0)) throw new AppError(401, 'نشست شما باطل شده است؛ دوباره وارد شوید.');
  req.user = user; // نقش را از دیتابیس می‌خوانیم، نه از توکن
  res.set('Cache-Control', 'no-store'); // پاسخ‌های مدیریتی در کش مرورگر/پراکسی نمانند
  next();
});

exports.requireRole = (...roles) => (req, res, next) => {
  if (!req.user || !roles.includes(req.user.role)) return next(new AppError(403, 'شما دسترسی لازم برای این کار را ندارید.'));
  next();
};

// دفاع در برابر CSRF: درخواست‌های تغییردهنده با هدر Origin از دامنه‌ی دیگر رد می‌شوند
exports.sameOrigin = (req, res, next) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
  const origin = req.headers.origin;
  const siteOrigin = env.isProd ? env.siteUrl : req.protocol + '://' + req.get('host');
  if (!origin || origin === siteOrigin || origin === env.corsOrigin) return next();
  return next(new AppError(403, 'درخواست از مبدأ نامعتبر ارسال شده است.'));
};
