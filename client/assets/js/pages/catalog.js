/* catalog.js — خدمات، انواع زخم، شعبه‌ها (فهرست + جزئیات) */
(function () {
  'use strict';
  window.Clinic = window.Clinic || {}; Clinic.pages = Clinic.pages || {};
  const { esc, url, qs, setMeta, jsonLd } = Clinic.utils;
  const icon = Clinic.icon, ui = Clinic.ui;
  const main = () => document.getElementById('main');
  const wrap = (inner) => '<div class="container section">' + inner + '</div>';
  const notFound = (what, back) => { main().innerHTML = wrap(ui.state({ type: 'error', title: what + ' پیدا نشد', text: 'ممکن است آدرس اشتباه باشد یا مورد حذف شده باشد.', action: '<a class="btn btn--secondary" href="' + url(back) + '">بازگشت به فهرست</a>' })); setMeta({ title: what + ' پیدا نشد' }); };

  const listPage = (title, lead, crumb, cards, extra) => ui.pageHero({ title, lead, crumbs: [{ label: 'خانه', href: url('index.html') }, { label: crumb }] }) + wrap('<div class="grid grid--3">' + cards + '</div>' + (extra || '')) + ui.ctaBand();

  const sidebar = (extra) => '<aside class="sidebar">' + (extra || '') +
    '<div class="cta-card"><h3>نیاز به بررسی دارید؟</h3><p>زمان‌های خالی را ببینید و آنلاین نوبت بگیرید.</p><a class="btn btn--secondary" href="' + url('appointment.html') + '">ثبت درخواست نوبت</a></div></aside>';

  Clinic.pages.services = { init(ctx) {
    setMeta({ title: 'خدمات', description: 'خدمات تخصصی درمان زخم' });
    main().innerHTML = listPage('خدمات کلینیک', 'روش درمان پس از ارزیابی زخم و بر اساس شرایط هر بیمار انتخاب می‌شود.', 'خدمات', ctx.services.map(ui.serviceCard).join(''));
  } };
  Clinic.pages.wounds = { init(ctx) {
    setMeta({ title: 'انواع زخم', description: 'آشنایی با انواع زخم' });
    main().innerHTML = listPage('انواع زخم', 'علل، علائم هشدار و رویکرد درمان هر نوع زخم.', 'انواع زخم', ctx.wounds.map(ui.woundCard).join('')) ;
  } };
  Clinic.pages.branches = { init(ctx) {
    setMeta({ title: 'شعبه‌ها', description: 'شعبه‌های کلینیک' });
    main().innerHTML = ui.pageHero({ title: 'شعبه‌های کلینیک', lead: ctx.settings.coverageText, crumbs: [{ label: 'خانه', href: url('index.html') }, { label: 'شعبه‌ها' }] }) +
      wrap('<div class="grid grid--2">' + ctx.branches.map(ui.branchCard).join('') + '</div>') + ui.ctaBand();
  } };

  Clinic.pages['service-detail'] = { async init(ctx) {
    let s; try { s = (await Clinic.api.get('/services/' + encodeURIComponent(qs('slug') || ''))).data; } catch (e) { return notFound('خدمت', 'services/index.html'); }
    setMeta({ title: s.title, description: s.summary });
    const rel = ctx.services.filter((x) => (s.related || []).includes(x.slug));
    main().innerHTML = ui.pageHero({ title: s.title, lead: s.intro, crumbs: [{ label: 'خانه', href: url('index.html') }, { label: 'خدمات', href: url('services/index.html') }, { label: s.title }] }) +
      '<div class="container content-layout"><div class="prose stack">' +
      '<h2>درباره‌ی این خدمت</h2><p>' + esc(s.description) + '</p>' +
      '<h2>کاربردها</h2>' + ui.checkList(s.applications) +
      '<h2>مراحل انجام</h2>' + ui.stepList(s.process) +
      '<h2>نکات مهم</h2>' + ui.checkList(s.considerations, true) +
      (s.faqs && s.faqs.length ? '<h2>سؤالات متداول</h2>' + ui.accordion(s.faqs, 'sv') : '') + ui.medicalNote() + '</div>' +
      sidebar(rel.length ? '<div class="card"><h3>خدمات مرتبط</h3><ul class="stack">' + rel.map((r) => '<li><a href="' + url('services/detail.html?slug=' + r.slug) + '">' + esc(r.title) + '</a></li>').join('') + '</ul></div>' : '') + '</div>' + ui.ctaBand();
    jsonLd({ '@context': 'https://schema.org', '@type': 'MedicalProcedure', name: s.title, description: s.summary });
  } };

  Clinic.pages['wound-detail'] = { async init(ctx) {
    let w; try { w = (await Clinic.api.get('/wounds/' + encodeURIComponent(qs('slug') || ''))).data; } catch (e) { return notFound('نوع زخم', 'wounds/index.html'); }
    setMeta({ title: w.title, description: w.intro });
    const rs = ctx.services.filter((x) => (w.services || []).includes(x.slug));
    const arts = (await Clinic.api.get('/articles?limit=50')).data.filter((a) => (w.relatedArticles || []).includes(a.slug));
    main().innerHTML = ui.pageHero({ title: w.title, lead: w.intro, eyebrow: w.en, crumbs: [{ label: 'خانه', href: url('index.html') }, { label: 'انواع زخم', href: url('wounds/index.html') }, { label: w.title }] }) +
      '<div class="container content-layout"><div class="prose stack">' +
      '<h2>علل رایج</h2>' + ui.checkList(w.causes) + '<h2>علائم</h2>' + ui.checkList(w.symptoms) +
      '<div class="alert alert--warning"><div><h2 style="margin-top:0">علائم هشدار</h2>' + ui.checkList(w.warnings, true) + '</div></div>' +
      '<h2>رویکرد درمان</h2>' + ui.checkList(w.approaches) + '<h2>چه زمانی مراجعه کنیم؟</h2><p>' + esc(w.whenToSeek) + '</p>' +
      (w.faqs && w.faqs.length ? '<h2>سؤالات متداول</h2>' + ui.accordion(w.faqs, 'wd') : '') + ui.medicalNote() + '</div>' +
      sidebar((rs.length ? '<div class="card"><h3>خدمات مرتبط</h3><ul class="stack">' + rs.map((r) => '<li><a href="' + url('services/detail.html?slug=' + r.slug) + '">' + esc(r.title) + '</a></li>').join('') + '</ul></div>' : '') +
        (arts.length ? '<div class="card"><h3>مقالات مرتبط</h3><ul class="stack">' + arts.map((r) => '<li><a href="' + url('blog/article.html?slug=' + r.slug) + '">' + esc(r.title) + '</a></li>').join('') + '</ul></div>' : '')) + '</div>' + ui.ctaBand();
  } };

  Clinic.pages['branch-detail'] = { async init(ctx) {
    let b; try { b = (await Clinic.api.get('/branches/' + encodeURIComponent(qs('slug') || ''))).data; } catch (e) { return notFound('شعبه', 'branches/index.html'); }
    setMeta({ title: 'شعبه‌ی ' + b.name, description: 'اطلاعات شعبه‌ی ' + b.name });
    const sv = ctx.services.filter((x) => (b.services || []).includes(x.slug));
    const ph = '<span class="placeholder-note">به‌زودی اعلام می‌شود</span>';
    main().innerHTML = ui.pageHero({ title: 'شعبه‌ی ' + b.name, lead: 'درمان زخم در ' + b.city + (b.homeVisit ? ' و ویزیت در منزل' : ''), crumbs: [{ label: 'خانه', href: url('index.html') }, { label: 'شعبه‌ها', href: url('branches/index.html') }, { label: b.name }] }) +
      '<div class="container content-layout"><div class="stack"><div class="card"><h2>اطلاعات شعبه</h2><dl class="kv">' +
      '<dt>آدرس</dt><dd>' + (b.address ? esc(b.address) : ph) + '</dd><dt>ساعت کاری</dt><dd>' + (esc(Clinic.schedule.workingHours(b)) || ph) + '</dd>' +
      '<dt>تلفن</dt><dd class="contact-phones">' + (ui.phoneLinks(ctx.contacts) || ph) + '</dd>' +
      '<dt>ویزیت در منزل</dt><dd>' + (b.homeVisit ? 'امکان‌پذیر است (پس از هماهنگی)' : 'ارائه نمی‌شود') + '</dd></dl></div>' +
      '<div class="map-box">' + (b.mapUrl ? '<iframe src="' + esc(b.mapUrl) + '" title="نقشه‌ی شعبه‌ی ' + esc(b.name) + '" loading="lazy"></iframe>' : ui.media({ ratio: '16x9', label: 'نقشه‌ی شعبه', hint: 'پس از ثبت آدرس نمایش داده می‌شود' })) + '</div>' +
      '<h2>خدمات این شعبه</h2><div class="grid grid--2">' + sv.map(ui.serviceCard).join('') + '</div>' +
      (b.faqs ? '<h2>سؤالات متداول</h2>' + ui.accordion(b.faqs, 'br') : '') + '</div>' + sidebar() + '</div>' + ui.ctaBand();
  } };
})();
