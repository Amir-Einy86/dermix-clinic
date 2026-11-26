/* track.js — پیگیری و لغو نوبت توسط بیمار (شماره‌ی پیگیری + موبایل) */
(function () {
  'use strict';
  window.Clinic = window.Clinic || {}; Clinic.pages = Clinic.pages || {};
  const { esc, url, qs, setMeta, $, $$, toast, faDate } = Clinic.utils;
  const S = Clinic.schedule;
  const icon = Clinic.icon, ui = Clinic.ui;
  const TONE = { 'جدید': 'info', 'در حال بررسی': 'warning', 'تأیید شده': 'success', 'تکمیل شده': 'primary', 'لغو شده': 'danger', 'عدم مراجعه': 'neutral' };
  const FLOW = ['جدید', 'تأیید شده', 'تکمیل شده'];

  Clinic.pages.track = { init() {
    setMeta({ title: 'پیگیری نوبت', description: 'پیگیری وضعیت یا لغو نوبت با شماره‌ی پیگیری و موبایل' });
    const m = document.getElementById('main');
    m.innerHTML = ui.pageHero({ title: 'پیگیری نوبت', lead: 'شماره‌ی پیگیری که پس از ثبت نوبت دریافت کردید و شماره‌ی موبایل را وارد کنید.', crumbs: [{ label: 'خانه', href: url('index.html') }, { label: 'پیگیری نوبت' }] }) +
      '<div class="container section"><div class="narrow stack stack--lg"><form class="card card--pad-lg form" id="tf" novalidate><div class="form-grid">' +
      '<div class="field"><label for="referenceNumber">شماره‌ی پیگیری</label><input class="input ltr mono" id="referenceNumber" name="referenceNumber" autocomplete="off" value="' + esc(new URLSearchParams(window.location.hash.slice(1)).get('ref') || qs('ref') || '') + '"><p class="field__error" id="e-referenceNumber" role="alert"></p></div>' +
      '<div class="field"><label for="phone">شماره‌ی موبایل</label><input class="input ltr" id="phone" name="phone" inputmode="tel" autocomplete="tel" placeholder="۰۹۱۲۳۴۵۶۷۸۹"><p class="field__error" id="e-phone" role="alert"></p></div></div>' +
      '<button class="btn btn--primary btn--lg" type="submit">' + icon('search', 'icon--sm') + 'نمایش نوبت</button></form><div id="result" aria-live="polite"></div></div></div>';

    let creds = null;
    const show = (a) => {
      const step = a.status === 'لغو شده' || a.status === 'عدم مراجعه' ? -1 : a.status === 'تکمیل شده' ? 2 : a.status === 'تأیید شده' ? 1 : 0;
      $('#result').innerHTML = '<article class="card card--pad-lg ticket"><header class="ticket__head"><div><span class="muted small">شماره‌ی پیگیری</span><div class="ref-code ref-code--sm">' + esc(a.referenceNumber) + '</div></div>' +
        '<span class="badge badge--' + (TONE[a.status] || 'neutral') + ' badge--dot">' + esc(a.status) + '</span></header>' +
        (step >= 0 ? '<ol class="progress-steps">' + FLOW.map((s, i) => '<li class="' + (i <= step ? 'is-done' : '') + '">' + s + '</li>').join('') + '</ol>' : '') +
        '<div class="ticket__when">' + (a.date ? '<span class="ticket__date">' + S.faFull(a.date) + '</span><span class="ticket__time">' + icon('clock', 'icon--sm') + 'ساعت ' + S.faTime(a.time) + '</span>' : '<span>درخواست بدون زمان مشخص (ثبت ' + faDate(a.createdAt) + ')</span>') + '</div>' +
        '<dl class="kv"><dt>بیمار</dt><dd>' + esc(a.fullName) + '</dd><dt>شعبه</dt><dd>' + esc(a.branchName) + '</dd><dt>نوع مراجعه</dt><dd>' + (a.visitType === 'home' ? 'ویزیت در منزل' : 'مراجعه به کلینیک') + '</dd></dl>' +
        (a.canCancel ? '<details class="cancel-box"><summary class="btn btn--danger-ghost">' + icon('x', 'icon--sm') + 'لغو این نوبت</summary><form id="cf" class="stack mt-4"><div class="field"><label for="reason">دلیل لغو (اختیاری)</label><input class="input" id="reason" name="reason" maxlength="300"></div><button class="btn btn--danger" type="submit">تأیید لغو نوبت</button></form></details>'
          : a.status !== 'لغو شده' && a.status !== 'تکمیل شده' ? '<p class="muted small mb-0">برای تغییر یا لغو این نوبت (کمتر از ۲ ساعت مانده) با کلینیک تماس بگیرید.</p>' : '') +
        '</article>';
      const cf = $('#cf');
      if (cf) cf.addEventListener('submit', async (e) => {
        e.preventDefault();
        if (!confirm('نوبت لغو شود؟ این کار برگشت‌پذیر نیست.')) return;
        try { const r = await Clinic.api.post('/appointments/cancel', Object.assign({ reason: $('#reason').value }, creds)); toast('نوبت لغو شد', 'success'); show(r.data); }
        catch (err) { toast(err.message, 'error'); }
      });
    };

    $('#tf').addEventListener('submit', async (e) => {
      e.preventDefault();
      $$('.field__error').forEach((p) => { p.textContent = ''; });
      const btn = $('button[type=submit]', e.target); btn.classList.add('is-loading'); btn.disabled = true;
      creds = { referenceNumber: $('#referenceNumber').value, phone: $('#phone').value };
      try { show((await Clinic.api.post('/appointments/lookup', creds)).data); }
      catch (err) {
        Object.entries(err.errors || {}).forEach(([k, v]) => { const el = $('#e-' + k); if (el) el.textContent = v; });
        $('#result').innerHTML = err.status === 404 ? ui.state({ title: err.message, text: 'شماره‌ی پیگیری و موبایل را دوباره بررسی کنید.' }) : '';
        if (err.status !== 404 && !err.errors) toast(err.message, 'error');
      }
      btn.classList.remove('is-loading'); btn.disabled = false;
    });
    if (qs('ref')) $('#phone').focus();
  } };
})();
