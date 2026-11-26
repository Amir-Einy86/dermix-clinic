/* articles.js — مقالات (blog) و ژورنال تاک (journal) */
(function () {
  'use strict';
  window.Clinic = window.Clinic || {}; Clinic.pages = Clinic.pages || {};
  const { esc, url, qs, setMeta, faDate, faNumber, readingTime, debounce, jsonLd } = Clinic.utils;
  const icon = Clinic.icon, ui = Clinic.ui;
  const main = () => document.getElementById('main');

  const cfg = {
    blog: { api: 'articles', cats: 'article-categories', base: 'blog', title: 'مقالات آموزشی', lead: 'اطلاعات ساده و قابل‌فهم درباره‌ی مراقبت از زخم برای بیماران و خانواده‌ها.', pro: false },
    journal: { api: 'journal', cats: 'journal-categories', base: 'journal-talk', title: 'ژورنال تاک', lead: 'محتوای تخصصی ویژه‌ی درمانگران و دانشجویان علوم پزشکی.', pro: true },
  };

  const listInit = (key) => async () => {
    const c = cfg[key];
    setMeta({ title: c.title, description: c.lead });
    const cats = (await Clinic.api.get('/' + c.cats)).data;
    const state = { category: 'all', q: '', page: 1 };
    const hero = c.pro
      ? '<section class="page-hero pro-banner"><div class="container">' + ui.breadcrumbs([{ label: 'خانه', href: url('index.html') }, { label: c.title }]) + '<span class="eyebrow">' + icon('book', 'icon--sm') + ' ویژه‌ی متخصصان</span><h1>' + c.title + '</h1><p class="lead">' + c.lead + '</p></div></section>'
      : ui.pageHero({ title: c.title, lead: c.lead, crumbs: [{ label: 'خانه', href: url('index.html') }, { label: c.title }] });
    main().innerHTML = hero + '<div class="container section"><div class="toolbar"><div id="chips"></div>' +
      '<div class="search"><label class="sr-only" for="q">جستجو در مقالات</label>' + icon('search') + '<input id="q" class="input" type="search" placeholder="جستجو در عنوان و خلاصه‌ی مقالات"></div></div>' +
      '<div id="list" class="grid grid--3" aria-live="polite"></div><div id="pager"></div></div>';
    const chipsEl = document.getElementById('chips');
    chipsEl.innerHTML = ui.chips([{ value: 'all', label: 'همه' }].concat(cats.map((x) => ({ value: x.slug, label: x.name }))), 'all', 'دسته‌بندی');
    const load = async () => {
      const list = document.getElementById('list');
      list.innerHTML = ui.skeletons(3);
      try {
        const r = await Clinic.api.get('/' + c.api + '?category=' + state.category + '&q=' + encodeURIComponent(state.q) + '&page=' + state.page + '&limit=6');
        list.innerHTML = r.data.length ? r.data.map((a) => ui.articleCard(a, c.base, cats)).join('') : '<div style="grid-column:1/-1">' + ui.state({ title: 'مقاله‌ای پیدا نشد', text: 'عبارت دیگری را جستجو کنید یا دسته‌بندی را تغییر دهید.' }) + '</div>';
        document.getElementById('pager').innerHTML = ui.pagination(r.meta);
      } catch (e) { list.innerHTML = '<div style="grid-column:1/-1">' + ui.state({ type: 'error', title: 'بارگذاری مقالات انجام نشد', text: e.message }) + '</div>'; }
    };
    ui.bindChips(chipsEl, (v) => { state.category = v; state.page = 1; load(); });
    document.getElementById('q').addEventListener('input', debounce((e) => { state.q = e.target.value.trim(); state.page = 1; load(); }, 300));
    ui.bindPagination(document.getElementById('pager'), (p) => { state.page = p; load(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    load();
  };

  const articleInit = (key) => async (ctx) => {
    const c = cfg[key];
    let a; try { a = (await Clinic.api.get('/' + c.api + '/' + encodeURIComponent(qs('slug') || ''))).data; } catch (e) {
      main().innerHTML = '<div class="container section">' + ui.state({ type: 'error', title: 'مقاله پیدا نشد', action: '<a class="btn btn--secondary" href="' + url(c.base + '/index.html') + '">بازگشت به فهرست</a>' }) + '</div>'; return;
    }
    const cats = (await Clinic.api.get('/' + c.cats)).data;
    const cat = cats.find((x) => x.slug === a.category);
    setMeta({ title: (a.seo && a.seo.title) || a.title, description: (a.seo && a.seo.description) || a.excerpt });
    jsonLd({ '@context': 'https://schema.org', '@type': 'Article', headline: a.title, datePublished: a.publishedAt, inLanguage: 'fa' });
    const all = (await Clinic.api.get('/' + c.api + '?limit=50')).data.filter((x) => x.slug !== a.slug && x.category === a.category).slice(0, 3);
    main().innerHTML = ui.pageHero({ title: a.title, lead: a.excerpt, eyebrow: cat ? cat.name : '', crumbs: [{ label: 'خانه', href: url('index.html') }, { label: c.title, href: url(c.base + '/index.html') }, { label: a.title }],
      extra: '<div class="article-meta"><span>' + icon('calendar', 'icon--sm') + faDate(a.publishedAt) + '</span><span>' + icon('clock', 'icon--sm') + faNumber(readingTime(a.body)) + ' دقیقه مطالعه</span>' + (c.pro ? '<span class="badge journal-badge">ویژه‌ی درمانگران</span>' : '') + '</div>' }) +
      '<div class="container content-layout"><article class="prose article-body stack">' +
      (a.isSample ? '<div class="alert alert--warning" role="note"><div>این مقاله یک متن نمونه است و پیش از انتشار نهایی باید توسط تیم درمان بازبینی شود.</div></div>' : '') +
      ui.media({ ratio: '16x9', label: 'تصویر شاخص مقاله', hint: '' }) +
      a.body.map((p) => '<p>' + esc(p) + '</p>').join('') + (c.pro ? '' : ui.medicalNote()) +
      '</article><aside class="sidebar"><div class="cta-card"><h3>نیاز به بررسی زخم دارید؟</h3><p>روز و ساعت خالی را آنلاین انتخاب کنید.</p><a class="btn btn--secondary" href="' + url('appointment.html') + '">ثبت درخواست نوبت</a></div>' +
      (all.length ? '<div class="card"><h3>مقالات مرتبط</h3><ul class="stack">' + all.map((r) => '<li><a href="' + url(c.base + '/article.html?slug=' + r.slug) + '">' + esc(r.title) + '</a></li>').join('') + '</ul></div>' : '') + '</aside></div>';
  };

  Clinic.pages.blog = { init: listInit('blog') };
  Clinic.pages.article = { init: articleInit('blog') };
  Clinic.pages.journal = { init: listInit('journal') };
  Clinic.pages['journal-article'] = { init: articleInit('journal') };
})();
