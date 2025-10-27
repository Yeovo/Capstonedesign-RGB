const mongoose = require('mongoose');

const profileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', unique: true },
  type: { type: String, enum: ['protan','deutan','tritan','normal'], default: 'normal' },
  severity: { type: Number, min: 0, max: 1, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Profile', profileSchema);