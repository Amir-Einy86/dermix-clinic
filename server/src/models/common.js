/* common.js — زیرطرح‌های مشترک */
const { Schema } = require('mongoose');
const faqSchema = new Schema({ q: { type: String, required: true, trim: true, maxlength: 300 }, a: { type: String, required: true, trim: true, maxlength: 2000 } }, { _id: false });
const seoSchema = new Schema({ title: { type: String, trim: true, maxlength: 120 }, description: { type: String, trim: true, maxlength: 300 } }, { _id: false });
const strList = (max) => [{ type: String, trim: true, maxlength: max || 1000 }];
const SLUG_RE = /^[؀-ۿa-z0-9-]+$/;
module.exports = { faqSchema, seoSchema, strList, SLUG_RE };
