/* errorHandler.js — تبدیل همه‌ی خطاها به پاسخ JSON فارسی و امن */
const env = require('../config/env');

exports.notFound = (req, res) => res.status(404).json({ success: false, message: 'مسیر پیدا نشد.' });

// eslint-disable-next-line no-unused-vars
exports.errorHandler = (err, req, res, next) => {
  let status = 500; let message = 'خطای داخلی سرور. لطفاً دوباره تلاش کنید.'; let errors = null;
  if (err.isAppError) { status = err.status; message = err.message; errors = err.errors; }
  else if (err.name === 'ValidationError') {
    status = 422; message = 'اطلاعات واردشده معتبر نیست.'; errors = {};
    Object.keys(err.errors).forEach((k) => { errors[k.split('.')[0]] = err.errors[k].message; });
  } else if (err.code === 11000) {
    status = 409; message = 'این مقدار قبلاً ثبت شده است (تکراری).'; errors = err.keyPattern || null;
  } else if (err.name === 'CastError') { status = 400; message = 'شناسه یا مقدار ارسالی نامعتبر است.'; }
  else if (err.type === 'entity.parse.failed') { status = 400; message = 'بدنه‌ی درخواست JSON معتبر نیست.'; }
  else if (err.type === 'entity.too.large') { status = 413; message = 'حجم درخواست بیش از حد مجاز است.'; }
  else if (err.code === 'LIMIT_FILE_SIZE') { status = 413; message = 'حجم فایل بیش از حد مجاز است.'; }
  // خطاهای «درخواست نادرست» خود Express (مثل آدرس با کدگذاری خراب) کد 4xx دارند؛ خطای سرور نیستند و نباید لاگ را پر کنند
  else if (Number.isInteger(err.status) && err.status >= 400 && err.status < 500) { status = err.status; message = 'درخواست نامعتبر است.'; }
  if (status === 500 && process.env.NODE_ENV !== 'test') console.error(err); // جزئیات فقط در لاگ سرور، نه برای کاربر
  // stack فقط با درخواست صریح توسعه‌دهنده (DEBUG_ERRORS=true) و هرگز در production به کاربر داده نمی‌شود
  res.status(status).json({ success: false, message, errors: errors || undefined, stack: env.debugErrors && status === 500 ? err.stack : undefined });
};
