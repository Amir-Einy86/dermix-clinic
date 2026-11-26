/* ==========================================================
   layout.js — هدر، منو، فوتر، دکمه‌های تماس و راه‌انداز صفحه‌ها
   هر صفحه‌ی عمومی <body data-page="..." data-root="..."> دارد و یک <main id="main">.
   پس از آماده شدن داده‌ی مشترک، Clinic.pages[data-page].init(ctx) صدا زده می‌شود.
   ========================================================== */
(function () {
  'use strict';
  window.Clinic = window.Clinic || {};
  Clinic.pages = Clinic.pages || {};
  const { $, $$, esc, url } = Clinic.utils;
  const icon = (n, c) => Clinic.icon(n, c);

  const waLink = (s) => {
    const n = String(s.whatsapp || '').replace(/\D/g, '');
    return n ? 'https://wa.me/' + n : '';
  };
  const topbar = (s, contacts) =>
    '<div class="topbar"><div class="container topbar__inner"><div class="topbar__group">' +
    '<span class="topbar__item">' + icon('shield', 'icon--sm') + esc(s.coverageText) + '</span></div>' +
    '<div class="topbar__group topbar__contacts">' + Clinic.ui.phoneLinks(contacts, 'topbar__item', true) + '</div></div></div>';

  const menuLinks = (items, base, key) => items.map((i) => '<a href="' + url(base + '?slug=' + encodeURIComponent(i.slug)) + '">' + esc(i[key]) + '</a>').join('');

  const header = (s, ctx) => {
    const p = document.body.dataset.page || '';
    const cur = (names) => (names.includes(p) ? ' is-current' : '');
    const link = (href, label, page) => '<a href="' + url(href) + '"' + (p === page ? ' aria-current="page"' : '') + '>' + label + '</a>';
    const dd = (label, hubHref, base, items, key, names) =>
      '<div class="nav__item' + cur(names) + '"><button type="button" class="nav__trigger" aria-haspopup="true" aria-expanded="false">' + label + icon('chevron-down', 'icon--sm') + '</button>' +
      '<div class="nav__menu"><div class="nav__menu-inner"><a href="' + url(hubHref) + '"><strong>همه‌ی ' + label + '</strong></a>' + menuLinks(items, base, key) + '</div></div></div>';
    return '<header class="site-header"><div class="container site-header__inner">' +
      '<a class="brand" href="' + url('index.html') + '" aria-label="' + esc(s.clinicName) + ' - صفحه‌ی اصلی"><span class="brand__mark">' + icon('cross', 'icon--lg') + '</span>' +
      '<span class="brand__text"><span class="brand__name">' + esc(s.clinicName) + '</span><span class="brand__tag">' + esc(s.tagline) + '</span></span></a>' +
      '<nav class="nav" aria-label="منوی اصلی">' + link('index.html', 'خانه', 'home') +
      dd('خدمات', 'services/index.html', 'services/detail.html', ctx.services, 'title', ['services', 'service-detail']) +
      dd('انواع زخم', 'wounds/index.html', 'wounds/detail.html', ctx.wounds, 'title', ['wounds', 'wound-detail']) +
      dd('شعبه‌ها', 'branches/index.html', 'branches/detail.html', ctx.branches, 'name', ['branches', 'branch-detail']) +
      link('gallery.html', 'گالری', 'gallery') + (s.showTestimonials ? link('testimonials.html', 'رضایت بیماران', 'testimonials') : '') +
      link('blog/index.html', 'مقالات', 'blog') + link('about.html', 'درباره‌ی ما', 'about') + link('contact.html', 'تماس', 'contact') + '</nav>' +
      '<div class="header-actions"><a class="btn btn--ghost btn--sm header-track" href="' + url('track.html') + '">پیگیری نوبت</a><a class="btn btn--primary" href="' + url('appointment.html') + '">' + icon('calendar', 'icon--sm') + ' نوبت‌دهی آنلاین</a>' +
      '<button type="button" class="btn btn--subtle btn--icon menu-toggle" aria-label="باز کردن منو" aria-expanded="false" aria-controls="drawer">' + icon('menu') + '</button></div></div></header>';
  };

  const drawer = (s, ctx) => {
    const grp = (label, hub, base, items, key) =>
      '<details><summary>' + label + icon('chevron-down', 'icon--sm') + '</summary><a href="' + url(hub) + '">همه‌ی ' + label + '</a>' + menuLinks(items, base, key) + '</details>';
    return '<div class="drawer" id="drawer" hidden><div class="drawer__panel" role="dialog" aria-modal="true" aria-label="منوی موبایل">' +
      '<div class="drawer__head"><strong>' + esc(s.clinicName) + '</strong><button type="button" class="btn btn--subtle btn--icon" data-drawer-close aria-label="بستن منو">' + icon('x') + '</button></div>' +
      '<a href="' + url('index.html') + '">خانه</a>' +
      grp('خدمات', 'services/index.html', 'services/detail.html', ctx.services, 'title') +
      grp('انواع زخم', 'wounds/index.html', 'wounds/detail.html', ctx.wounds, 'title') +
      grp('شعبه‌ها', 'branches/index.html', 'branches/detail.html', ctx.branches, 'name') +
      ['gallery.html|گالری قبل و بعد', ...(s.showTestimonials ? ['testimonials.html|رضایت بیماران'] : []), 'team.html|تیم درمان', 'blog/index.html|مقالات آموزشی', 'journal-talk/index.html|ژورنال تاک (ویژه‌ی درمانگران)', 'about.html|درباره‌ی ما', 'contact.html|تماس با ما']
        .map((x) => { const [h, l] = x.split('|'); return '<a href="' + url(h) + '">' + l + '</a>'; }).join('') +
      '<a href="' + url('track.html') + '">پیگیری یا لغو نوبت</a><a class="btn btn--primary btn--block" href="' + url('appointment.html') + '">نوبت‌دهی آنلاین</a></div></div>';
  };

  const footer = (s, ctx) =>
    '<footer class="site-footer"><div class="container"><div class="footer__grid">' +
    '<div class="footer__col"><h3>' + esc(s.clinicName) + '</h3><p>' + esc(s.introText.slice(0, 150)) + '…</p>' +
    '<div class="contact-phones">' + Clinic.ui.phoneLinks(ctx.contacts, '', true) + '</div><div class="footer__social">' +
    (waLink(s) ? '<a href="' + esc(waLink(s)) + '" rel="noopener" target="_blank" aria-label="واتساپ">' + icon('whatsapp') + '</a>' : '') +
    (s.email ? '<a href="mailto:' + esc(s.email) + '" aria-label="ایمیل">' + icon('mail') + '</a>' : '') + '</div></div>' +
    '<div class="footer__col"><h3>خدمات</h3><ul>' + ctx.services.map((x) => '<li><a href="' + url('services/detail.html?slug=' + encodeURIComponent(x.slug)) + '">' + esc(x.title) + '</a></li>').join('') + '</ul></div>' +
    '<div class="footer__col"><h3>شعبه‌ها</h3><ul>' + ctx.branches.map((x) => '<li><a href="' + url('branches/detail.html?slug=' + encodeURIComponent(x.slug)) + '">شعبه‌ی ' + esc(x.name) + '</a></li>').join('') + '</ul></div>' +
    '<div class="footer__col"><h3>دسترسی سریع</h3><ul>' +
    [['team.html', 'تیم درمان'], ['gallery.html', 'گالری قبل و بعد'], ...(s.showTestimonials ? [['testimonials.html', 'ویدیوهای رضایت']] : []), ['blog/index.html', 'مقالات'], ['journal-talk/index.html', 'ژورنال تاک'], ['appointment.html', 'نوبت‌دهی آنلاین'], ['track.html', 'پیگیری نوبت'], ['contact.html', 'تماس با ما'], ['admin/login.html', 'ورود مدیران']]
      .map((x) => '<li><a href="' + url(x[0]) + '">' + x[1] + '</a></li>').join('') + '</ul></div></div>' +
    '<p class="footer__note">اطلاعات سایت جنبه‌ی آموزشی دارد و جایگزین ویزیت پزشک نیست. در شرایط اورژانسی به نزدیک‌ترین مرکز درمانی مراجعه کنید.</p>' +
    '<div class="footer__bottom"><span>© ' + Clinic.utils.currentJalaliYear() + ' ' + esc(s.clinicName) + ' — همه‌ی حقوق محفوظ است.</span></div></div></footer>';

  const floating = (s, contacts) => {
    const wa = waLink(s);
    return (wa ? '<a class="wa-float" href="' + esc(wa) + '" target="_blank" rel="noopener" aria-label="گفتگو در واتساپ">' + icon('whatsapp', 'icon--lg') + '</a>' : '') +
      '<nav class="mobile-bar" aria-label="تماس سریع">' +
      (Clinic.ui.phoneLink(contacts[0]) || '<a href="' + url('contact.html') + '">' + icon('phone') + 'تماس</a>') +
      '<a class="is-main" href="' + url('appointment.html') + '">' + icon('calendar') + 'نوبت</a>' +
      (Clinic.ui.phoneLink(contacts[1]) || '<a href="' + url('contact.html') + '">' + icon('message') + 'پیام</a>') + '</nav>';
  };

  const bindChrome = () => {
    // منوی کشویی: باز/بسته شدن با کیبورد و Esc
    $$('.nav__trigger').forEach((btn) => {
      btn.addEventListener('click', () => {
        const item = btn.parentElement;
        const open = item.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', String(open));
      });
    });
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      $$('.nav__item.is-open').forEach((i) => { i.classList.remove('is-open'); $('.nav__trigger', i).setAttribute('aria-expanded', 'false'); });
      closeDrawer();
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('.nav__item')) $$('.nav__item.is-open').forEach((i) => i.classList.remove('is-open'));
    });
    const dr = $('#drawer'), tg = $('.menu-toggle');
    const openDrawer = () => { dr.hidden = false; tg.setAttribute('aria-expanded', 'true'); document.body.style.overflow = 'hidden'; $('[data-drawer-close]', dr).focus(); };
    function closeDrawer() { if (!dr || dr.hidden) return; dr.hidden = true; tg.setAttribute('aria-expanded', 'false'); document.body.style.overflow = ''; tg.focus(); }
    tg.addEventListener('click', openDrawer);
    dr.addEventListener('click', (e) => { if (e.target === dr || e.target.closest('[data-drawer-close]')) closeDrawer(); });
  };

  const markCurrentLinks = () => {
    $$('.drawer a, .nav > a').forEach((a) => {
      if (a.pathname === window.location.pathname && !a.hasAttribute('aria-current') && !a.classList.contains('btn')) a.setAttribute('aria-current', 'page');
    });
  };

  const boot = async () => {
    const page = document.body.dataset.page;
    const isAdmin = document.body.classList.contains('admin-body');
    if (isAdmin) { if (Clinic.pages[page]) Clinic.pages[page].init(); return; }
    let ctx;
    try {
      const [s, sv, w, b, team] = await Promise.all([
        Clinic.api.get('/settings'), Clinic.api.get('/services'), Clinic.api.get('/wounds'), Clinic.api.get('/branches'),
        Clinic.api.get('/team').then((result) => result.data).catch(() => Clinic.mockData?.team || []),
      ]);
      ctx = { settings: s.data, services: sv.data, wounds: w.data, branches: b.data, team, contacts: Clinic.ui.contactPeople(s.data, team) };
    } catch (e) {
      const main = $('#main');
      if (main) main.innerHTML = '<div class="container section">' + Clinic.ui.state({ type: 'error', title: 'بارگذاری سایت انجام نشد', text: 'لطفاً صفحه را دوباره بارگذاری کنید.' }) + '</div>';
      return;
    }
    Clinic.settings = ctx.settings;
    Clinic.contacts = ctx.contacts;
    document.body.insertAdjacentHTML('afterbegin',
      '<a class="skip-link" href="#main">پرش به محتوای اصلی</a>' + topbar(ctx.settings, ctx.contacts) + header(ctx.settings, ctx) + drawer(ctx.settings, ctx));
    document.body.insertAdjacentHTML('beforeend', footer(ctx.settings, ctx) + floating(ctx.settings, ctx.contacts));
    if (waLink(ctx.settings)) document.body.classList.add('has-wa');
    document.body.classList.add('has-mobile-bar');
    bindChrome();
    markCurrentLinks();
    Clinic.utils.jsonLd({ '@context': 'https://schema.org', '@type': 'MedicalClinic', name: ctx.settings.clinicName, description: ctx.settings.introText,
      areaServed: ctx.branches.map((x) => x.city) });
    if (Clinic.pages[page] && Clinic.pages[page].init) {
      try { await Clinic.pages[page].init(ctx); } catch (e) {
        const main = $('#main');
        if (main) main.innerHTML = '<div class="container section">' + Clinic.ui.state({ type: 'error', title: (e && e.message) || 'خطایی رخ داد', text: 'لطفاً دوباره تلاش کنید.', action: '<a class="btn btn--secondary" href="' + url('index.html') + '">بازگشت به صفحه‌ی اصلی</a>' }) + '</div>';
      }
    }
    Clinic.ui.bindAccordions();
  };

  Clinic.boot = boot;
  document.addEventListener('DOMContentLoaded', boot);
})();
