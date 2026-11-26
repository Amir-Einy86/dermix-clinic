/* upload.js — آپلود امن فایل (فقط عکس/ویدیوی مجاز، نام تصادفی، حجم محدود) */
const multer = require('multer');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const env = require('../config/env');
const AppError = require('../utils/appError');

const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp', 'video/mp4': '.mp4', 'video/webm': '.webm' };
fs.mkdirSync(env.uploadDir, { recursive: true });

/* امضای واقعی فایل (چند بایت اول). نوع اعلام‌شده توسط فرستنده (mimetype) قابل جعل است؛
   پس بعد از ذخیره، محتوای فایل را هم می‌خوانیم و اگر با پسوندش نخواند، فایل حذف و درخواست رد می‌شود. */
const starts = (buf, bytes, at = 0) => bytes.every((b, i) => buf[at + i] === b);
const SIGNATURE = {
  '.jpg': (b) => starts(b, [0xff, 0xd8, 0xff]),
  '.png': (b) => starts(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  '.webp': (b) => starts(b, [0x52, 0x49, 0x46, 0x46]) && starts(b, [0x57, 0x45, 0x42, 0x50], 8), // RIFF....WEBP
  '.mp4': (b) => starts(b, [0x66, 0x74, 0x79, 0x70], 4),                                          // ....ftyp
  '.webm': (b) => starts(b, [0x1a, 0x45, 0xdf, 0xa3]),
};
const contentMatches = async (file) => {
  const fh = await fs.promises.open(file.path, 'r');
  try {
    const buf = Buffer.alloc(16);
    await fh.read(buf, 0, 16, 0);
    const check = SIGNATURE[path.extname(file.path)];
    return !!check && check(buf);
  } finally { await fh.close(); }
};

const receive = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, env.uploadDir),
    // نام اصلی فایل را هرگز استفاده نمی‌کنیم (جلوگیری از path traversal)
    filename: (req, file, cb) => cb(null, crypto.randomBytes(16).toString('hex') + EXT[file.mimetype]),
  }),
  limits: { fileSize: env.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => (EXT[file.mimetype] ? cb(null, true) : cb(new AppError(415, 'فقط تصویر (jpg/png/webp) یا ویدیو (mp4/webm) مجاز است.'))),
}).single('file');

module.exports = (req, res, cb) => receive(req, res, async (err) => {
  if (err || !req.file) return cb(err);
  try {
    if (await contentMatches(req.file)) return cb();
    await fs.promises.unlink(req.file.path).catch(() => {});
    req.file = undefined;
    return cb(new AppError(415, 'محتوای فایل با نوع آن هم‌خوانی ندارد. فقط تصویر (jpg/png/webp) یا ویدیو (mp4/webm) واقعی مجاز است.'));
  } catch (e) { return cb(e); }
});
