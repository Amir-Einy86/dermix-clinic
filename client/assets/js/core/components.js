/* ==========================================================
   components.js — تکه‌های HTML قابل‌استفاده‌ی مجدد (کارت، آکاردئون، صفحه‌بندی، مودال و ...)
   همه‌ی متن‌های داده‌ای با esc() امن می‌شوند.
   ========================================================== */
(function () {
  'use strict';
  window.Clinic = window.Clinic || {};
  const { esc, url } = Clinic.utils;
  const icon = (n, c) => Clinic.icon(n, c);

  // جایگاه خالی رسانه (به‌جای عکس/ویدیو واقعی)
  const media = ({ ratio = '16x9', label = 'جایگاه تصویر', hint = 'پس از بارگذاری از پنل مدیریت نمایش داده می‌شود', kind = 'image', play = false, tag = '', circle = false } = {}) =>
    '<div class="media media--' + (circle ? 'circle' : ratio) + '" role="img" aria-label="' + esc(label) + '">' +
    (tag ? '<span class="badge badge--warning media__tag">' + esc(tag) + '</span>' : '') +
    '<div class="media__inner">' + (play ? '<span class="media__play">' + icon('play') + '</span>' : icon(kind === 'video' ? 'video' : kind === 'user' ? 'user' : 'image', 'icon--lg')) +
    '<span class="media__label">' + esc(label) + '</span>' +
    (hint ? '<span class="media__hint">' + esc(hint) + '</span>' : '') + '</div></div>';

  const breadcrumbs = (items) =>
    '<nav class="breadcrumbs" aria-label="مسیر صفحه"><ol>' +
    items.map((it, i) => {
      const last = i === items.length - 1;
      return '<li>' + (last || !it.href ? '<span aria-current="page">' + esc(it.label) + '</span>' : '<a href="' + esc(it.href) + '">' + esc(it.label) + '</a>') + '</li>';
    }).join('') + '</ol></nav>';

  const pageHero = ({ title, lead, crumbs, eyebrow, extra }) =>
    '<section class="page-hero"><div class="container">' + (crumbs ? breadcrumbs(crumbs) : '') +
    (eyebrow ? '<span class="eyebrow">' + esc(eyebrow) + '</span>' : '') +
    '<h1>' + esc(title) + '</h1>' + (lead ? '<p class="lead">' + esc(lead) + '</p>' : '') + (extra || '') + '</div></section>';

  const serviceCard = (s) =>
    '<a class="card card--link" href="' + url('services/detail.html?slug=' + encodeURIComponent(s.slug)) + '">' +
    '<span class="card__icon">' + icon(s.icon || 'heart') + '</span><h3>' + esc(s.title) + '</h3><p>' + esc(s.summary) + '</p>' +
    '<span class="card__more">اطلاعات بیشتر ' + icon('arrow-left', 'icon--sm') + '</span></a>';

  const woundCard = (w) =>
    '<a class="card card--link" href="' + url('wounds/detail.html?slug=' + encodeURIComponent(w.slug)) + '">' +
    '<span class="card__icon">' + icon(w.icon || 'activity') + '</span><h3>' + esc(w.title) + '</h3><p>' + esc(w.intro.slice(0, 110)) + '…</p>' +
    '<span class="card__more">آشنایی با این زخم ' + icon('arrow-left', 'icon--sm') + '</span></a>';

  const contactPeople = (settings, team) => {
    const phoneKey = (value) => Clinic.utils.normalizeDigits(value).replace(/\D/g, '').replace(/^98(?=9\d{9}$)/, '0');
    return [settings.phone1, settings.phone2].map((phone) => {
      const key = phoneKey(phone);
      const person = key && team.find((member) => !member.isPlaceholder && phoneKey(member.phone) === key);
      return { phone, name: person?.name, title: person?.title };
    });
  };

  const phoneLink = ({ phone, name }, className = '', withIcon = false) => {
    const dial = Clinic.utils.normalizeDigits(phone).replace(/[^+\d]/g, '');
    if (!/^\+?\d+$/.test(dial)) return '';
    return '<a class="phone-link ' + className + '" href="tel:' + dial + '">' +
      (withIcon ? icon('phone', 'icon--sm') : '') +
      (name ? '<span class="phone-link__name">' + esc(name) + '</span>' : '') +
      '<bdi dir="ltr">' + esc(phone) + '</bdi></a>';
  };
  const phoneLinks = (contacts, className, withIcon) => contacts.map((contact) => phoneLink(contact, className, withIcon)).join('');

  const branchCard = (b) =>
    '<article class="card branch-card"><h3>شعبه‌ی ' + esc(b.name) + '</h3>' +
    '<dl><dt>آدرس</dt><dd>' + (b.address ? esc(b.address) : '<span class="placeholder-note">به‌زودی اعلام می‌شود</span>') + '</dd>' +
    '<dt>ساعت کاری</dt><dd>' + (esc(Clinic.schedule.workingHours(b)) || 'به‌زودی اعلام می‌شود') + '</dd>' +
    '<dt>تلفن</dt><dd class="contact-phones">' + (phoneLinks(Clinic.contacts || []) || 'به‌زودی اعلام می‌شود') + '</dd></dl>' +
    '<a class="btn btn--secondary btn--sm" href="' + url('branches/detail.html?slug=' + encodeURIComponent(b.slug)) + '">مشاهده‌ی شعبه</a></article>';

  const articleCard = (a, base, cats) => {
    const cat = (cats || []).find((c) => c.slug === a.category);
    return '<a class="card card--link card--flush article-card" href="' + url(base + '/article.html?slug=' + encodeURIComponent(a.slug)) + '">' +
      media({ ratio: '16x9', label: 'تصویر شاخص مقاله', hint: '' }) +
      '<div class="card__body"><div class="article-meta">' + (cat ? '<span class="badge badge--info">' + esc(cat.name) + '</span>' : '') +
      '<span>' + icon('clock', 'icon--sm') + Clinic.utils.faNumber(Clinic.utils.readingTime(a.body)) + ' دقیقه مطالعه</span></div>' +
      '<h3>' + esc(a.title) + '</h3><p>' + esc(a.excerpt) + '</p>' +
      (a.isSample ? '<span class="placeholder-note">متن نمونه — نیازمند بازبینی تیم درمان</span>' : '') +
      '<span class="card__more">ادامه‌ی مطلب ' + icon('arrow-left', 'icon--sm') + '</span></div></a>';
  };

  const state = ({ type = 'empty', title, text, action = '' }) =>
    '<div class="state' + (type === 'error' ? ' state--error' : '') + '" role="' + (type === 'error' ? 'alert' : 'status') + '">' +
    '<span class="state__icon">' + icon(type === 'error' ? 'alert' : 'inbox', 'icon--lg') + '</span><h3>' + esc(title) + '</h3>' +
    (text ? '<p>' + esc(text) + '</p>' : '') + action + '</div>';

  const skeletons = (n) => Array.from({ length: n || 3 }, () => '<div class="skeleton skeleton-card" aria-hidden="true"></div>').join('');

  const accordion = (faqs, idPrefix) => {
    if (!faqs || !faqs.length) return '';
    const p = idPrefix || 'faq' + Math.random().toString(36).slice(2, 6);
    return '<div class="accordion">' + faqs.map((f, i) =>
      '<div class="acc-item"><h3 style="margin:0"><button class="acc-btn" type="button" aria-expanded="false" aria-controls="' + p + '-' + i + '" id="' + p + '-b' + i + '">' +
      '<span>' + esc(f.q) + '</span>' + icon('chevron-down') + '</button></h3>' +
      '<div class="acc-panel" id="' + p + '-' + i + '" role="region" aria-labelledby="' + p + '-b' + i + '" hidden><p>' + esc(f.a) + '</p></div></div>').join('') + '</div>';
  };
  const bindAccordions = (scope) => {
    Clinic.utils.$$('.acc-btn', scope || document).forEach((btn) => {
      if (btn.dataset.bound) return;
      btn.dataset.bound = '1';
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') === 'true';
        btn.setAttribute('aria-expanded', String(!open));
        document.getElementById(btn.getAttribute('aria-controls')).hidden = open;
      });
    });
  };

  const checkList = (items, warn) =>
    '<ul class="check-list' + (warn ? ' check-list--warn' : '') + '">' + (items || []).map((t) => '<li>' + icon(warn ? 'alert' : 'check-circle', 'icon--sm') + '<span>' + esc(t) + '</span></li>').join('') + '</ul>';
  const stepList = (items) => '<ol class="steps">' + (items || []).map((t) => '<li><span>' + esc(t) + '</span></li>').join('') + '</ol>';

  const chips = (options, active, label) =>
    '<div class="chips" role="group" aria-label="' + esc(label || 'فیلتر') + '">' +
    options.map((o) => '<button type="button" class="chip" data-value="' + esc(o.value) + '" aria-pressed="' + (o.value === active) + '">' + esc(o.label) + '</button>').join('') + '</div>';
  const bindChips = (container, onChange) => {
    container.addEventListener('click', (e) => {
      const b = e.target.closest('.chip');
      if (!b) return;
      container.querySelectorAll('.chip').forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
      onChange(b.dataset.value);
    });
  };

  const pagination = (meta) => {
    if (!meta || meta.pages <= 1) return '';
    const btn = (p, label, dis, cur) => '<button type="button" class="page-btn" data-page="' + p + '"' + (dis ? ' disabled' : '') + (cur ? ' aria-current="page"' : '') + ' aria-label="' + (cur ? 'صفحه ' + p + ' (فعلی)' : 'صفحه ' + p) + '">' + label + '</button>';
    let h = '<nav class="pagination" aria-label="صفحه‌بندی">' + btn(meta.page - 1, icon('chevron-right'), meta.page <= 1, false);
    for (let p = 1; p <= meta.pages; p++) h += btn(p, Clinic.utils.faNumber(p), false, p === meta.page);
    return h + btn(meta.page + 1, icon('chevron-left'), meta.page >= meta.pages, false) + '</nav>';
  };
  const bindPagination = (container, onPage) => {
    container.addEventListener('click', (e) => {
      const b = e.target.closest('.page-btn');
      if (b && !b.disabled) onPage(Number(b.dataset.page));
    });
  };

  // مودال دسترس‌پذیر: فوکوس داخل مودال می‌ماند، Esc می‌بندد، فوکوس به دکمه‌ی قبلی برمی‌گردد
  const modal = ({ title, body, narrow, onClose }) => {
    const prev = document.activeElement;
    const el = document.createElement('div');
    el.className = 'modal';
    el.innerHTML = '<div class="modal__dialog' + (narrow ? ' modal__dialog--narrow' : '') + '" role="dialog" aria-modal="true" aria-label="' + esc(title) + '">' +
      '<div class="modal__head"><h2>' + esc(title) + '</h2><button type="button" class="btn btn--subtle btn--icon" data-close aria-label="بستن">' + icon('x') + '</button></div>' +
      '<div class="modal__body">' + body + '</div></div>';
    document.body.appendChild(el);
    document.body.style.overflow = 'hidden';
    const focusables = () => Array.from(el.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter((n) => !n.disabled);
    const close = () => {
      document.removeEventListener('keydown', onKey);
      el.remove();
      document.body.style.overflow = '';
      if (prev && prev.focus) prev.focus();
      if (onClose) onClose();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') { close(); return; }
      if (e.key === 'Tab') {
        const f = focusables();
        if (!f.length) return;
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    };
    el.addEventListener('click', (e) => { if (e.target === el || e.target.closest('[data-close]')) close(); });
    document.addEventListener('keydown', onKey);
    const f = focusables();
    if (f.length) f[0].focus();
    return { el, close };
  };

  // CTA کوتاه برای نوبت
  const ctaBand = (title, text) =>
    '<section class="section"><div class="container"><div class="cta-band"><div><h2>' + esc(title || 'برای بررسی زخم، همین حالا نوبت بگیرید') + '</h2><p>' + esc(text || 'روز و ساعت خالی را آنلاین انتخاب کنید؛ شماره‌ی پیگیری بلافاصله صادر می‌شود.') + '</p></div>' +
    '<div class="row"><a class="btn btn--secondary btn--lg" href="' + url('appointment.html') + '">' + icon('calendar') + ' نوبت‌دهی آنلاین</a></div></div></div></section>';

  const medicalNote = () =>
    '<p class="footnote">اطلاعات این صفحه آموزشی است و جایگزین ویزیت و تشخیص پزشک نیست. در علائم هشدار (تب، ترشح چرکی، قرمزی در حال گسترش، تغییر رنگ سیاه) سریعاً به مرکز درمانی مراجعه کنید.</p>';

  Clinic.ui = {
    contactPeople, phoneLink, phoneLinks,
    media, breadcrumbs, pageHero, serviceCard, woundCard, branchCard, articleCard, state, skeletons,
    accordion, bindAccordions, checkList, stepList, chips, bindChips, pagination, bindPagination, modal, ctaBand, medicalNote,
  };
})();
