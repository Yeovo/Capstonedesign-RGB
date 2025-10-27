const router = require('express').Router();
router.get('/', (req, res) => {
  res.json({ ok: true, uptime: process.uptime() });
});
module.exports = router;