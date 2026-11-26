/* SlotCounter — شمارنده‌ی ظرفیت هر بازه‌ی زمانی (شعبه + تاریخ + ساعت)
   رزرو با یک عملیات اتمیک انجام می‌شود ($inc با شرط count < capacity) و ایندکس یکتا
   تضمین می‌کند دو درخواست هم‌زمان هرگز از ظرفیت جلو نزنند. */
const mongoose = require('mongoose');

const schema = new mongoose.Schema({
  branch: { type: String, required: true },
  date: { type: String, required: true },
  time: { type: String, required: true },
  count: { type: Number, default: 0, min: 0 },
}, { versionKey: false });
schema.index({ branch: 1, date: 1, time: 1 }, { unique: true });
module.exports = mongoose.model('SlotCounter', schema);
