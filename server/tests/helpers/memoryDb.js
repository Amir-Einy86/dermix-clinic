/*
  memoryDb.js — دیتابیس تست
  - اگر MongoDB روی همین سیستم روشن باشد: دیتابیس جداگانه‌ی clinic_test روی آن.
  - وگرنه: یک MongoDB موقت در حافظه (mongodb-memory-server) — بار اول فایل mongod (~۷۰۰MB) دانلود و کش می‌شود.
  - با MONGODB_URI_TEST=mongodb://127.0.0.1:27017/clinic_test روی MongoDB خودتان اجرا می‌شود.
  چون موتور واقعی است، عملیات اتمیک رزرو، ایندکس‌های یکتا و aggregate دقیقاً مثل production تست می‌شوند.
*/
const mongoose = require('mongoose');
const models = require('../../src/models');

let mem = null;

// اگر MongoDB محلی روشن باشد از دیتابیس جداگانه‌ی clinic_test روی آن استفاده می‌کنیم (دیتابیس اصلی دست نمی‌خورد)
const LOCAL = 'mongodb://127.0.0.1:27017/clinic_test';
const localAvailable = async () => {
  try { const c = await mongoose.createConnection(LOCAL, { serverSelectionTimeoutMS: 1500 }).asPromise(); await c.close(); return true; } catch (e) { return false; }
};

exports.setup = async () => {
  let uri = process.env.MONGODB_URI_TEST || ((await localAvailable()) ? LOCAL : '');
  if (!uri) {
    const { MongoMemoryServer } = require('mongodb-memory-server');
    mem = await MongoMemoryServer.create();
    uri = mem.getUri('clinic_test');
  }
  await mongoose.connect(uri);
  await Promise.all(Object.values(models).map((M) => M.deleteMany({})));
  await Promise.all(Object.values(models).map((M) => M.syncIndexes())); // ایندکس‌های یکتا قبل از تست ساخته شوند
};

exports.reset = () => Promise.all(Object.values(models).map((M) => M.deleteMany({})));

exports.teardown = async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (mem) await mem.stop();
};
