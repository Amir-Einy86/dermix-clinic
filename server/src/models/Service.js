const mongoose = require('mongoose');
const jsonPlugin = require('./plugins');
const { faqSchema, seoSchema, strList, SLUG_RE } = require('./common');
const schema = new mongoose.Schema({
  title: { type: String, required: [true, 'عنوان الزامی است'], trim: true, maxlength: 120 },
  slug: { type: String, required: true, unique: true, match: SLUG_RE },
  icon: { type: String, default: 'heart' },
  summary: { type: String, trim: true, maxlength: 400, default: '' },
  intro: { type: String, trim: true, maxlength: 1000, default: '' },
  description: { type: String, trim: true, maxlength: 5000, default: '' },
  applications: strList(), process: strList(), considerations: strList(),
  faqs: [faqSchema], related: [String], seo: seoSchema,
  order: { type: Number, default: 0 }, published: { type: Boolean, default: true },
}, { timestamps: true });
schema.plugin(jsonPlugin);
module.exports = mongoose.model('Service', schema);
