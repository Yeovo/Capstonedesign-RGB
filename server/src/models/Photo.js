const mongoose = require('mongoose');
const photoSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
  url: { type: String, required: true },
  thumbUrl: String,
  width: Number,
  height: Number,
  mime: String,
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model('Photo', photoSchema);
