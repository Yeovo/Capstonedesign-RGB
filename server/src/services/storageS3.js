const AWS = require('aws-sdk');
const path = require('path');

const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  },
});

/**
 * @param {Buffer} buffer - 파일 데이터
 * @param {string} filename - 저장할 파일명
 * @returns {Promise<string>} key - 업로드된 객체 키
 */
async function saveBuffer(buffer, filename) {
  const params = {
    Bucket: process.env.S3_BUCKET,
    Key: filename,
    Body: buffer,
    ContentType: guessMime(filename),
  };

  await s3.putObject(params).promise();
  console.log(`[S3] uploaded ${filename}`);
  return filename;
}


function getPublicUrl(key) {
  return `https://${process.env.S3_BUCKET}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
}


function guessMime(filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

module.exports = { saveBuffer, getPublicUrl };