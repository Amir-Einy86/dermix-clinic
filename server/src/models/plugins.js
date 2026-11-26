/* plugins.js — پلاگین مشترک Mongoose: خروجی JSON با فیلد id (به‌جای _id و __v) */
module.exports = function jsonPlugin(schema) {
  schema.set('toJSON', {
    virtuals: false,
    versionKey: false,
    transform(doc, ret) {
      ret.id = String(ret._id);
      delete ret._id;
      delete ret.passwordHash;
      return ret;
    },
  });
};
