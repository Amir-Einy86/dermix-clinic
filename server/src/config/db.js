/* db.js — اتصال به MongoDB با Mongoose */
const mongoose = require('mongoose');
const env = require('./env');

mongoose.set('strictQuery', true);

module.exports = async function connectDb(uri) {
  await mongoose.connect(uri || env.mongoUri, { serverSelectionTimeoutMS: 8000 });
  return mongoose.connection;
};
