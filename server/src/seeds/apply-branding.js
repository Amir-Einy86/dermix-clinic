/*
  apply-branding.js — اعمال نام «درمیکس» و دو شعبه‌ی جدید روی دیتابیسی که از قبل پر شده است
  اجرا:  npm run migrate:branding
  فقط اطلاعات تماس، معرفی پزشک و تیم: npm run migrate:branding -- --clinic-info
  - غیرمخرب است: هیچ کاربر، نوبت، بیمار یا پیامی حذف یا عوض نمی‌شود.
  - دو شعبه‌ی جدید (وحیدیه، ولیعصر) ساخته یا به‌روز می‌شوند.
  - شعبه‌های دیگر حذف نمی‌شوند، فقط «غیرفعال» می‌شوند تا نوبت‌های قدیمی که به آن‌ها اشاره دارند سالم بمانند.
    اگر مطمئنید لازمشان ندارید، از پنل مدیریت (شعبه‌ها) حذفشان کنید.
  - چند بار اجرا کردنش مشکلی ندارد (idempotent).
*/
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const mongoose = require('mongoose');
const env = require('../config/env');
const connectDb = require('../config/db');
const M = require('../models');

const loadMock = () => {
  const file = path.join(env.clientDir, 'assets/js/data/mock-data.js');
  const sandbox = { window: { Clinic: {} }, Intl };
  vm.createContext(sandbox);
  vm.runInContext('var Clinic = window.Clinic;' + fs.readFileSync(file, 'utf8'), sandbox);
  return sandbox.window.Clinic.mockData;
};

(async () => {
  await connectDb();
  const d = loadMock();

  const settings = await M.SiteSetting.getSingleton();
  const { phone1, phone2, heroDoctor, showTestimonials } = d.settings;
  settings.set({ phone1, phone2, heroDoctor, showTestimonials, instagram: undefined });
  for (const member of d.team) {
    const { id, ...data } = member;
    await M.TeamMember.updateOne({ name: data.name }, { $set: data }, { upsert: true, runValidators: true });
  }
  await M.TeamMember.updateMany({ isPlaceholder: true }, { $set: { active: false } });
  if (process.argv.includes('--clinic-info')) {
    await settings.save();
    console.log('✔ اطلاعات تماس و تیم درمان به‌روز شد.');
    await mongoose.disconnect();
    return;
  }
  settings.set({ clinicName: d.settings.clinicName, coverageText: d.settings.coverageText });
  await settings.save();
  console.log('✔ نام کلینیک:', settings.clinicName);

  const keep = [];
  for (const b of d.branches) {
    const data = { ...b }; delete data.id;
    await M.Branch.findOneAndUpdate({ slug: b.slug }, { $set: data }, { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true });
    keep.push(b.slug);
    console.log('✔ شعبه:', b.name);
  }
  const off = await M.Branch.updateMany({ slug: { $nin: keep }, active: { $ne: false } }, { $set: { active: false } });
  console.log('✔ شعبه‌های قدیمی غیرفعال شدند:', off.modifiedCount);
  await mongoose.disconnect();
})().catch((e) => { console.error('✖ به‌روزرسانی ناموفق:', e.message); process.exit(1); });
