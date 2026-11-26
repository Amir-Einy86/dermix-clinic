/* appError.js — خطای قابل‌پیش‌بینی با کد HTTP و پیام فارسی */
class AppError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors || null;
    this.isAppError = true;
  }
}
module.exports = AppError;
