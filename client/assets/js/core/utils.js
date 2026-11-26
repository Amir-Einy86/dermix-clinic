/* ==========================================================
   utils.js — ابزارهای کوچک و مشترک
   همه‌ی ماژول‌ها زیر یک شی‌ی سراسری به اسم Clinic قرار می‌گیرند
   (بدون نیاز به bundler؛ فایل‌ها را می‌توان مستقیم از روی دیسک هم باز کرد).
   ========================================================== */
(function () {
  'use strict';
  window.Clinic = window.Clinic || {};

  // ---------- DOM helpers ----------
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  // Escape user/db text before putting it into innerHTML (prevents XSS)
  const esc = (value) =>
    String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

  // ---------- Digits ----------
  const faNumber = (n) => (n == null || n === '' ? '—' : Number(n).toLocaleString('fa-IR'));
  const normalizeDigits = (str) =>
    String(str == null ? '' : str)
      .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 1776))
      .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 1632));

  // ---------- Dates ----------
  const faDate = (iso) => {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'long', day: 'numeric' }).format(new Date(iso));
    } catch (e) { return String(iso); }
  };
  const faDateTime = (iso) => {
    if (!iso) return '—';
    try {
      return new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(iso));
    } catch (e) { return String(iso); }
  };
  const currentJalaliYear = () => new Intl.DateTimeFormat('fa-IR-u-ca-persian', { year: 'numeric' }).format(new Date());

  // Jalali -> Gregorian (public-domain jdf algorithm). Returns [gy, gm, gd].
  const jalaliToGregorian = (jy, jm, jd) => {
    jy += 1595;
    let days = -355668 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + jd +
      (jm < 7 ? (jm - 1) * 31 : (jm - 7) * 30 + 186);
    let gy = 400 * Math.floor(days / 146097);
    days %= 146097;
    if (days > 36524) {
      gy += 100 * Math.floor(--days / 36524);
      days %= 36524;
      if (days >= 365) days++;
    }
    gy += 4 * Math.floor(days / 1461);
    days %= 1461;
    if (days > 365) {
      gy += Math.floor((days - 1) / 365);
      days = (days - 1) % 365;
    }
    let gd = days + 1;
    const monthDays = [0, 31, (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    let gm;
    for (gm = 0; gm < 13 && gd > monthDays[gm]; gm++) gd -= monthDays[gm];
    return [gy, gm, gd];
  };

  // Parse "1405/08/20" (Persian or Latin digits) into a JS Date, or null when invalid.
  const parseJalali = (text) => {
    const m = normalizeDigits(text).trim().match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
    if (!m) return null;
    const [jy, jm, jd] = [Number(m[1]), Number(m[2]), Number(m[3])];
    if (jm < 1 || jm > 12 || jd < 1 || jd > (jm <= 6 ? 31 : jm <= 11 ? 30 : 29)) return null;
    const [gy, gm, gd] = jalaliToGregorian(jy, jm, jd);
    return new Date(gy, gm - 1, gd);
  };

  // ---------- Misc ----------
  const debounce = (fn, wait) => {
    let t;
    return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait || 250); };
  };
  const qs = (name) => new URLSearchParams(window.location.search).get(name);
  const readingTime = (paragraphs) => {
    const words = (Array.isArray(paragraphs) ? paragraphs.join(' ') : String(paragraphs || '')).split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 180));
  };
  const root = () => document.body.getAttribute('data-root') || '';
  const url = (path) => root() + path;

  // ---------- Validators (shared by public form + admin) ----------
  const validators = {
    name: (v) => (String(v || '').trim().length >= 3 ? '' : 'نام و نام خانوادگی را کامل وارد کنید (حداقل ۳ حرف).'),
    phone: (v) => (/^09\d{9}$/.test(normalizeDigits(v).replace(/[\s-]/g, '')) ? '' : 'شماره موبایل معتبر نیست؛ مثال: ۰۹۱۲۳۴۵۶۷۸۹'),
    required: (v, msg) => (String(v || '').trim() ? '' : msg || 'این فیلد الزامی است.'),
    futureJalali: (v) => {
      if (!String(v || '').trim()) return ''; // optional
      const d = parseJalali(v);
      if (!d) return 'تاریخ را به شکل ۱۴۰۵/۰۹/۲۰ وارد کنید.';
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return d < today ? 'تاریخ پیشنهادی نباید گذشته باشد.' : '';
    },
    email: (v) => (!v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? '' : 'ایمیل معتبر نیست.'),
  };

  // ---------- Toast notifications ----------
  const toast = (message, type) => {
    let region = $('.toast-region');
    if (!region) {
      region = document.createElement('div');
      region.className = 'toast-region';
      region.setAttribute('role', 'status');
      region.setAttribute('aria-live', 'polite');
      document.body.appendChild(region);
    }
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' toast--' + type : '');
    el.textContent = message;
    region.appendChild(el);
    setTimeout(() => el.remove(), 4500);
  };

  // ---------- SEO helpers ----------
  const setMeta = ({ title, description, image }) => {
    const siteName = (Clinic.settings && Clinic.settings.clinicName) || 'کلینیک زخم';
    if (title) document.title = title + ' | ' + siteName;
    const set = (selector, attr, value, create) => {
      let el = $(selector);
      if (!el && create) { el = document.createElement(create.tag); Object.keys(create.attrs).forEach((k) => el.setAttribute(k, create.attrs[k])); document.head.appendChild(el); }
      if (el) el.setAttribute(attr, value);
    };
    if (description) {
      set('meta[name="description"]', 'content', description, { tag: 'meta', attrs: { name: 'description' } });
      set('meta[property="og:description"]', 'content', description, { tag: 'meta', attrs: { property: 'og:description' } });
    }
    if (title) set('meta[property="og:title"]', 'content', title, { tag: 'meta', attrs: { property: 'og:title' } });
    set('meta[property="og:type"]', 'content', 'website', { tag: 'meta', attrs: { property: 'og:type' } });
    set('meta[property="og:locale"]', 'content', 'fa_IR', { tag: 'meta', attrs: { property: 'og:locale' } });
    if (image) set('meta[property="og:image"]', 'content', image, { tag: 'meta', attrs: { property: 'og:image' } });
    // Canonical URL (without hash)
    const canonical = window.location.href.split('#')[0];
    set('link[rel="canonical"]', 'href', canonical, { tag: 'link', attrs: { rel: 'canonical' } });
  };
  const jsonLd = (data) => {
    const s = document.createElement('script');
    s.type = 'application/ld+json';
    s.textContent = JSON.stringify(data);
    document.head.appendChild(s);
  };

  // ---------- Text helpers ----------
  const lines = (text) => String(text || '').split('\n').map((s) => s.trim()).filter(Boolean);
  const pairsFromText = (text) => lines(text).map((l) => { const [q, ...a] = l.split('|'); return { q: (q || '').trim(), a: a.join('|').trim() }; }).filter((p) => p.q);
  const pairsToText = (faqs) => (faqs || []).map((f) => f.q + ' | ' + f.a).join('\n');

  Clinic.utils = {
    $, $$, esc, faNumber, normalizeDigits, faDate, faDateTime, currentJalaliYear,
    jalaliToGregorian, parseJalali, debounce, qs, readingTime, root, url,
    validators, toast, setMeta, jsonLd, lines, pairsFromText, pairsToText,
  };
})();
