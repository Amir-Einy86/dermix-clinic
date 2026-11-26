/* gallery.js — گالری قبل و بعد با فیلتر و لایت‌باکس */
(function () {
  'use strict';
  window.Clinic = window.Clinic || {}; Clinic.pages = Clinic.pages || {};
  const { esc, url, setMeta } = Clinic.utils;
  const ui = Clinic.ui;
  const CATS = [['all', 'همه'], ['diabetic', 'دیابتی'], ['pressure', 'بستر'], ['venous', 'وریدی'], ['arterial', 'شریانی'], ['burn', 'سوختگی'], ['surgical', 'جراحی']];
  const imageSource = (value) => {
    if (!value) return '';
    try {
      const parsed = new URL(value, window.location.href);
      if (parsed.protocol === 'file:' && /^assets\//.test(value)) return parsed.href;
      if (/^https?:$/.test(parsed.protocol) && parsed.origin === window.location.origin && /^\/(uploads|assets)\//.test(parsed.pathname)) return parsed.href;
    } catch (error) { return ''; }
    return '';
  };
  const photos = (item) => [
    ['قبل', imageSource(item.beforeImage)],
    ['بعد', imageSource(item.afterImage)],
  ];
  const figures = (item, expanded = false) => {
    const available = photos(item).filter(([, source]) => source);
    const entries = available.length ? available : photos(item);
    return entries.map(([label, source]) => '<figure class="case-card__figure">' +
      (source ? '<img class="case-card__photo' + (expanded ? ' case-card__photo--expanded' : '') + '" src="' + esc(source) + '" alt="' + esc(label + ' از درمان — ' + item.title) + '"' + (expanded ? '' : ' loading="lazy"') + '>' :
        ui.media({ ratio: '3x4', label, hint: '' })) +
      '<figcaption>' + label + '</figcaption></figure>').join('');
  };
  const description = (item) => item.description ? '<div class="case-card__description"><strong>توضیحات</strong><p>' + esc(item.description) + '</p></div>' : '';

  Clinic.pages.gallery = { async init() {
    setMeta({ title: 'گالری قبل و بعد', description: 'نمونه‌های روند درمان با رضایت بیماران' });
    document.getElementById('main').innerHTML = ui.pageHero({ title: 'گالری قبل و بعد', lead: 'تصاویر فقط با رضایت کتبی بیمار منتشر می‌شوند.', crumbs: [{ label: 'خانه', href: url('index.html') }, { label: 'گالری' }] }) +
      '<div class="container section stack"><div class="disclaimer" role="note">' + Clinic.icon('info') + '<span>نتیجه‌ی درمان در هر بیمار متفاوت است و تصاویر نمونه، تضمین نتیجه نیستند.</span></div>' +
      '<div id="chips"></div><div id="grid" class="grid grid--3" aria-live="polite"></div></div>';
    const chipsEl = document.getElementById('chips'), grid = document.getElementById('grid');
    chipsEl.innerHTML = ui.chips(CATS.map((c) => ({ value: c[0], label: c[1] })), 'all', 'نوع زخم');
    let items = [];
    let drawId = 0;
    const draw = async (cat) => {
      const id = ++drawId;
      grid.innerHTML = ui.skeletons(3);
      try {
        const result = await Clinic.api.get('/gallery?category=' + cat);
        if (id !== drawId) return;
        items = result.data.filter((item) => !item.isPlaceholder);
      } catch (e) {
        if (id === drawId) grid.innerHTML = ui.state({ type: 'error', title: 'بارگذاری گالری انجام نشد', text: e.message });
        return;
      }
      grid.innerHTML = items.length ? items.map((g, i) =>
        '<article class="card case-card"><div class="case-card__pair">' + figures(g) + '</div>' +
        '<h3>' + esc(g.title) + '</h3>' + description(g) +
        '<button type="button" class="btn btn--secondary btn--sm" data-open="' + i + '">مشاهده‌ی بزرگ‌تر</button></article>').join('')
        : ui.state({ title: cat === 'all' ? 'نمونه‌کارها به زودی اضافه می‌شوند' : 'موردی در این دسته نیست' });
    };
    ui.bindChips(chipsEl, draw);
    grid.addEventListener('click', (e) => {
      const b = e.target.closest('[data-open]'); if (!b) return;
      const cases = items;
      let idx = Number(b.dataset.open);
      const body = () => '<div class="lightbox-stage">' + figures(cases[idx], true) + '</div>' + description(cases[idx]) +
        (cases.length > 1 ? '<div class="row" style="justify-content:space-between;margin-top:16px"><button class="btn btn--subtle" data-nav="-1">' + Clinic.icon('chevron-right') + ' قبلی</button><button class="btn btn--subtle" data-nav="1">بعدی ' + Clinic.icon('chevron-left') + '</button></div>' : '');
      const m = ui.modal({ title: cases[idx].title, body: body() });
      m.el.addEventListener('click', (ev) => {
        const n = ev.target.closest('[data-nav]'); if (!n) return;
        idx = (idx + Number(n.dataset.nav) + cases.length) % cases.length;
        m.el.querySelector('.modal__body').innerHTML = body();
        m.el.querySelector('.modal__head h2').textContent = cases[idx].title;
        m.el.querySelector('[role="dialog"]').setAttribute('aria-label', cases[idx].title);
        m.el.querySelector('[data-nav="' + n.dataset.nav + '"]').focus();
      });
    });
    draw('all');
  } };
})();
