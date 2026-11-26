const router = require('express').Router();
const A = require('../controllers/authController');
const { authenticate, sameOrigin } = require('../middleware/auth');
const { loginLimiter } = require('../middleware/rateLimit');

router.post('/login', loginLimiter, sameOrigin, A.login);
router.get('/me', authenticate, A.me);
router.post('/logout', sameOrigin, A.logout);
router.post('/logout-all', authenticate, sameOrigin, A.logoutAll);
router.put('/password', loginLimiter, authenticate, sameOrigin, A.changePassword);
module.exports = router;
