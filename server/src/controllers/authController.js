/* authController.js — ورود، خروج، تغییر رمز و اطلاعات کاربر فعلی */
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const { User } = require('../models');
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const audit = require('../utils/audit');
const { ok } = require('../utils/respond');
const { signToken, revokeCurrentToken } = require('../middleware/auth');
const { validateLogin } = require('../validators/forms');

const DUMMY_HASH = bcrypt.hashSync('dummy-password-for-timing', 12); // برای یکسان‌سازی زمان پاسخ وقتی ایمیل وجود ندارد
const publicUser = (u) => ({ id: String(u._id), name: u.name, email: u.email, role: u.role, lastLoginAt: u.lastLoginAt, passwordChangedAt: u.passwordChangedAt });
const cookieOpts = () => ({ httpOnly: true, sameSite: 'strict', secure: env.isProd, path: '/' });
const setCookie = (res, user) => res.cookie(env.cookieName, signToken(user), { ...cookieOpts(), maxAge: 8 * 60 * 60 * 1000 });
/* یک پیام و یک کد وضعیت برای همه‌ی ورودهای ناموفق: ایمیل ناموجود، رمز اشتباه، حساب غیرفعال و حساب قفل‌شده.
   اگر پاسخ حساب قفل‌شده فرق داشت، مهاجم با چند تلاش می‌فهمید کدام ایمیل حساب مدیریتی واقعی دارد. */
const LOGIN_FAILED = 'ایمیل یا رمز عبور نادرست است. پس از چند تلاش ناموفق پشت‌سرهم، ورود تا ۱۵ دقیقه مسدود می‌شود.';

exports.login = asyncHandler(async (req, res) => {
  const { errors, data } = validateLogin(req.body || {});
  if (Object.keys(errors).length) throw new AppError(422, 'اطلاعات ورود نادرست است.', errors);
  const user = await User.findOne({ email: data.email }).select('+passwordHash +failedLogins +lockUntil');
  if (user && user.isLocked()) {
    await bcrypt.compare(data.password, DUMMY_HASH); // زمان پاسخ مثل بقیه‌ی حالت‌ها بماند
    audit(req, 'login_locked', 'auth', user._id, data.email);
    throw new AppError(401, LOGIN_FAILED); // همان پاسخِ «رمز نادرست»: قفل بودن حساب لو نمی‌رود
  }
  const valid = user ? await user.checkPassword(data.password) : (await bcrypt.compare(data.password, DUMMY_HASH), false);
  if (!valid || !user.active) {
    if (user) { user.registerFailure(); await user.save(); }
    audit(req, 'login_failed', 'auth', user && user._id, data.email);
    throw new AppError(401, LOGIN_FAILED);
  }
  user.failedLogins = 0; user.lockUntil = undefined;
  user.lastLoginAt = new Date(); user.lastLoginIp = String(req.ip || '').slice(0, 64);
  await user.save();
  setCookie(res, user);
  req.user = user; audit(req, 'login', 'auth', user._id, '');
  return ok(res, publicUser(user));
});

exports.me = (req, res) => ok(res, publicUser(req.user));

// خروج: کوکی پاک می‌شود و خود توکن هم در سرور باطل می‌شود (اگر کسی کوکی را کپی کرده باشد، دیگر کار نمی‌کند)
exports.logout = asyncHandler(async (req, res) => {
  await revokeCurrentToken(req);
  res.clearCookie(env.cookieName, cookieOpts());
  return ok(res, { loggedOut: true });
});

// خروج از همه‌ی دستگاه‌ها: همه‌ی توکن‌های صادرشده باطل می‌شوند
exports.logoutAll = asyncHandler(async (req, res) => {
  req.user.tokenVersion = (req.user.tokenVersion || 0) + 1;
  await req.user.save();
  audit(req, 'logout_all', 'auth', req.user._id, '');
  res.clearCookie(env.cookieName, cookieOpts());
  return ok(res, { loggedOut: true });
});

exports.changePassword = asyncHandler(async (req, res) => {
  const b = req.body || {};
  const user = await User.findById(req.user._id).select('+passwordHash');
  if (typeof b.currentPassword !== 'string' || !(await user.checkPassword(b.currentPassword))) throw new AppError(422, 'رمز فعلی نادرست است.', { currentPassword: 'رمز فعلی نادرست است.' });
  const problem = User.passwordProblem(b.newPassword);
  if (problem) throw new AppError(422, problem, { newPassword: problem });
  if (b.newPassword === b.currentPassword) throw new AppError(422, 'رمز جدید باید با رمز فعلی فرق داشته باشد.', { newPassword: 'رمز جدید باید با رمز فعلی فرق داشته باشد.' });
  user.passwordHash = await User.hashPassword(b.newPassword);
  user.passwordChangedAt = new Date();
  user.tokenVersion = (user.tokenVersion || 0) + 1; // نشست‌های دیگر باطل می‌شوند…
  await user.save();
  setCookie(res, user);                              // …ولی همین نشست با توکن تازه ادامه می‌دهد
  audit(req, 'password_change', 'users', user._id, '');
  return ok(res, { changed: true });
});
