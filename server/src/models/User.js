const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const validator = require('validator');

const userSchema = new mongoose.Schema({
  email: {
    type: String, unique: true, required: true, lowercase: true, trim: true,
    validate: { validator: validator.isEmail, message: 'invalid email' }
  },
  passwordHash: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

userSchema.statics.register = async function(email, password) {
  const exists = await this.findOne({ email });
  if (exists) throw new Error('email already registered');
  const passwordHash = await bcrypt.hash(password, 10);
  return this.create({ email, passwordHash });
};

userSchema.methods.verifyPassword = function(password) {
  return bcrypt.compare(password, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
