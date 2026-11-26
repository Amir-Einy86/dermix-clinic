const mongoose = require('mongoose');
const jsonPlugin = require('./plugins');
const { SLUG_RE } = require('./common');
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, maxlength: 80 },
  slug: { type: String, required: true, match: SLUG_RE },
  scope: { type: String, enum: ['article', 'journal'], default: 'article' },
}, { timestamps: true });
schema.index({ slug: 1, scope: 1 }, { unique: true });
schema.plugin(jsonPlugin);
module.exports = mongoose.model('ArticleCategory', schema);
