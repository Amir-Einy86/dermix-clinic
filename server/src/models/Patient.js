/* Patient — پرونده‌ی ساده‌ی بیمار؛ با شماره موبایل یکتا. هنگام هر رزرو خودکار ساخته/به‌روز می‌شود. */
const mongoose = require('mongoose');
const jsonPlugin = require('./plugins');

const schema = new mongoose.Schema({
  phone: { type: String, required: true, unique: true, match: [/^09\d{9}$/, 'شماره موبایل معتبر نیست'] },
  fullName: { type: String, required: true, trim: true, minlength: 3, maxlength: 100 },
  notes: { type: String, trim: true, maxlength: 3000, default: '' }, // یادداشت داخلی کادر درمان
  appointmentsCount: { type: Number, default: 0, min: 0 },
  lastAppointmentAt: Date,
}, { timestamps: true });
schema.index({ fullName: 1 });
schema.plugin(jsonPlugin);
module.exports = mongoose.model('Patient', schema);
