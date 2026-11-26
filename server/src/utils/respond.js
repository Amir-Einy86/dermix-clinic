/* respond.js — قالب یکسان پاسخ‌ها: { success, data, meta } */
exports.ok = (res, data, meta, status) => res.status(status || 200).json({ success: true, data, meta: meta || undefined });
exports.paginate = (query, defaults) => {
  const limit = Math.max(1, Math.min(100, parseInt(query.limit, 10) || (defaults && defaults.limit) || 12));
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  return { limit, page, skip: (page - 1) * limit };
};
exports.metaOf = (total, page, limit) => ({ total, page, pages: Math.max(1, Math.ceil(total / limit)), limit });
