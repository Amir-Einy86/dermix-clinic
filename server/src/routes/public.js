/* public.js — مسیرهای عمومی (بدون ورود). همان آدرس‌هایی که فرانت‌اند صدا می‌زند. */
const router = require('express').Router();
const R = require('../controllers/resources');
const P = require('../controllers/publicController');
const { formLimiter, lookupLimiter, otpLimiter } = require('../middleware/rateLimit');
const { SiteSetting } = require('../models');
const asyncHandler = require('../utils/asyncHandler');
const { notFound } = require('../middleware/errorHandler');

router.get('/settings', P.settings);
router.get('/statistics', P.statistics);
router.get('/article-categories', P.categories('article'));
router.get('/journal-categories', P.categories('journal'));
router.use('/testimonials', asyncHandler(async (req, res, next) => {
  res.set('Cache-Control', 'no-store');
  if (!(await SiteSetting.getSingleton()).showTestimonials) return notFound(req, res);
  return next();
}));

['services', 'wounds', 'branches', 'team', 'gallery', 'testimonials', 'articles', 'journal'].forEach((name) => {
  router.get('/' + name, R[name].publicList);
  router.get('/' + name + '/:slug', R[name].publicGet);
});

// نوبت‌دهی آنلاین
router.use('/appointments', (req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
router.get('/availability', P.availability);
router.post('/appointments/otp', otpLimiter, P.requestOtp);
router.post('/appointments', formLimiter, P.createAppointment);
router.post('/appointments/lookup', lookupLimiter, P.lookupAppointment);
router.post('/appointments/cancel', lookupLimiter, P.cancelAppointment);

router.post('/messages', formLimiter, P.createMessage);
module.exports = router;
