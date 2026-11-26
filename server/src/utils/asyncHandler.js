/* asyncHandler.js — خطاهای async را به errorHandler می‌رساند (بدون try/catch تکراری) */
module.exports = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
