const mongoose = require('mongoose');
const jsonPlugin = require('./plugins');
const num = { type: Number, min: [0, 'عدد نمی‌تواند منفی باشد'], default: null };
const schema = new mongoose.Schema({ patients: num, wounds: num, years: num }, { timestamps: true });
schema.statics.getSingleton = async function () { return (await this.findOne()) || this.create({}); };
schema.plugin(jsonPlugin);
module.exports = mongoose.model('Statistic', schema);
