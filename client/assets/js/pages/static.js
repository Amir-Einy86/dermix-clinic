/* static.js — درباره‌ی ما، تماس، تیم، ۴۰۴ */
(function () {
  'use strict';
  window.Clinic = window.Clinic || {}; Clinic.pages = Clinic.pages || {};
  const { esc, url, setMeta, $, $$, toast, validators } = Clinic.utils;
  const icon = Clinic.icon, ui = Clinic.ui;
  const main = () => document.getElementById('main');
  const crumbs = (l) => [{ label: 'خانه', href: url('index.html') }, { label: l }];

  Clinic.pages.about = { init(ctx) {
    const s = ctx.settings;
    setMeta({ title: 'درباره‌ی ما', description: s.introText });
    main().innerHTML = ui.pageHero({ title: s.introTitle, lead: s.tagline, crumbs: crumbs('درباره‌ی ما') }) +
      '<div class="container section"><div class="grid grid--2"><div class="stack"><h2>رویکرد ما</h2><p>' + esc(s.introText) + '</p>' +
      ui.checkList(['ارزیابی قبل از درمان', 'انتخاب روش بر اساس شرایط هر بیمار', 'آموزش بیمار و همراهان', 'شفافیت در گفتگو درباره‌ی انتظارات درمان']) + '</div>' +
      ui.media({ ratio: '4x3', label: 'جایگاه تصویر کلینیک' }) + '</div></div>' +
      '<div class="container section"><h2>شعبه‌ها</h2><div class="grid grid--4">' + ctx.branches.map(ui.branchCard).join('') + '</div></div>' + ui.ctaBand();
  } };

  Clinic.pages.team = { init(ctx) {
    setMeta({ title: 'تیم درمان', description: 'آشنایی با تیم درمان' });
    const t = ctx.team;
    main().innerHTML = ui.pageHero({ title: 'تیم درمان', crumbs: crumbs('تیم درمان') }) +
      '<div class="container section"><div class="grid grid--3">' + t.filter((m) => !m.isPlaceholder).map((m) =>
        '<article class="card member">' + ui.media({ circle: true, label: 'جایگاه عکس', hint: '', kind: 'user' }) +
        '<h3>' + esc(m.name) + '</h3><span class="member__title">' + esc(m.title) + '</span>' +
        (m.bio ? '<p>' + esc(m.bio) + '</p>' : '') + ui.phoneLink({ phone: m.phone }, '', true) + '</article>').join('') + '</div></div>' + ui.ctaBand();
  } };

  Clinic.pages.contact = { init(ctx) {
    const s = ctx.settings;
    setMeta({ title: 'تماس با ما', description: 'راه‌های ارتباط با کلینیک' });
    const ph = '<span class="placeholder-note">به‌زودی اعلام می‌شود</span>';
    const cards = ctx.contacts.map(({ phone, name, title }) => {
      const link = ui.phoneLink({ phone }, 'contact-person__phone', true);
      if (!link) return '';
      return '<article class="contact-person"><h3>' + esc(name || 'تماس با کلینیک') + '</h3>' +
        (title ? '<p>' + esc(title) + '</p>' : '') + link + '</article>';
    }).join('');
    main().innerHTML = ui.pageHero({ title: 'تماس با ما', lead: s.consultationInfo, crumbs: crumbs('تماس با ما') }) +
      '<div class="container section"><div class="grid grid--2 contact-layout"><section class="card stack" aria-labelledby="contact-info-title"><h2 id="contact-info-title">اطلاعات تماس</h2>' +
      '<div class="contact-cards">' + (cards || ph) + '</div>' +
      (s.whatsapp ? '<dl class="kv"><dt>واتساپ</dt><dd>' + esc(s.whatsapp) + '</dd></dl>' : '') +
      '<h3>ساعات کاری شعبه‌ها</h3><dl class="kv">' + ctx.branches.map((b) => '<dt><a href="' + url('branches/detail.html?slug=' + encodeURIComponent(b.slug)) + '">شعبه‌ی ' + esc(b.name) + '</a></dt><dd>' + (esc(Clinic.schedule.workingHours(b)) || ph) + '</dd>').join('') + '</dl></section>' +
      '<form class="card form" id="msg-form" novalidate><h2>ارسال پیام</h2><div class="form-grid">' +
      '<div class="field"><label for="m-name">نام و نام خانوادگی <span class="req">*</span></label><input class="input" id="m-name" name="name" autocomplete="name"><p class="field__error" id="e-name" role="alert"></p></div>' +
      '<div class="field"><label for="m-phone">شماره‌ی موبایل <span class="req">*</span></label><input class="input ltr" id="m-phone" name="phone" inputmode="tel" autocomplete="tel" placeholder="۰۹۱۲۳۴۵۶۷۸۹"><p class="field__error" id="e-phone" role="alert"></p></div>' +
      '<div class="field field--full"><label for="m-message">پیام شما <span class="req">*</span></label><textarea class="textarea" id="m-message" name="message" rows="5"></textarea><p class="field__error" id="e-message" role="alert"></p></div>' +
      '<div class="hp-field" aria-hidden="true"><label>وب‌سایت<input name="website" tabindex="-1" autocomplete="off"></label></div></div>' +
      '<button class="btn btn--primary" type="submit">ارسال پیام</button></form></div></div>';
    const f = $('#msg-form');
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData(f));
      $$('.field__error', f).forEach((p) => { p.textContent = ''; });
      const btn = $('button[type=submit]', f); btn.classList.add('is-loading'); btn.disabled = true;
      try { await Clinic.api.post('/messages', d); f.reset(); toast('پیام شما ثبت شد. کلینیک پس از بررسی با شما تماس می‌گیرد.', 'success'); }
      catch (err) { Object.entries(err.errors || {}).forEach(([k, v]) => { const el = $('#e-' + k); if (el) el.textContent = v; }); toast(err.message, 'error'); }
      btn.classList.remove('is-loading'); btn.disabled = false;
    });

  } };

  Clinic.pages.notfound = { init() {
    setMeta({ title: 'صفحه پیدا نشد' });
    main().innerHTML = '<div class="container not-found"><div class="not-found__code">404</div><h1>صفحه‌ای که دنبالش بودید پیدا نشد</h1><p>ممکن است آدرس تغییر کرده باشد.</p>' +
      '<p><a class="btn btn--primary" href="' + url('index.html') + '">بازگشت به خانه</a></p></div>';
  } };
})();
