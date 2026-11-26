const mongoose = require('mongoose');
const jsonPlugin = require('./plugins');
const schema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 3, maxlength: 100 },
  phone: { type: String, required: true, match: [/^09\d{9}$/, 'شماره موبایل معتبر نیست'] },
  message: { type: String, required: true, trim: true, maxlength: 2000 },
  read: { type: Boolean, default: false },
}, { timestamps: true });
schema.plugin(jsonPlugin);
module.exports = mongoose.model('ContactMessage', schema);
