const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jsonPlugin = require('./plugins');

const ROLES = ['super_admin', 'content_manager', 'receptionist'];
const MAX_FAILED = 5;          // بعد از ۵ تلاش ناموفق پشت‌سرهم…
const LOCK_MINUTES = 15;       // …حساب ۱۵ دقیقه قفل می‌شود

const userSchema = new mongoose.Schema({
  name: { type: String, required: [true, 'نام الزامی است'], trim: true, maxlength: 80 },
  email: { type: String, required: [true, 'ایمیل الزامی است'], unique: true, lowercase: true, trim: true, match: [/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'ایمیل معتبر نیست'] },
  // رمز هرگز خام ذخیره نمی‌شود؛ فقط هش bcrypt. select:false یعنی به‌صورت پیش‌فرض خوانده نمی‌شود.
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ROLES, default: 'content_manager' },
  active: { type: Boolean, default: true },
  lastLoginAt: Date,
  lastLoginIp: { type: String, default: '' },
  // امنیت: قفل موقت پس از تلاش‌های ناموفق، و نسخه‌ی توکن برای باطل کردن همه‌ی نشست‌ها
  failedLogins: { type: Number, default: 0, select: false },
  lockUntil: { type: Date, select: false },
  tokenVersion: { type: Number, default: 0 },
  passwordChangedAt: Date,
}, { timestamps: true });

userSchema.statics.ROLES = ROLES;
userSchema.statics.hashPassword = (plain) => bcrypt.hash(plain, 12);
// سیاست رمز: حداقل ۱۰ نویسه، شامل حرف و عدد
userSchema.statics.passwordProblem = (p) => {
  if (typeof p !== 'string' || p.length < 10 || p.length > 200) return 'رمز عبور باید حداقل ۱۰ نویسه باشد.';
  if (!/[A-Za-z؀-ۿ]/.test(p) || !/\d/.test(p)) return 'رمز عبور باید هم حرف و هم عدد داشته باشد.';
  return '';
};
userSchema.methods.checkPassword = function (plain) { return bcrypt.compare(plain, this.passwordHash); };
userSchema.methods.isLocked = function () { return !!(this.lockUntil && this.lockUntil > new Date()); };
userSchema.methods.registerFailure = function () {
  this.failedLogins = (this.failedLogins || 0) + 1;
  if (this.failedLogins >= MAX_FAILED) { this.lockUntil = new Date(Date.now() + LOCK_MINUTES * 60000); this.failedLogins = 0; }
};
userSchema.plugin(jsonPlugin);
userSchema.set('toJSON', Object.assign({}, userSchema.get('toJSON'), {
  transform(doc, ret) { ret.id = String(ret._id); delete ret._id; delete ret.passwordHash; delete ret.failedLogins; delete ret.lockUntil; delete ret.tokenVersion; return ret; },
}));
module.exports = mongoose.model('User', userSchema);
