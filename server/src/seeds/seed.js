/*
  seed.js — پر کردن اولیه‌ی دیتابیس
  داده‌ها از همان فایل client/assets/js/data/mock-data.js خوانده می‌شوند تا یک منبع واحد داشته باشیم.
  اجرا:  npm run seed          (فقط اگر دیتابیس خالی باشد)
         npm run seed -- --reset   (همه‌ی داده‌ها پاک و دوباره ساخته می‌شود)
  مدیر ارشد از SEED_ADMIN_EMAIL و SEED_ADMIN_PASSWORD در .env ساخته می‌شود؛ اگر رمز ندهید، یک رمز تصادفی ساخته و فقط یک‌بار چاپ می‌شود.
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const crypto = require('crypto');
const mongoose = require('mongoose');
const env = require('../config/env');
const connectDb = require('../config/db');
const M = require('../models');

const loadMock = () => {
  const file = path.join(env.clientDir, 'assets/js/data/mock-data.js');
  const sandbox = { window: {}, Intl };
  sandbox.window.Clinic = {};
  vm.createContext(sandbox);
  vm.runInContext('var Clinic = window.Clinic;' + fs.readFileSync(file, 'utf8'), sandbox);
  return sandbox.window.Clinic.mockData;
};
const strip = (o) => { const c = { ...o }; delete c.id; return c; };

(async () => {
  const reset = process.argv.includes('--reset');
  await connectDb();
  if (reset) await Promise.all(Object.values(M).map((m) => m.deleteMany({})));
  if (!(await M.Service.exists({}))) {
    const d = loadMock();
    const sampleArticle = (article) => env.isProd ? { ...strip(article), published: false } : strip(article);
    await M.SiteSetting.create(d.settings);
    await M.Statistic.create({ patients: null, wounds: null, years: null });
    await M.Service.insertMany(d.services.map(strip));
    await M.WoundCategory.insertMany(d.wounds.map(strip));
    await M.Branch.insertMany(d.branches.map(strip));
    await M.TeamMember.insertMany(d.team.map(strip));
    await M.GalleryCase.insertMany(d.gallery.map(strip));
    await M.Testimonial.insertMany(d.testimonials.map(strip));
    await M.ArticleCategory.insertMany([...d.articleCategories.map((c) => ({ name: c.name, slug: c.slug, scope: 'article' })), ...d.journalCategories.map((c) => ({ name: c.name, slug: c.slug, scope: 'journal' }))]);
    await M.Article.insertMany(d.articles.map(sampleArticle));
    await M.JournalArticle.insertMany(d.journal.map(sampleArticle));
    console.log('✔ داده‌های اولیه ساخته شد');
  } else {
    console.log('داده‌های اولیه قبلاً ثبت شده‌اند.');
  }

  if (!(await M.User.countDocuments({ role: 'super_admin' }))) {
    const email = (process.env.SEED_ADMIN_EMAIL || '').toLowerCase();
    if (!email) console.log('⚠ SEED_ADMIN_EMAIL تنظیم نشده؛ مدیر ارشد ساخته نشد. در .env تنظیم کنید و دوباره اجرا کنید.');
    else {
      const password = process.env.SEED_ADMIN_PASSWORD || crypto.randomBytes(12).toString('base64url') + '7';
      // رمز مدیر ارشد هم باید همان سیاست رمز بقیه‌ی کاربران را رعایت کند (حداقل ۱۰ نویسه، حرف و عدد)
      const problem = M.User.passwordProblem(password);
      if (problem) throw new Error('SEED_ADMIN_PASSWORD ضعیف است: ' + problem);
      await M.User.create({ name: 'مدیر ارشد', email, role: 'super_admin', passwordHash: await M.User.hashPassword(password) });
      console.log('✔ مدیر ارشد ساخته شد:', email);
      if (!process.env.SEED_ADMIN_PASSWORD) console.log('  رمز موقت (فقط همین یک‌بار نمایش داده می‌شود):', password);
      else console.log('  ⚠ حالا SEED_ADMIN_PASSWORD را از فایل .env پاک کنید و بعد از اولین ورود، رمز را از «حساب من» عوض کنید.');
    }
  }
  await mongoose.disconnect();
})().catch((e) => { console.error('✖ seed ناموفق:', e.message); process.exit(1); });
