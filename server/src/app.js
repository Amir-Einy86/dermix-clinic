/* app.js — ساخت اپلیکیشن Express (جدا از server.js تا در تست‌ها بدون listen استفاده شود) */
const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const env = require('./config/env');
const { notFound, errorHandler } = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimit');
const sanitize = require('./middleware/sanitize');

module.exports = function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxy || false); // از TRUST_PROXY در .env؛ پیش‌فرض: به هیچ هدر X-Forwarded-For اعتماد نکن

  // ریدایرکت http → https (با FORCE_HTTPS=true). پشت پراکسی، TRUST_PROXY باید درست باشد تا req.secure درست تشخیص داده شود.
  // مقصد از SITE_URL ساخته می‌شود (نه از هدر Host) تا ریدایرکت به دامنه‌ی دلخواه مهاجم ممکن نباشد.
  if (env.forceHttps) {
    app.use((req, res, next) => {
      if (req.secure || req.path === '/api/health') return next(); // health check داخلی هاست روی http هم جواب بگیرد
      const base = env.siteUrl ? env.siteUrl.replace(/^http:/, 'https:') : 'https://' + req.hostname;
      return res.redirect(301, base + req.originalUrl);
    });
  }

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:'], fontSrc: ["'self'"], connectSrc: ["'self'"], mediaSrc: ["'self'", 'https:'], frameSrc: ["'self'", 'https:'], objectSrc: ["'none'"], baseUri: ["'self'"], formAction: ["'self'"], frameAncestors: ["'none'"],
      },
    },
    crossOriginEmbedderPolicy: false,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));
  app.use(compression());
  if (env.corsOrigin) {
    app.use('/api', (req, res, next) => {
      if (req.headers.origin === env.corsOrigin) {
        res.set({ 'Access-Control-Allow-Origin': env.corsOrigin, 'Access-Control-Allow-Credentials': 'true', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE', Vary: 'Origin' });
        if (req.method === 'OPTIONS') return res.sendStatus(204);
      }
      return next();
    });
  }
  app.use(express.json({ limit: '100kb' }));
  app.use(sanitize); // حذف کلیدهای $ و . و __proto__ از بدنه (NoSQL injection / prototype pollution)
  app.use(cookieParser());

  // health check برای هاست/مانیتورینگ: اگر اتصال دیتابیس قطع باشد 503 می‌دهد (بدون هیچ اطلاعات داخلی)
  app.get('/api/health', (req, res) => {
    const dbUp = mongoose.connection.readyState === 1;
    res.set('Cache-Control', 'no-store');
    res.status(dbUp ? 200 : 503).json({ success: dbUp, data: { status: dbUp ? 'ok' : 'degraded', db: dbUp ? 'up' : 'down' } });
  });
  app.use('/api', apiLimiter);
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api', require('./routes/public'));
  app.use('/api', notFound);

  app.use('/uploads', require('./middleware/mediaAccess'), express.static(env.uploadDir, {
    index: false, dotfiles: 'deny', cacheControl: false, etag: false, lastModified: false,
  }));

  if (env.serveClient && fs.existsSync(env.clientDir)) {
    // robots.txt و sitemap.xml با دامنه‌ی واقعی (SITE_URL) به‌جای example.com؛ بدون SITE_URL همان فایل اصلی سرو می‌شود
    if (env.siteUrl) {
      [['/robots.txt', 'text/plain'], ['/sitemap.xml', 'application/xml']].forEach(([file, type]) => {
        const src = path.join(env.clientDir, file);
        if (!fs.existsSync(src)) return;
        const body = fs.readFileSync(src, 'utf8').split('https://example.com').join(env.siteUrl);
        app.get(file, (req, res) => res.type(type).send(body));
      });
    }
    app.use(express.static(env.clientDir, {
      extensions: ['html'],
      // فونت‌ها و فایل‌های ثابت طولانی‌مدت کش شوند؛ HTML همیشه تازه
      setHeaders: (res, file) => { if (/\.(woff2|svg|png|jpg|webp)$/.test(file)) res.set('Cache-Control', 'public, max-age=2592000'); },
    }));
    app.use((req, res) => res.status(404).sendFile(path.join(env.clientDir, '404.html')));
  }
  app.use(errorHandler);
  return app;
};
