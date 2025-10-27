const fs = require('fs');
const path = require('path');

const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

exports.saveBuffer = async (buffer, filename) => {
  const outPath = path.join(UPLOAD_DIR, filename);
  await fs.promises.writeFile(outPath, buffer);
  return outPath;
};

exports.getPublicUrl = (absPath) => {
  const fname = path.basename(absPath);   // 파일명만 
  return `${process.env.BASE_URL}/static/${fname}`;
};
