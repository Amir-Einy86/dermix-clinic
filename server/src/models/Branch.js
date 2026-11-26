const mongoose = require('mongoose');
const jsonPlugin = require('./plugins');
const { faqSchema, SLUG_RE } = require('./common');
const { TIME_RE, DATE_RE, toMinutes } = require('../utils/time');

const t = (max) => ({ type: String, trim: true, maxlength: max, default: '' });

/* شیفت کاری: day طبق getUTCDay → ۰ یکشنبه، ۱ دوشنبه … ۵ جمعه، ۶ شنبه */
const shiftSchema = new mongoose.Schema({
  day: { type: Number, required: true, min: 0, max: 6 },
  start: { type: String, required: true, match: [TIME_RE, 'ساعت شروع باید به شکل HH:MM باشد'] },
  end: { type: String, required: true, match: [TIME_RE, 'ساعت پایان باید به شکل HH:MM باشد'] },
}, { _id: false });
shiftSchema.path('end').validate(function (v) { return !TIME_RE.test(this.start || '') || !TIME_RE.test(v || '') || toMinutes(v) > toMinutes(this.start); }, 'ساعت پایان شیفت باید بعد از ساعت شروع باشد');

// شنبه تا چهارشنبه دو شیفت، پنجشنبه فقط صبح، جمعه تعطیل
const DEFAULT_SHIFTS = () => [6, 0, 1, 2, 3].flatMap((day) => [{ day, start: '09:00', end: '13:00' }, { day, start: '16:00', end: '20:00' }]).concat([{ day: 4, start: '09:00', end: '13:00' }]);

const bookingSchema = new mongoose.Schema({
  enabled: { type: Boolean, default: true },
  slotMinutes: { type: Number, min: 10, max: 240, default: 30 },   // طول هر نوبت
  capacity: { type: Number, min: 1, max: 50, default: 1 },         // چند بیمار در هر بازه
  leadMinutes: { type: Number, min: 0, max: 10080, default: 120 }, // حداقل فاصله تا نوبت (رزرو آنلاین)
  horizonDays: { type: Number, min: 1, max: 120, default: 30 },    // تا چند روز آینده قابل رزرو است
  shifts: { type: [shiftSchema], default: DEFAULT_SHIFTS },
  closedDates: { type: [{ type: String, match: [DATE_RE, 'تاریخ تعطیل نامعتبر است'] }], default: [] },
}, { _id: false });

const schema = new mongoose.Schema({
  name: { type: String, required: [true, 'نام شعبه الزامی است'], trim: true, maxlength: 80 },
  slug: { type: String, required: true, unique: true, match: SLUG_RE },
  city: t(80), address: t(400), hours: t(200), phone: t(30), mapUrl: t(500),
  services: [String], homeVisit: { type: Boolean, default: false }, faqs: [faqSchema],
  booking: { type: bookingSchema, default: () => ({}) },
  isPlaceholder: { type: Boolean, default: false },
  order: { type: Number, default: 0 }, active: { type: Boolean, default: true },
}, { timestamps: true });
schema.statics.DEFAULT_SHIFTS = DEFAULT_SHIFTS;
schema.plugin(jsonPlugin);
module.exports = mongoose.model('Branch', schema);
