const mongoose = require('mongoose');
const jsonPlugin = require('./plugins');
const { faqSchema, seoSchema, strList, SLUG_RE } = require('./common');
const schema = new mongoose.Schema({
  title: { type: String, required: [true, 'عنوان الزامی است'], trim: true, maxlength: 120 },
  slug: { type: String, required: true, unique: true, match: SLUG_RE },
  en: { type: String, trim: true, maxlength: 120, default: '' },
  icon: { type: String, default: 'activity' },
  category: { type: String, enum: ['diabetic', 'pressure', 'venous', 'arterial', 'burn', 'surgical'], required: true },
  intro: { type: String, trim: true, maxlength: 1500, default: '' },
  causes: strList(), symptoms: strList(), warnings: strList(), approaches: strList(),
  whenToSeek: { type: String, trim: true, maxlength: 1500, default: '' },
  services: [String], relatedArticles: [String], faqs: [faqSchema], seo: seoSchema,
  order: { type: Number, default: 0 }, published: { type: Boolean, default: true },
}, { timestamps: true });
schema.plugin(jsonPlugin);
module.exports = mongoose.model('WoundCategory', schema);
