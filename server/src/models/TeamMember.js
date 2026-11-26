const mongoose = require('mongoose');
const jsonPlugin = require('./plugins');
const t = (max) => ({ type: String, trim: true, maxlength: max, default: '' });
const schema = new mongoose.Schema({
  name: { type: String, required: [true, 'نام الزامی است'], trim: true, maxlength: 100 },
  title: t(100), education: t(300), qualifications: t(500), specialization: t(200), bio: t(1500), photo: t(300),
  phone: t(30),
  isPlaceholder: { type: Boolean, default: false },
  order: { type: Number, default: 0 }, active: { type: Boolean, default: true },
}, { timestamps: true });
schema.plugin(jsonPlugin);
module.exports = mongoose.model('TeamMember', schema);
