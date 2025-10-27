const router = require('express').Router();
const User = require('../models/User');
const { signToken } = require('../middlewares/auth');

router.post('/auth/register', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email/password required' });
    const user = await User.register(email, password);
    const token = signToken(user);
    res.json({ token, user: { id: user._id, email: user.email } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) return res.status(400).json({ error: 'email/password required' });
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: 'invalid credentials' });
    const ok = await user.verifyPassword(password);
    if (!ok) return res.status(401).json({ error: 'invalid credentials' });
    const token = signToken(user);
    res.json({ token, user: { id: user._id, email: user.email } });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

module.exports = router;
