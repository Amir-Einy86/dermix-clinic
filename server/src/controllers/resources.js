/* resources.js — تنظیم هر منبع (Resource): مدل + قوانین نمایش/جستجو
   نوبت‌ها و بیماران کنترلر اختصاصی دارند (appointmentAdmin.js). */
const M = require('../models');
const crud = require('./crud');

const pub = { published: { $ne: false } };
const act = { active: { $ne: false } };
const consented = (...fields) => ({
  published: true,
  $and: [{ $or: [{ consent: true }, { isPlaceholder: true, ...Object.fromEntries(fields.map((field) => [field, { $in: ['', null] }])) }] }],
});

module.exports = {
  services: crud(M.Service, { name: 'services', visible: pub, searchFields: ['title', 'summary'] }),
  wounds: crud(M.WoundCategory, { name: 'wounds', visible: pub, searchFields: ['title', 'intro'] }),
  branches: crud(M.Branch, { name: 'branches', visible: act, slugFrom: 'name', searchFields: ['name', 'city'] }),
  team: crud(M.TeamMember, { name: 'team', visible: act, slugFrom: 'name', searchFields: ['name', 'title'] }),
  gallery: crud(M.GalleryCase, { name: 'gallery', visible: consented('beforeImage', 'afterImage'), filters: ['category'], searchFields: ['title'] }),
  testimonials: crud(M.Testimonial, { name: 'testimonials', visible: { published: true, consent: true, videoUrl: { $exists: true, $nin: ['', null] } }, filters: ['category'], paged: true, limit: 12, searchFields: ['title'] }),
  articles: crud(M.Article, { name: 'articles', visible: pub, filters: ['category'], paged: true, limit: 9, sort: { publishedAt: -1 }, searchFields: ['title', 'excerpt'] }),
  journal: crud(M.JournalArticle, { name: 'journal', visible: pub, filters: ['category'], paged: true, limit: 9, sort: { publishedAt: -1 }, searchFields: ['title', 'excerpt'] }),
  // پیام‌ها فقط در بخش مدیریت‌اند؛ تنها فیلد قابل ویرایش «خوانده شد» است
  messages: crud(M.ContactMessage, { name: 'messages', personal: true, searchFields: ['name', 'phone', 'message'], sort: { createdAt: -1 }, editable: ['read'] }),
};
