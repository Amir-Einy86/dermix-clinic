const mongoose = require('mongoose');
const jsonPlugin = require('./plugins');
const s = (max) => ({ type: String, trim: true, maxlength: max || 300, default: '' });
const schema = new mongoose.Schema({
  clinicName: s(80), tagline: s(120), phone1: s(30), phone2: s(30), whatsapp: s(30), instagram: s(200), email: s(120),
  consultationInfo: s(500), consultationHours: s(200), coverageText: s(300),
  heroTitle: s(120), heroAccent: s(120), heroLead: s(600), introTitle: s(120), introText: s(2000),
  heroDoctor: s(120),
  showTestimonials: { type: Boolean, default: false },
  isPlaceholder: { type: Boolean, default: true },
}, { timestamps: true });
// فقط یک سند تنظیمات وجود دارد (singleton)
schema.statics.getSingleton = async function () { return (await this.findOne()) || this.create({}); };
schema.plugin(jsonPlugin);
module.exports = mongoose.model('SiteSetting', schema);
