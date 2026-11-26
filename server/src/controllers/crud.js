/* crud.js — کارخانه‌ی کنترلر: برای هر مدل، هندلرهای عمومی و مدیریتی می‌سازد */
const AppError = require('../utils/appError');
const asyncHandler = require('../utils/asyncHandler');
const { ok, paginate, metaOf } = require('../utils/respond');
const { slugify, escapeRegex, normalizeDigits } = require('../utils/text');
const audit = require('../utils/audit');

const SYSTEM_FIELDS = ['_id', '__v', 'id', 'createdAt', 'updatedAt'];

/*
  opts:
   visible      فیلتر محتوای قابل‌نمایش برای عموم، مثل { published: { $ne: false } }
   searchFields فیلدهایی که با ?q= جستجو می‌شوند
   slugFrom     فیلدی که اسلاگ از آن ساخته می‌شود ('title' یا 'name')
   sort         ترتیب پیش‌فرض
   paged        آیا لیست عمومی صفحه‌بندی شود؟
   filters      فیلدهایی که با ?field=value فیلتر می‌شوند (مثل category)
   editable     (اختیاری) فقط این فیلدها قابل ویرایش‌اند
   createdBy    اگر true، ساخت سند فقط با فیلدهای طرح انجام می‌شود (پیش‌فرض)
*/
module.exports = (Model, opts) => {
  const o = Object.assign({ visible: {}, searchFields: ['title'], slugFrom: 'title', sort: { order: 1, createdAt: -1 }, paged: false, filters: [], limit: 12 }, opts);
  // برچسب رکورد در گزارش فعالیت. برای منابعی که نامشان اطلاعات شخصی افراد است (personal) فقط شناسه ثبت می‌شود، نه نام.
  const label = (doc) => (o.personal ? '' : doc.title || doc.name || '');
  const allowed = (body) => {
    const names = Object.keys(Model.schema.paths).filter((p) => !SYSTEM_FIELDS.includes(p) && !p.includes('.'));
    const pick = {};
    (o.editable || names).forEach((k) => { if (body[k] !== undefined && names.includes(k)) pick[k] = body[k]; });
    return pick;
  };
  const filterOf = (q, extra) => {
    const f = Object.assign({}, extra);
    o.filters.forEach((k) => { if (q[k] && q[k] !== 'all') f[k] = String(q[k]); });
    if (q.q) {
      const rx = new RegExp(escapeRegex(normalizeDigits(String(q.q)).slice(0, 80)), 'i');
      f.$or = o.searchFields.map((k) => ({ [k]: rx }));
    }
    return f;
  };
  const uniqueSlug = async (base, ignoreId) => {
    let slug = base || 'item-' + Date.now().toString(36); let n = 1;
    // اگر اسلاگ تکراری بود، پسوند عددی اضافه می‌کنیم
    while (await Model.exists({ slug, ...(ignoreId ? { _id: { $ne: ignoreId } } : {}) })) { n += 1; slug = base + '-' + n; }
    return slug;
  };

  return {
    publicList: asyncHandler(async (req, res) => {
      const filter = filterOf(req.query, o.visible);
      if (!o.paged) return ok(res, await Model.find(filter).sort(o.sort));
      const { limit, page, skip } = paginate(req.query, { limit: o.limit });
      const [items, total] = await Promise.all([Model.find(filter).sort(o.sort).skip(skip).limit(limit), Model.countDocuments(filter)]);
      return ok(res, items, metaOf(total, page, limit));
    }),
    publicGet: asyncHandler(async (req, res) => {
      const doc = await Model.findOne({ slug: String(req.params.slug), ...o.visible });
      if (!doc) throw new AppError(404, 'مورد درخواستی پیدا نشد.');
      return ok(res, doc);
    }),
    adminList: asyncHandler(async (req, res) => {
      const { limit, page, skip } = paginate(req.query, { limit: 20 });
      const filter = filterOf(req.query, {});
      const sort = o.adminSort || o.sort;
      const [items, total] = await Promise.all([Model.find(filter).sort(sort).skip(skip).limit(limit), Model.countDocuments(filter)]);
      return ok(res, items, metaOf(total, page, limit));
    }),
    adminGet: asyncHandler(async (req, res) => {
      const doc = await Model.findById(req.params.id);
      if (!doc) throw new AppError(404, 'مورد پیدا نشد.');
      return ok(res, doc);
    }),
    create: asyncHandler(async (req, res) => {
      const data = allowed(req.body || {});
      if (Model.schema.paths.slug) data.slug = await uniqueSlug(slugify(data.slug || data[o.slugFrom]));
      const doc = await Model.create(data);
      audit(req, 'create', o.name, doc._id, label(doc));
      return ok(res, doc, undefined, 201);
    }),
    update: asyncHandler(async (req, res) => {
      const doc = await Model.findById(req.params.id);
      if (!doc) throw new AppError(404, 'مورد پیدا نشد.');
      const data = allowed(req.body || {});
      if (data.slug && data.slug !== doc.slug) data.slug = await uniqueSlug(slugify(data.slug), doc._id);
      doc.set(data);
      await doc.save(); // save() اعتبارسنجی Mongoose را اجرا می‌کند
      audit(req, 'update', o.name, doc._id, label(doc));
      return ok(res, doc);
    }),
    remove: asyncHandler(async (req, res) => {
      const doc = await Model.findByIdAndDelete(req.params.id);
      if (!doc) throw new AppError(404, 'مورد پیدا نشد.');
      audit(req, 'delete', o.name, doc._id, label(doc));
      return ok(res, { deleted: req.params.id });
    }),
  };
};
