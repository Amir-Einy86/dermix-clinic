/* AuditLog — گزارش فعالیت مدیران (چه کسی، چه کاری، روی چه چیزی، از چه IP)
   رکوردها بعد از ۴۰۰ روز خودکار پاک می‌شوند (TTL index). */
const mongoose = require('mongoose');
const jsonPlugin = require('./plugins');

const schema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName: { type: String, trim: true, maxlength: 120, default: '' },
  action: { type: String, required: true, maxlength: 40 },     // login | login_failed | create | update | delete | status | ...
  resource: { type: String, maxlength: 40, default: '' },
  resourceId: { type: String, maxlength: 60, default: '' },
  summary: { type: String, maxlength: 300, default: '' },
  ip: { type: String, maxlength: 64, default: '' },
}, { timestamps: { createdAt: true, updatedAt: false } });
schema.index({ createdAt: 1 }, { expireAfterSeconds: 400 * 24 * 3600 });
schema.index({ user: 1, createdAt: -1 });
schema.plugin(jsonPlugin);
module.exports = mongoose.model('AuditLog', schema);
