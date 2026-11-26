const mongoose = require('mongoose');
const jsonPlugin = require('./plugins');
const t = (max) => ({ type: String, trim: true, maxlength: max, default: '' });
const schema = new mongoose.Schema({
  title: { type: String, required: [true, 'عنوان الزامی است'], trim: true, maxlength: 150 },
  category: { type: String, enum: ['diabetic', 'pressure', 'venous', 'arterial', 'burn', 'surgical'], required: true },
  description: t(1500),
  videoUrl: t(500), thumbnail: t(300),
  // رضایت‌نامه‌ی کتبی بیمار؛ بدون آن انتشار ممنوع است
  consent: { type: Boolean, default: false },
  published: { type: Boolean, default: false },
  isPlaceholder: { type: Boolean, default: false },
  order: { type: Number, default: 0 },
}, { timestamps: true });

schema.pre('validate', function () {
  if (this.published && !this.consent && (!this.isPlaceholder || this.videoUrl || this.thumbnail)) this.invalidate('published', 'برای انتشار، رضایت‌نامه‌ی کتبی بیمار باید تأیید شده باشد.');
});
schema.plugin(jsonPlugin);
module.exports = mongoose.model('Testimonial', schema);
