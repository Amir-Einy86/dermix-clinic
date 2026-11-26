const mongoose = require('mongoose');
const jsonPlugin = require('./plugins');
const { seoSchema, strList, SLUG_RE } = require('./common');
const schema = new mongoose.Schema({
  title: { type: String, required: [true, 'عنوان الزامی است'], trim: true, maxlength: 200 },
  slug: { type: String, required: true, unique: true, match: SLUG_RE },
  category: { type: String, required: true, trim: true },
  excerpt: { type: String, trim: true, maxlength: 500, default: '' },
  body: strList(8000), // هر عضو آرایه یک پاراگراف
  coverImage: { type: String, trim: true, default: '' },
  seo: seoSchema,
  // متن‌های نمونه تا زمان بازبینی تیم درمان با این پرچم مشخص می‌شوند
  isSample: { type: Boolean, default: false },
  published: { type: Boolean, default: true },
  publishedAt: { type: Date, default: Date.now },
}, { timestamps: true });
schema.plugin(jsonPlugin);
module.exports = mongoose.model('Article', schema);
