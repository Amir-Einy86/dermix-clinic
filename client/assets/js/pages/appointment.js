/* appointment.js — نوبت‌دهی آنلاین چهارمرحله‌ای
   ۱) نوع مراجعه و شعبه  ۲) روز و ساعت (از /api/availability)  ۳) اطلاعات بیمار  ۴) بازبینی و ثبت
   ظرفیت روی سرور به‌صورت اتمیک بررسی می‌شود؛ اگر ساعت در همین فاصله پر شود، کاربر به مرحله‌ی ۲ برمی‌گردد. */
(function () {
  'use strict';
  window.Clinic = window.Clinic || {}; Clinic.pages = Clinic.pages || {};
  const { esc, url, qs, setMeta, $, $$, toast, faNumber } = Clinic.utils;
  const S = Clinic.schedule;
  const icon = Clinic.icon, ui = Clinic.ui;
  const WOUND_OPTS = [['diabetic', 'زخم پای دیابتی'], ['pressure', 'زخم بستر'], ['venous', 'زخم وریدی'], ['arterial', 'زخم شریانی'], ['burn', 'سوختگی'], ['surgical', 'زخم جراحی'], ['unknown', 'نمی‌دانم / سایر']];
  const STEPS = ['شعبه', 'روز و ساعت', 'اطلاعات بیمار', 'تأیید'];
  const PAGE = 14;

  const field = (id, label, control, o) => '<div class="field' + (o && o.full ? ' field--full' : '') + '"><label for="' + id + '">' + label + (o && o.req ? ' <span class="req">*</span>' : '') + '</label>' + control +
    (o && o.hint ? '<p class="field__hint">' + o.hint + '</p>' : '') + '<p class="field__error" id="e-' + id + '" role="alert"></p></div>';

  Clinic.pages.appointment = { init(ctx) {
    setMeta({ title: 'نوبت‌دهی آنلاین', description: 'انتخاب روز و ساعت و ثبت نوبت حضوری یا ویزیت در منزل' });
    const st = { step: 0, visitType: qs('type') === 'home' ? 'home' : 'clinic', branch: '', date: '', time: '', from: S.localDate(), days: [], form: {} };
    const pre = ctx.branches.find((b) => b.slug === qs('branch'));
    if (pre) st.branch = pre.slug;
    const branchOf = () => ctx.branches.find((b) => b.slug === st.branch);

    const m = document.getElementById('main');
    m.innerHTML = ui.pageHero({ title: 'نوبت‌دهی آنلاین', lead: 'روز و ساعت دلخواه را از بین زمان‌های خالی انتخاب کنید. نوبت شما بلافاصله ثبت و شماره‌ی پیگیری صادر می‌شود.', crumbs: [{ label: 'خانه', href: url('index.html') }, { label: 'نوبت‌دهی' }] }) +
      '<div class="container section"><div class="booking"><div class="booking__main card card--pad-lg" id="panel"><ol class="stepper" id="stepper" aria-label="مراحل نوبت‌دهی"></ol><div id="step" tabindex="-1"></div></div>' +
      '<aside class="booking__side"><div class="card summary" id="summary" aria-live="polite"></div>' +
      '<div class="card card--soft small"><strong class="row">' + icon('info', 'icon--sm') + 'پیش‌تر نوبت گرفته‌اید؟</strong><p class="mb-0">برای دیدن وضعیت یا لغو نوبت به صفحه‌ی <a href="' + url('track.html') + '">پیگیری نوبت</a> بروید.</p></div></aside></div></div>';

    const stepper = () => {
      $('#stepper').innerHTML = STEPS.map((s, i) => '<li class="stepper__item' + (i < st.step ? ' is-done' : i === st.step ? ' is-current' : '') + '"' + (i === st.step ? ' aria-current="step"' : '') + '><span class="stepper__dot">' + (i < st.step ? icon('check', 'icon--sm') : faNumber(i + 1)) + '</span><span class="stepper__label">' + s + '</span></li>').join('');
    };
    const summary = () => {
      const b = branchOf();
      const row = (ic, label, val) => '<div class="summary__row">' + icon(ic, 'icon--sm') + '<div><span class="summary__label">' + label + '</span><span class="summary__value">' + (val || '<span class="muted">انتخاب نشده</span>') + '</span></div></div>';
      $('#summary').innerHTML = '<h2 class="h4">خلاصه‌ی نوبت</h2>' + row(st.visitType === 'home' ? 'home' : 'stethoscope', 'نوع مراجعه', st.visitType === 'home' ? 'ویزیت در منزل' : 'مراجعه به کلینیک') +
        row('pin', 'شعبه', b ? 'شعبه‌ی ' + esc(b.name) : '') + row('calendar', 'روز', st.date ? S.faFull(st.date) : '') + row('clock', 'ساعت', st.time ? S.faTime(st.time) : '');
    };
    const nav = (nextLabel, canBack) => '<div class="step-nav">' + (canBack ? '<button type="button" class="btn btn--ghost" data-back>' + icon('chevron-right', 'icon--sm') + 'مرحله‌ی قبل</button>' : '<span></span>') +
      '<button type="' + (st.step === 3 ? 'submit' : 'button') + '" class="btn btn--primary btn--lg" data-next>' + nextLabel + (st.step < 3 ? icon('chevron-left', 'icon--sm') : '') + '</button></div>';
    const go = (n) => { st.step = n; render(); const el = $('#step'); el.focus({ preventScroll: true }); $('#panel').scrollIntoView({ behavior: 'smooth', block: 'start' }); };

    // ---------- مرحله ۱ ----------
    const step1 = () => {
      const eligible = ctx.branches.filter((b) => st.visitType !== 'home' || b.homeVisit);
      if (st.branch && !eligible.find((b) => b.slug === st.branch)) st.branch = '';
      return '<h2 class="step-title">نوع مراجعه</h2><div class="choice-grid choice-grid--2">' +
        [['clinic', 'stethoscope', 'مراجعه به کلینیک', 'معاینه و درمان در شعبه'], ['home', 'home', 'ویزیت در منزل', 'کادر درمان به منزل شما می‌آید']].map((o) =>
          '<label class="choice choice--card"><input type="radio" name="visitType" value="' + o[0] + '"' + (st.visitType === o[0] ? ' checked' : '') + '><span class="choice__icon">' + icon(o[1]) + '</span><span><strong>' + o[2] + '</strong><span class="choice__hint">' + o[3] + '</span></span></label>').join('') + '</div>' +
        '<h2 class="step-title mt-6">انتخاب شعبه</h2><div class="choice-grid">' +
        eligible.map((b) => '<label class="choice choice--card"><input type="radio" name="branch" value="' + esc(b.slug) + '"' + (st.branch === b.slug ? ' checked' : '') + '><span class="choice__icon">' + icon('pin') + '</span><span><strong>شعبه‌ی ' + esc(b.name) + '</strong><span class="choice__hint">' + esc(b.address || b.city || '') + '</span>' +
          (b.booking && b.booking.enabled === false ? '<span class="badge badge--warning">نوبت‌دهی آنلاین غیرفعال</span>' : '') + '</span></label>').join('') + '</div><p class="field__error" id="e-branch" role="alert"></p>' + nav('انتخاب روز و ساعت', false);
    };

    // ---------- مرحله ۲ ----------
    const loadDays = async () => {
      const box = $('#days'); if (!box) return;
      box.innerHTML = '<div class="date-strip">' + Array.from({ length: 7 }, () => '<div class="skeleton date-chip date-chip--ghost"></div>').join('') + '</div>';
      try {
        const r = await Clinic.api.get('/availability?branch=' + encodeURIComponent(st.branch) + '&from=' + st.from + '&days=' + PAGE);
        st.days = r.data.days; st.enabled = r.data.enabled; st.otpRequired = !!r.data.otpRequired;
        if (st.date && !st.days.find((d) => d.date === st.date)) { st.date = ''; st.time = ''; }
        if (!st.date) { const first = st.days.find((d) => d.slots.some((s) => s.available)); if (first) st.date = first.date; }
        drawDays();
      } catch (e) { box.innerHTML = ui.state({ type: 'error', title: e.message || 'دریافت زمان‌های خالی انجام نشد', action: '<button class="btn btn--secondary" type="button" data-retry>تلاش دوباره</button>' }); }
    };
    const drawDays = () => {
      if (st.enabled === false) { $('#days').innerHTML = ui.state({ title: 'نوبت‌دهی آنلاین این شعبه فعلاً غیرفعال است', text: 'لطفاً با کلینیک تماس بگیرید یا شعبه‌ی دیگری انتخاب کنید.' }); $('#slots').innerHTML = ''; return; }
      const today = S.localDate();
      const canPrev = st.from > today;
      $('#days').innerHTML = '<div class="date-nav"><button type="button" class="btn btn--icon btn--ghost" data-prev aria-label="روزهای قبل"' + (canPrev ? '' : ' disabled') + '>' + icon('chevron-right') + '</button>' +
        '<div class="date-strip" role="radiogroup" aria-label="روز نوبت">' + st.days.map((d) => {
          const free = d.slots.filter((s) => s.available).length; const p = S.dayParts(d.date);
          return '<button type="button" role="radio" class="date-chip' + (d.date === st.date ? ' is-selected' : '') + '" data-date="' + d.date + '" aria-checked="' + (d.date === st.date) + '"' + (free ? '' : ' disabled') + '>' +
            '<span class="date-chip__wd">' + (d.date === today ? 'امروز' : p.weekday) + '</span><span class="date-chip__d">' + p.day + '</span><span class="date-chip__m">' + p.month + '</span>' +
            '<span class="date-chip__free">' + (d.closed ? 'تعطیل' : free ? faNumber(free) + ' خالی' : 'تکمیل') + '</span></button>';
        }).join('') + '</div><button type="button" class="btn btn--icon btn--ghost" data-more aria-label="روزهای بعد"' + (st.days.length < PAGE ? ' disabled' : '') + '>' + icon('chevron-left') + '</button></div>';
      drawSlots();
      const sel = $('.date-chip.is-selected'); if (sel) sel.scrollIntoView({ block: 'nearest', inline: 'center' });
    };
    const drawSlots = () => {
      const d = st.days.find((x) => x.date === st.date);
      if (!d) { $('#slots').innerHTML = st.days.length ? '<p class="muted">روزی را انتخاب کنید.</p>' : ui.state({ title: 'زمان خالی در این بازه پیدا نشد' }); return; }
      const groups = {}; d.slots.forEach((s) => { (groups[S.period(s.time)] = groups[S.period(s.time)] || []).push(s); });
      $('#slots').innerHTML = '<h3 class="h5 mt-4">ساعت‌های ' + S.faFull(d.date) + '</h3>' + Object.keys(groups).map((g) => '<div class="slot-group"><span class="slot-group__label">' + g + '</span><div class="slot-grid" role="radiogroup" aria-label="ساعت‌های ' + g + '">' +
        groups[g].map((s) => '<button type="button" role="radio" class="slot' + (s.time === st.time ? ' is-selected' : '') + '" data-time="' + s.time + '" aria-checked="' + (s.time === st.time) + '"' + (s.available ? '' : ' disabled') + '>' + S.faTime(s.time) +
          (!s.available ? '<small>' + (s.left ? 'گذشته' : 'پر') + '</small>' : '') + '</button>').join('') + '</div></div>').join('') + '<p class="field__error" id="e-time" role="alert"></p>';
    };
    const step2 = () => '<h2 class="step-title">روز و ساعت مراجعه</h2><p class="muted">فقط زمان‌های خالی قابل انتخاب‌اند. زمان‌ها به وقت ایران است.</p><div id="days"></div><div id="slots"></div>' + nav('ادامه', true);

    // ---------- مرحله ۳ ----------
    const step3 = () => {
      const f = st.form; const v = (k) => esc(f[k] || '');
      return '<h2 class="step-title">اطلاعات بیمار</h2><div class="form-grid">' +
        field('fullName', 'نام و نام خانوادگی بیمار', '<input class="input" id="fullName" name="fullName" autocomplete="name" value="' + v('fullName') + '">', { req: true }) +
        field('phone', 'شماره‌ی موبایل', '<input class="input ltr" id="phone" name="phone" inputmode="tel" autocomplete="tel" placeholder="۰۹۱۲۳۴۵۶۷۸۹" value="' + v('phone') + '">', { req: true, hint: 'برای تأیید و یادآوری نوبت با این شماره تماس می‌گیریم.' }) +
        field('woundType', 'نوع زخم', '<select class="select" id="woundType" name="woundType"><option value="">انتخاب کنید</option>' + WOUND_OPTS.map((o) => '<option value="' + o[0] + '"' + (f.woundType === o[0] ? ' selected' : '') + '>' + o[1] + '</option>').join('') + '</select>', { req: true }) +
        (st.visitType === 'home' ? field('address', 'آدرس کامل برای ویزیت در منزل', '<textarea class="textarea" id="address" name="address" rows="2">' + v('address') + '</textarea>', { req: true, full: true }) : '') +
        field('description', 'توضیح کوتاه درباره‌ی زخم', '<textarea class="textarea" id="description" name="description" rows="3" maxlength="1000">' + v('description') + '</textarea>', { full: true, hint: 'اختیاری. اطلاعات پزشکی حساس را هنگام تماس بگویید.' }) +
        '<div class="hp-field" aria-hidden="true"><label>وب‌سایت<input name="website" tabindex="-1" autocomplete="off"></label></div></div>' +
        '<label class="check mt-4"><input type="checkbox" id="consent" name="consent"' + (f.consent ? ' checked' : '') + '><span>موافقم کلینیک برای هماهنگی نوبت با من تماس بگیرد.</span></label><p class="field__error" id="e-consent" role="alert"></p>' + nav('بازبینی نوبت', true);
    };
    const readForm = () => { const fm = $('#step'); ['fullName', 'phone', 'woundType', 'address', 'description', 'website'].forEach((k) => { const el = $('[name=' + k + ']', fm); if (el) st.form[k] = el.value; }); st.form.consent = !!($('#consent', fm) || {}).checked; };
    const showErrors = (errs) => {
      let first = null;
      Object.keys(errs).forEach((k) => { const el = $('#e-' + k); if (el) { el.textContent = errs[k]; const inp = $('#' + k); if (inp) { inp.setAttribute('aria-invalid', 'true'); first = first || inp; } } });
      if (first) first.focus();
    };
    const validate3 = () => {
      const v = Clinic.utils.validators; const f = st.form; const e = {};
      const a = v.name(f.fullName); if (a) e.fullName = a;
      const b = v.phone(f.phone); if (b) e.phone = b;
      if (!f.woundType) e.woundType = 'نوع زخم را انتخاب کنید.';
      if (st.visitType === 'home' && String(f.address || '').trim().length < 10) e.address = 'آدرس کامل را وارد کنید.';
      if (!f.consent) e.consent = 'برای ثبت نوبت، موافقت با تماس لازم است.';
      return e;
    };

    // ---------- مرحله ۴ ----------
    const step4 = () => {
      const b = branchOf(); const f = st.form;
      const w = (WOUND_OPTS.find((o) => o[0] === f.woundType) || [])[1];
      return '<form id="confirm" novalidate><h2 class="step-title">بازبینی و ثبت</h2><div class="review">' +
        '<div class="review__when"><span class="review__date">' + S.faFull(st.date) + '</span><span class="review__time">' + icon('clock', 'icon--sm') + 'ساعت ' + S.faTime(st.time) + '</span></div>' +
        '<dl class="kv"><dt>نوع مراجعه</dt><dd>' + (st.visitType === 'home' ? 'ویزیت در منزل' : 'مراجعه به کلینیک') + '</dd><dt>شعبه</dt><dd>' + esc(b ? b.name : '') + '</dd>' +
        '<dt>بیمار</dt><dd>' + esc(f.fullName) + '</dd><dt>موبایل</dt><dd class="ltr-text">' + esc(f.phone) + '</dd><dt>نوع زخم</dt><dd>' + esc(w || '') + '</dd>' +
        (st.visitType === 'home' ? '<dt>آدرس</dt><dd>' + esc(f.address) + '</dd>' : '') + '</dl></div>' +
        (st.otpRequired ? '<div class="otp-box mt-4"><div class="field"><label for="otp">کد تأیید پیامکی <span class="req">*</span></label>' +
          '<div class="otp-box__row"><input class="input ltr mono otp-box__input" id="otp" name="otp" inputmode="numeric" autocomplete="one-time-code" maxlength="5" placeholder="-----">' +
          '<button type="button" class="btn btn--secondary" id="send-otp">' + icon('message', 'icon--sm') + '<span>ارسال کد</span></button></div>' +
          '<p class="field__hint" id="otp-hint">برای تأیید شماره‌ی ' + esc(f.phone) + '، دکمه‌ی «ارسال کد» را بزنید و کد ۵ رقمی پیامک‌شده را وارد کنید.</p>' +
          '<p class="field__error" id="e-otp" role="alert"></p></div></div>' : '') +
        '<div class="alert alert--neutral mt-4">' + icon('info') + '<div>در صورت نیاز به تغییر، کلینیک با شما تماس می‌گیرد. در شرایط اورژانسی (تب، ترشح چرکی، قرمزی در حال گسترش) فوراً به مرکز درمانی مراجعه کنید.</div></div>' + nav('ثبت نهایی نوبت', true) + '</form>';
    };

    const done = (r) => {
      $('#panel').innerHTML = '<div class="success-panel" role="status"><span class="success-panel__icon">' + icon('check-circle', 'icon--xl') + '</span><h2>نوبت شما ثبت شد</h2>' +
        '<p class="lead">' + S.faFull(r.date) + ' — ساعت ' + S.faTime(r.time) + '<br>شعبه‌ی ' + esc(r.branchName) + '</p>' +
        '<p class="mb-0">شماره‌ی پیگیری (آن را یادداشت کنید):</p><div class="ref-code" id="ref">' + esc(r.referenceNumber) + '</div>' +
        '<button type="button" class="btn btn--ghost btn--sm" id="copy">' + icon('clipboard', 'icon--sm') + 'کپی شماره‌ی پیگیری</button>' +
        (st.otpRequired ? '<p class="mb-0">' + icon('message', 'icon--sm') + ' شماره‌ی پیگیری برای شما پیامک هم شد.</p>' : '') + '<p class="muted">وضعیت نوبت «جدید» است و پس از تماس کلینیک «تأیید شده» می‌شود. با شماره‌ی پیگیری و موبایل می‌توانید وضعیت را ببینید یا نوبت را لغو کنید.</p>' +
        '<div class="row row--center"><a class="btn btn--primary" href="' + url('track.html#ref=' + encodeURIComponent(r.referenceNumber)) + '">پیگیری نوبت</a><a class="btn btn--secondary" href="' + url('index.html') + '">بازگشت به خانه</a></div></div>';
      $('#copy').addEventListener('click', () => { if (navigator.clipboard) navigator.clipboard.writeText(r.referenceNumber).then(() => toast('کپی شد', 'success')); });
      $('.booking__side').hidden = true;
      window.scrollTo({ top: 0, behavior: 'smooth' });
    };

    const render = () => {
      stepper(); summary();
      $('#step').innerHTML = [step1, step2, step3, step4][st.step]();
      if (st.step === 1) loadDays();
    };

    // ---------- رویدادها ----------
    $('#panel').addEventListener('change', (e) => {
      const t = e.target;
      if (t.name === 'visitType') { st.visitType = t.value; render(); }
      if (t.name === 'branch') { st.branch = t.value; st.date = ''; st.time = ''; st.from = S.localDate(); summary(); $('#e-branch').textContent = ''; }
    });
    $('#panel').addEventListener('input', (e) => { if (e.target.getAttribute('aria-invalid')) { e.target.removeAttribute('aria-invalid'); const er = $('#e-' + e.target.id); if (er) er.textContent = ''; } });
    $('#panel').addEventListener('click', async (e) => {
      const d = e.target.closest('[data-date]'); if (d && !d.disabled) { st.date = d.dataset.date; st.time = ''; drawDays(); summary(); return; }
      const t = e.target.closest('[data-time]'); if (t && !t.disabled) { st.time = t.dataset.time; $$('.slot').forEach((s) => { const on = s === t; s.classList.toggle('is-selected', on); s.setAttribute('aria-checked', String(on)); }); summary(); return; }
      if (e.target.closest('[data-more]')) { st.from = S.addDays(st.from, PAGE); st.date = ''; st.time = ''; loadDays(); return; }
      if (e.target.closest('[data-prev]')) { const p = S.addDays(st.from, -PAGE); st.from = p < S.localDate() ? S.localDate() : p; st.date = ''; st.time = ''; loadDays(); return; }
      if (e.target.closest('[data-retry]')) { loadDays(); return; }
      if (e.target.closest('[data-back]')) { if (st.step === 2) readForm(); go(st.step - 1); return; }
      if (e.target.closest('[data-next]') && st.step < 3) {
        if (st.step === 0) { if (!st.branch) { $('#e-branch').textContent = 'یک شعبه انتخاب کنید.'; return; } go(1); return; }
        if (st.step === 1) { if (!st.date || !st.time) { const er = $('#e-time'); if (er) er.textContent = 'یک ساعت خالی انتخاب کنید.'; else toast('یک روز و ساعت انتخاب کنید.', 'error'); return; } go(2); return; }
        if (st.step === 2) { readForm(); $$('.field__error').forEach((p) => { p.textContent = ''; }); const errs = validate3(); if (Object.keys(errs).length) { showErrors(errs); return; } go(3); }
      }
    });
    // ارسال کد تأیید پیامکی؛ بعد از ارسال، دکمه تا پایان شمارش معکوس غیرفعال می‌ماند
    const countdown = (sec) => {
      const b = $('#send-otp'); if (!b) return;
      clearInterval(st.otpTimer);
      let left = sec; b.disabled = true;
      const tick = () => {
        const btn = $('#send-otp'); if (!btn) { clearInterval(st.otpTimer); return; }
        if (left <= 0) { clearInterval(st.otpTimer); btn.disabled = false; $('span', btn).textContent = 'ارسال دوباره'; return; }
        $('span', btn).textContent = 'ارسال دوباره (' + Clinic.utils.faNumber(left) + ')'; left -= 1;
      };
      tick(); st.otpTimer = setInterval(tick, 1000);
    };
    $('#panel').addEventListener('click', async (e) => {
      const b = e.target.closest('#send-otp'); if (!b || b.disabled) return;
      $('#e-otp').textContent = ''; b.classList.add('is-loading'); b.disabled = true;
      try {
        const r = await Clinic.api.post('/appointments/otp', { phone: st.form.phone, website: st.form.website });
        $('#otp-hint').textContent = 'کد به ' + st.form.phone + ' پیامک شد؛ تا ۵ دقیقه معتبر است.';
        b.classList.remove('is-loading'); countdown((r.data && r.data.resendIn) || 60); $('#otp').focus();
      } catch (err) {
        b.classList.remove('is-loading'); b.disabled = false;
        const errs = err.errors || {};
        if (errs.retryAfter) countdown(errs.retryAfter);
        if (errs.phone) { go(2); showErrors(errs); return; }
        $('#e-otp').textContent = err.message;
      }
    });
    $('#panel').addEventListener('submit', async (e) => {
      e.preventDefault();
      const otpEl = $('#otp');
      const code = otpEl ? Clinic.utils.normalizeDigits(otpEl.value).trim() : '';
      if (st.otpRequired && !/^\d{5}$/.test(code)) { showErrors({ otp: 'کد تأیید ۵ رقمی پیامک‌شده را وارد کنید. اگر هنوز کد نگرفته‌اید، «ارسال کد» را بزنید.' }); return; }
      const btn = $('[data-next]'); btn.classList.add('is-loading'); btn.disabled = true;
      try {
        const body = Object.assign({}, st.form, { visitType: st.visitType, branch: st.branch, date: st.date, time: st.time }, st.otpRequired ? { otp: code } : {});
        const r = await Clinic.api.post('/appointments', body);
        done(r.data);
      } catch (err) {
        toast(err.message, 'error');
        const errs = err.errors || {};
        if (errs.time || errs.date) { st.time = ''; go(1); return; }
        if (errs.fullName || errs.phone || errs.woundType || errs.address || errs.consent) { go(2); showErrors(errs); return; }
        if (errs.branch || errs.visitType) { go(0); return; }
        if (errs.otp) showErrors({ otp: errs.otp });
        btn.classList.remove('is-loading'); btn.disabled = false;
      }
    });
    render();
  } };
})();
