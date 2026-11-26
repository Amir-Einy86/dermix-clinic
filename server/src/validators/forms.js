/* forms.js — اعتبارسنجی فرم‌ها (قوانین همان فرانت‌اند؛ اعتبارسنجی سمت سرور مرجع اصلی است)
   فقط فیلدهای مجاز از بدنه برداشته می‌شوند (جلوگیری از mass assignment). */
const { normalizeDigits } = require('../utils/text');
const { isValidDate, TIME_RE } = require('../utils/time');

const WOUND_TYPES = ['diabetic', 'pressure', 'venous', 'arterial', 'burn', 'surgical', 'unknown'];
const PHONE_RE = /^09\d{9}$/;
const REF_RE = /^(?:(?:DMX|ALT)-\d{6}-[A-Z2-9]{4}|DMX-\d{6}-[A-Z2-9]{10})$/;
const cleanPhone = (v) => normalizeDigits(typeof v === 'string' || typeof v === 'number' ? v : '').replace(/[\s-]/g, '');
const str = (v, max) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '').trim().slice(0, max);

/* نوبت: هم فرم عمومی و هم ثبت توسط پذیرش. opts.staff → رضایت تماس لازم نیست */
exports.validateAppointment = (b, opts = {}) => {
  const errors = {};
  const data = {
    fullName: str(b.fullName, 100), phone: cleanPhone(b.phone), branch: str(b.branch, 60), woundType: str(b.woundType, 30),
    visitType: b.visitType === 'home' ? 'home' : 'clinic', address: str(b.address, 400),
    date: normalizeDigits(str(b.date, 10)), time: normalizeDigits(str(b.time, 5)), description: str(b.description, 1000),
  };
  if (data.fullName.length < 3) errors.fullName = 'نام و نام خانوادگی را کامل وارد کنید (حداقل ۳ حرف).';
  if (!PHONE_RE.test(data.phone)) errors.phone = 'شماره موبایل معتبر نیست؛ مثال: ۰۹۱۲۳۴۵۶۷۸۹';
  if (!data.branch) errors.branch = 'شعبه را انتخاب کنید.';
  if (!WOUND_TYPES.includes(data.woundType)) errors.woundType = 'نوع زخم را انتخاب کنید.';
  if (!isValidDate(data.date)) errors.date = 'روز نوبت را انتخاب کنید.';
  if (!TIME_RE.test(data.time)) errors.time = 'ساعت نوبت را انتخاب کنید.';
  if (data.visitType === 'home' && data.address.length < 10) errors.address = 'برای ویزیت در منزل، آدرس کامل را وارد کنید.';
  if (!opts.staff && b.consent !== true) errors.consent = 'برای ثبت نوبت باید با تماس کلینیک موافقت کنید.';
  return { errors, data };
};

// پیگیری/لغو نوبت توسط بیمار: شماره‌ی پیگیری + موبایل (هر دو لازم‌اند تا حدس زدن سخت باشد)
exports.validateLookup = (b) => {
  const errors = {};
  const data = { referenceNumber: normalizeDigits(str(b.referenceNumber, 40)).toUpperCase(), phone: cleanPhone(b.phone), reason: str(b.reason, 300) };
  if (!REF_RE.test(data.referenceNumber)) errors.referenceNumber = 'شماره‌ی پیگیری را دقیقاً مطابق رسید نوبت وارد کنید.';
  if (!PHONE_RE.test(data.phone)) errors.phone = 'شماره موبایل معتبر نیست؛ مثال: ۰۹۱۲۳۴۵۶۷۸۹';
  return { errors, data };
};

exports.validateMessage = (b) => {
  const errors = {};
  const data = { name: str(b.name, 100), phone: cleanPhone(b.phone), message: str(b.message, 2000) };
  if (data.name.length < 3) errors.name = 'نام و نام خانوادگی را کامل وارد کنید (حداقل ۳ حرف).';
  if (!PHONE_RE.test(data.phone)) errors.phone = 'شماره موبایل معتبر نیست؛ مثال: ۰۹۱۲۳۴۵۶۷۸۹';
  if (!data.message) errors.message = 'متن پیام را بنویسید.';
  return { errors, data };
};

exports.validateLogin = (b) => {
  const errors = {};
  const email = str(b.email, 120).toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'ایمیل معتبر وارد کنید.';
  if (typeof b.password !== 'string' || b.password.length < 8 || b.password.length > 200) errors.password = 'رمز عبور حداقل ۸ نویسه است.';
  return { errors, data: { email, password: b.password } };
};

exports.WOUND_TYPES = WOUND_TYPES;
exports.PHONE_RE = PHONE_RE;
