/* text.js — ابزارهای متنی: اسلاگ، ارقام فارسی، escape برای regex */
const normalizeDigits = (str) =>
  String(str == null ? '' : str)
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));

const slugify = (text) =>
  String(text || '').trim().toLowerCase().replace(/[\s_]+/g, '-').replace(/[^؀-ۿa-z0-9-]/g, '').replace(/-+/g, '-').replace(/^-|-$/g, '');

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { normalizeDigits, slugify, escapeRegex };
