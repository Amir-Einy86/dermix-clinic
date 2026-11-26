/* home.js — صفحه‌ی اصلی */
(function () {
  'use strict';
  window.Clinic = window.Clinic || {}; Clinic.pages = Clinic.pages || {};
  const { esc, url, faNumber, setMeta } = Clinic.utils;
  const icon = Clinic.icon, ui = Clinic.ui;

  const why = [
    ['stethoscope', 'ارزیابی دقیق', 'قبل از هر اقدام، علت و وضعیت زخم بررسی می‌شود.'],
    ['layers', 'درمان متناسب', 'روش درمان بر اساس نوع زخم و شرایط بیمار انتخاب می‌شود.'],
    ['home', 'ویزیت در منزل', 'برای بیماران کم‌تحرک، مراقبت در محل زندگی هم ممکن است.'],
    ['clipboard', 'پیگیری منظم', 'روند بهبود در هر ویزیت ثبت و مقایسه می‌شود.'],
    ['book', 'آموزش بیمار', 'به بیمار و خانواده آموزش مراقبت بین ویزیت‌ها داده می‌شود.'],
    ['shield', 'شفافیت', 'درباره‌ی نتیجه‌ی درمان وعده‌ی قطعی داده نمی‌شود؛ نتیجه برای هر بیمار متفاوت است.'],
  ];

  // برای هر شعبه اولین زمان خالی در ۱۴ روز آینده
  const nextSlots = async (ctx) => {
    const S = Clinic.schedule;
    const rows = await Promise.all(ctx.branches.map(async (b) => {
      try {
        const r = await Clinic.api.get('/availability?branch=' + encodeURIComponent(b.slug) + '&days=14');
        for (const d of r.data.days) { const s = d.slots.find((x) => x.available); if (s) return { b, date: d.date, time: s.time }; }
      } catch (e) { /* ignore */ }
      return { b };
    }));
    const ul = document.getElementById('next-slots'); if (!ul) return;
    const today = S.localDate(); const tomorrow = S.addDays(today, 1);
    ul.innerHTML = rows.map((x) => '<li><a href="' + url('appointment.html?branch=' + encodeURIComponent(x.b.slug)) + '"><span class="next-slots__branch">شعبه‌ی ' + esc(x.b.name) + '</span>' +
      (x.date ? '<span class="next-slots__time">' + (x.date === today ? 'امروز' : x.date === tomorrow ? 'فردا' : S.faShort(x.date)) + ' · ' + S.faTime(x.time) + '</span>' : '<span class="next-slots__time is-empty">زمان خالی نیست</span>') +
      icon('chevron-left', 'icon--sm') + '</a></li>').join('');
  };

  Clinic.pages.home = {
    async init(ctx) {
      const s = ctx.settings;
      setMeta({ title: s.clinicName + ' | درمان تخصصی زخم', description: s.heroLead });
      const [st, arts] = await Promise.all([Clinic.api.get('/statistics'), Clinic.api.get('/articles?limit=3')]);
      const woundsReviewed = st.data.wounds;
      const cats = (await Clinic.api.get('/article-categories')).data;

      const head = (eyebrow, title, lead, action) => '<div class="section-head"><div><span class="eyebrow">' + eyebrow + '</span><h2>' + title + '</h2>' + (lead ? '<p>' + lead + '</p>' : '') + '</div>' + (action || '') + '</div>';
      document.getElementById('main').innerHTML =
        '<section class="hero"><div class="container hero__grid"><div class="hero__copy">' +
        '<span class="eyebrow">' + icon('shield', 'icon--sm') + ' ' + esc(s.tagline) + '</span>' +
        '<h1>' + esc(s.heroTitle) + '<span class="accent">' + esc(s.heroAccent) + '</span></h1>' +
        (s.heroDoctor ? '<p class="hero__doctor">' + icon('stethoscope', 'icon--sm') + '<strong>' + esc(s.heroDoctor) + '</strong></p>' : '') +
        '<p class="hero__lead">' + esc(s.heroLead) + '</p>' +
        '<div class="hero__ctas"><a class="btn btn--primary btn--lg" href="' + url('appointment.html') + '">' + icon('calendar') + ' نوبت‌دهی آنلاین</a>' +
        '<a class="btn btn--secondary btn--lg" href="' + url('appointment.html?type=home') + '">' + icon('home') + ' ویزیت در منزل</a></div>' +
        '<div class="hero__trust"><span>' + icon('check-circle', 'icon--sm') + 'انتخاب روز و ساعت خالی</span><span>' + icon('check-circle', 'icon--sm') + faNumber(ctx.branches.length) + ' شعبه</span><span>' + icon('check-circle', 'icon--sm') + 'پیگیری پس از درمان</span></div></div>' +
        '<aside class="next-slots" aria-labelledby="ns-title"><div class="next-slots__head"><span class="next-slots__icon">' + icon('clock') + '</span><div><h2 id="ns-title">نزدیک‌ترین نوبت‌های خالی</h2><p>برای رزرو روی شعبه بزنید</p></div></div>' +
        '<ul class="next-slots__list" id="next-slots">' + ctx.branches.map(() => '<li><div class="skeleton" style="height:56px"></div></li>').join('') + '</ul>' +
        '<a class="btn btn--light btn--block" href="' + url('appointment.html') + '">مشاهده‌ی همه‌ی زمان‌ها</a></aside></div></section>' +

        (woundsReviewed == null ? '' : '<section class="section section--tight"><div class="container"><div class="stat">' +
        '<span class="stat__icon">' + icon('activity') + '</span><div><span class="stat__value">' + faNumber(woundsReviewed) +
        '</span><span class="stat__label">زخم بررسی‌شده</span></div></div></div></section>') +

        '<section class="section"><div class="container">' + head('خدمات', 'خدمات تخصصی درمان زخم', '', '<a class="btn btn--ghost" href="' + url('services/index.html') + '">همه‌ی خدمات ' + icon('arrow-left', 'icon--sm') + '</a>') +
        '<div class="grid grid--3">' + ctx.services.slice(0, 6).map(ui.serviceCard).join('') + '</div></div></section>' +

        '<section class="section section--alt"><div class="container">' + head('انواع زخم', 'زخم شما از کدام نوع است؟', 'با علل و علائم هر نوع زخم آشنا شوید.') +
        '<div class="grid grid--3">' + ctx.wounds.map(ui.woundCard).join('') + '</div></div></section>' +

        '<section class="section"><div class="container">' + head('چرا ما', 'چرا ' + esc(s.clinicName) + '؟', '') + '<div class="grid grid--3">' +
        why.map((w) => '<div class="card why"><span class="card__icon">' + icon(w[0]) + '</span><div><h3>' + w[1] + '</h3><p>' + w[2] + '</p></div></div>').join('') + '</div></div></section>' +

        '<section class="section section--alt"><div class="container">' + head('شعبه‌ها', 'نزدیک‌ترین شعبه به شما', '') + '<div class="grid grid--4">' + ctx.branches.map(ui.branchCard).join('') + '</div></div></section>' +

        '<section class="section"><div class="container">' + head('مقالات', 'مقالات آموزشی', '', '<a class="btn btn--ghost" href="' + url('blog/index.html') + '">همه‌ی مقالات ' + icon('arrow-left', 'icon--sm') + '</a>') + '<div class="grid grid--3">' + arts.data.map((a) => ui.articleCard(a, 'blog', cats)).join('') + '</div></div></section>' +
        ui.ctaBand();
      nextSlots(ctx);
    },
  };
})();
