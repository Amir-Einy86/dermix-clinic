/* admin.js — مسیرهای پنل مدیریت (همه نیاز به ورود دارند)
   نقش‌ها:
     super_admin      همه‌چیز (+ مدیران، گزارش فعالیت، حذف نوبت)
     receptionist     پذیرش: نوبت‌ها، تقویم، بیماران، پیام‌ها
     content_manager  محتوا: خدمات، زخم‌ها، شعبه‌ها، تیم، گالری، مقالات، تنظیمات، آمار */
const router = require('express').Router();
const R = require('../controllers/resources');
const A = require('../controllers/adminController');
const AP = require('../controllers/appointmentAdmin');
const { authenticate, requireRole, sameOrigin } = require('../middleware/auth');
const upload = require('../middleware/upload');

const SUPER = requireRole('super_admin');
const DESK = requireRole('super_admin', 'receptionist');
const CONTENT = requireRole('super_admin', 'content_manager');

router.use(authenticate, sameOrigin);

router.get('/dashboard', A.dashboard);

// ---------- پذیرش ----------
router.get('/appointments', DESK, AP.list);
router.post('/appointments', DESK, AP.create);
router.get('/appointments/:id', DESK, AP.get);
router.put('/appointments/:id', DESK, AP.update);
router.patch('/appointments/:id', DESK, AP.update);
router.delete('/appointments/:id', SUPER, AP.remove);
router.get('/calendar', DESK, AP.calendar);
router.get('/patients', DESK, AP.patients);
router.get('/patients/:id', DESK, AP.patient);
router.put('/patients/:id', DESK, AP.updatePatient);
router.patch('/patients/:id', DESK, AP.updatePatient);
['get', 'put', 'patch', 'delete'].forEach((m) => router[m]('/messages' + (m === 'get' ? '' : '/:id'), DESK, m === 'get' ? R.messages.adminList : m === 'delete' ? R.messages.remove : R.messages.update));

// ---------- محتوا ----------
router.get('/settings', CONTENT, A.getSettings);
router.put('/settings', CONTENT, A.updateSettings);
router.patch('/settings', CONTENT, A.updateSettings);
router.get('/statistics', CONTENT, A.getStatistics);
router.put('/statistics', CONTENT, A.updateStatistics);
router.patch('/statistics', CONTENT, A.updateStatistics);
router.post('/uploads', CONTENT, (req, res, next) => upload(req, res, (err) => (err ? next(err) : A.uploaded(req, res))));

Object.keys(R).filter((n) => n !== 'messages').forEach((name) => {
  const h = R[name];
  router.get('/' + name, CONTENT, h.adminList);
  router.get('/' + name + '/:id', CONTENT, h.adminGet);
  router.post('/' + name, CONTENT, h.create);
  router.put('/' + name + '/:id', CONTENT, h.update);
  router.patch('/' + name + '/:id', CONTENT, h.update);
  router.delete('/' + name + '/:id', CONTENT, h.remove);
});

// ---------- مدیر ارشد ----------
router.get('/users', SUPER, A.listUsers);
router.post('/users', SUPER, A.createUser);
router.put('/users/:id', SUPER, A.updateUser);
router.patch('/users/:id', SUPER, A.updateUser);
router.delete('/users/:id', SUPER, A.deleteUser);
router.get('/audit', SUPER, A.auditLog);
module.exports = router;
