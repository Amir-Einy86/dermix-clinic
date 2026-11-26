/* sanitize.js — پاک‌سازی بدنه‌ی درخواست
   - کلیدهایی که با $ شروع می‌شوند یا نقطه دارند حذف می‌شوند (جلوگیری از NoSQL injection مثل {"$ne": ""})
   - __proto__ / constructor / prototype حذف می‌شوند (جلوگیری از prototype pollution)
   - عمق تو در تو و طول آرایه‌ها محدود است */
const BAD_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_DEPTH = 8;
const MAX_ARRAY = 500;

const clean = (v, depth) => {
  if (Array.isArray(v)) return depth > MAX_DEPTH ? [] : v.slice(0, MAX_ARRAY).map((x) => clean(x, depth + 1));
  if (v && typeof v === 'object') {
    if (depth > MAX_DEPTH) return {};
    const out = {};
    Object.keys(v).forEach((k) => {
      if (BAD_KEYS.has(k) || k.startsWith('$') || k.includes('.')) return;
      out[k] = clean(v[k], depth + 1);
    });
    return out;
  }
  return v;
};

module.exports = (req, res, next) => {
  if (req.body && typeof req.body === 'object') req.body = clean(req.body, 0);
  next();
};
module.exports.clean = (v) => clean(v, 0);
