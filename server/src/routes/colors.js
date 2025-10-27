const router = require('express').Router();
const Vibrant = require('node-vibrant'); 
const path = require('path');
const fs = require('fs');
const Photo = require('../models/Photo');      //Mongo Photo 
const { authRequired } = require('../middlewares/auth');

function localPathFromUrl(fileUrl) {
  try {
    const u = new URL(fileUrl);
    const fname = path.basename(u.pathname);
    const uploadDir = process.env.UPLOAD_DIR || 'uploads';
    return path.join(uploadDir, fname);
  } catch {
    return null;
  }
}

router.post('/colors', authRequired, async (req, res) => {
  try {
    const { photoId, url, k = 6 } = req.body || {};
    let targetUrl = url;

    if (!targetUrl && photoId) {
      const p = await Photo.findOne({ _id: photoId, userId: req.user.id }).lean();
      if (!p) return res.status(404).json({ error: 'photo not found' });
      targetUrl = p.url;
    }
    if (!targetUrl) return res.status(400).json({ error: 'photoId or url required' });

    const localPath = localPathFromUrl(targetUrl);
    const palette = localPath && fs.existsSync(localPath)
      ? await Vibrant.from(localPath).maxColorCount(k).getPalette()
      : await Vibrant.from(targetUrl).maxColorCount(k).getPalette();

    const items = Object.values(palette)
      .filter(Boolean)
      .map(s => {
        const [r,g,b] = s.getRgb().map(Math.round);
        return {
          hex: s.getHex(),
          rgb: [r,g,b],
          population: s.getPopulation() || 1
        };
      });

    const total = items.reduce((a,b)=>a+b.population, 0) || 1;
    const withRatio = items
      .map(it => ({ ...it, ratio: +(it.population/total).toFixed(4) }))
      .sort((a,b)=>b.ratio - a.ratio)
      .slice(0, k);

    res.json(withRatio);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
