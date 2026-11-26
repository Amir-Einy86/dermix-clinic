(function () {
  'use strict';
  window.Clinic = window.Clinic || {}; Clinic.pages = Clinic.pages || {};
  const { esc, url, setMeta } = Clinic.utils;
  const { pageHero, pagination, bindPagination, state } = Clinic.ui;

  Clinic.pages.testimonials = { async init(ctx) {
    if (!ctx.settings.showTestimonials) {
      window.location.replace(url('index.html'));
      return;
    }
    setMeta({ title: 'ویدیوهای رضایت بیماران', description: 'ویدیوهای کلینیک درمیکس به زودی منتشر می‌شوند.' });
    const main = document.getElementById('main');
    main.innerHTML = pageHero({
      title: 'ویدیوهای رضایت بیماران',
      crumbs: [{ label: 'خانه', href: url('index.html') }, { label: 'رضایت بیماران' }],
    }) + '<section class="container section" id="patient-videos"></section>';
    const section = document.getElementById('patient-videos');
    const card = (video) => {
      let source;
      try { source = new URL(video.videoUrl, window.location.href); } catch (error) { return ''; }
      if (source.protocol !== 'https:' && !(source.protocol === 'http:' && source.origin === window.location.origin)) return '';
      const media = /\.(mp4|webm)$/i.test(source.pathname)
        ? '<video controls playsinline preload="none" src="' + esc(source.href) + '"></video>'
        : '<a href="' + esc(source.href) + '" target="_blank" rel="noopener noreferrer">مشاهده‌ی ویدیو</a>';
      return '<article class="card stack"><h2>' + esc(video.title) + '</h2>' + media +
        (video.description ? '<p>' + esc(video.description) + '</p>' : '') + '</article>';
    };
    const draw = async (page) => {
      try {
        const { data, meta } = await Clinic.api.get('/testimonials?page=' + page);
        const cards = data.map(card).join('');
        section.innerHTML = cards ? '<div class="grid grid--3 patient-videos">' + cards + '</div>' + pagination(meta) :
          '<div class="card video-coming-soon"><h2>به زودی!</h2></div>';
      } catch (error) {
        section.innerHTML = state({ type: 'error', title: 'بارگذاری ویدیوها انجام نشد' });
      }
    };
    bindPagination(section, draw);
    await draw(1);
  } };
})();
