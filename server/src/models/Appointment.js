const mongoose = require('mongoose');
const jsonPlugin = require('./plugins');
const { DATE_RE, TIME_RE } = require('../utils/time');

// وضعیت‌ها (همان مقادیر فارسی قبلی برای سازگاری با داده‌های موجود + «عدم مراجعه»)
const STATUSES = ['جدید', 'در حال بررسی', 'تأیید شده', 'تکمیل شده', 'لغو شده', 'عدم مراجعه'];
// وضعیت‌هایی که ظرفیت بازه را اشغال می‌کنند
const HOLDING = ['جدید', 'در حال بررسی', 'تأیید شده', 'تکمیل شده', 'عدم مراجعه'];
// وضعیت‌هایی که بیمار هنوز می‌تواند لغو کند
const CANCELLABLE = ['جدید', 'در حال بررسی', 'تأیید شده'];
const SOURCES = ['online', 'phone', 'walk_in', 'admin'];

const historySchema = new mongoose.Schema({
  at: { type: Date, default: Date.now },
  by: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  byName: { type: String, trim: true, maxlength: 80, default: '' }, // «بیمار» یا نام مدیر
  action: { type: String, trim: true, maxlength: 40, required: true }, // created | status | reschedule | note | assign | cancel
  note: { type: String, trim: true, maxlength: 300, default: '' },
}, { _id: false });

const schema = new mongoose.Schema({
  referenceNumber: { type: String, required: true, unique: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient', index: true },
  fullName: { type: String, required: true, trim: true, minlength: 3, maxlength: 100 },
  phone: { type: String, required: true, match: [/^09\d{9}$/, 'شماره موبایل معتبر نیست'] },
  branch: { type: String, required: true, trim: true },
  branchName: { type: String, trim: true, maxlength: 80, default: '' },
  woundType: { type: String, required: true, trim: true },
  visitType: { type: String, enum: ['clinic', 'home'], default: 'clinic' },
  address: { type: String, trim: true, maxlength: 400, default: '' },
  // زمان نوبت (برای نوبت‌های قدیمی که فقط «درخواست» بودند ممکن است خالی باشد)
  date: { type: String, match: [DATE_RE, 'تاریخ نامعتبر است'] },
  time: { type: String, match: [TIME_RE, 'ساعت نامعتبر است'] },
  startAt: { type: Date },
  durationMin: { type: Number, min: 5, max: 480, default: 30 },
  preferredDate: { type: String, trim: true, default: '' }, // قدیمی
  preferredTime: { type: String, trim: true, default: '' }, // قدیمی
  description: { type: String, trim: true, maxlength: 1000, default: '' },
  status: { type: String, enum: STATUSES, default: 'جدید' },
  source: { type: String, enum: SOURCES, default: 'online' },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'TeamMember' },
  internalNote: { type: String, trim: true, maxlength: 2000, default: '' },
  cancelReason: { type: String, trim: true, maxlength: 300, default: '' },
  reminderSentAt: { type: Date, default: null }, // پیامک یادآوری روز قبل فرستاده شده؟
  cancelledAt: Date,
  history: { type: [historySchema], default: [] },
}, { timestamps: true, optimisticConcurrency: true });

schema.index({ branch: 1, date: 1, time: 1 });
schema.index({ startAt: 1 });
schema.index({ status: 1, startAt: 1 });
schema.index({ phone: 1, createdAt: -1 });
schema.statics.STATUSES = STATUSES;
schema.statics.HOLDING = HOLDING;
schema.statics.CANCELLABLE = CANCELLABLE;
schema.statics.SOURCES = SOURCES;
schema.plugin(jsonPlugin);
module.exports = mongoose.model('Appointment', schema);
