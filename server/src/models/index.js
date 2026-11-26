/* index.js — فهرست همه‌ی مدل‌ها */
module.exports = {
  User: require('./User'), SiteSetting: require('./SiteSetting'), Statistic: require('./Statistic'),
  Service: require('./Service'), WoundCategory: require('./WoundCategory'), Branch: require('./Branch'),
  TeamMember: require('./TeamMember'), GalleryCase: require('./GalleryCase'), Testimonial: require('./Testimonial'),
  ArticleCategory: require('./ArticleCategory'), Article: require('./Article'), JournalArticle: require('./JournalArticle'),
  Appointment: require('./Appointment'), ContactMessage: require('./ContactMessage'),
  Patient: require('./Patient'), SlotCounter: require('./SlotCounter'), AuditLog: require('./AuditLog'),
  RevokedToken: require('./RevokedToken'), PhoneOtp: require('./PhoneOtp'),
};
