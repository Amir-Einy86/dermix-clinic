/* audit.js — ثبت گزارش فعالیت مدیران. هرگز باعث شکست درخواست اصلی نمی‌شود. */
const M = require('../models');

module.exports = function audit(req, action, resource, resourceId, summary) {
  const u = req.user;
  return M.AuditLog.create({
    user: u ? u._id : undefined,
    userName: u ? (u.name + ' <' + u.email + '>').slice(0, 120) : String((req.body && req.body.email) || '').slice(0, 120),
    action, resource: resource || '', resourceId: resourceId ? String(resourceId) : '',
    summary: String(summary || '').slice(0, 300), ip: String(req.ip || '').slice(0, 64),
  }).catch((e) => { if (process.env.NODE_ENV !== 'test') console.error('audit log failed:', e.message); });
};
