// server/src/routes/upload.js
const router = require('express').Router();
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const { v4: uuid } = require('uuid');

// ⬇ Mongo 모델 & 인증
const Photo = require('../models/Photo');
const { authRequired } = require('../middlewares/auth');

// ⬇ 임시 저장 디렉토리
const TMP_DIR = process.env.TMP_DIR || 'tmp';
if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true });

// ⬇ 업로드 허용 MIME
const ALLOWED = /image\/(png|jpe?g|webp)/i;

// ⬇ 원본 파일 확장자 유지해서 임시 파일 생성
const storageTmp = multer.diskStorage({
  destination: TMP_DIR,
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, `${uuid()}${ext}`);
  }
});

const upload = multer({
  storage: storageTmp,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED.test(file.mimetype)) {
      return cb(new Error('Only PNG/JPG/WEBP allowed'));
    }
    cb(null, true);
  }
});

// ⬇ 최종 저장 드라이버(로컬 또는 S3). .env에 S3가 설정되면 S3로 전환
const storage = process.env.S3_BUCKET
  ? require('../services/storageS3')
  : require('../services/storageLocal');

// ⬇ 간단한 MIME 추정
function guessMimeByExt(ext) {
  ext = (ext || '').toLowerCase();
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

/**
 * 최근 업로드 이력 (로그인 사용자의 것만)
 * GET /api/history
 */
router.get('/history', authRequired, async (req, res, next) => {
  try {
    const list = await Photo.find({ userId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    res.json(list);
  } catch (e) {
    next(e);
  }
});

/**
 * 1) 임시 업로드 (multipart/form-data, key="file")
 * ✔ 인증 없이도 가능하게 유지 (원하면 authRequired 붙이면 됨)
 * 응답: { tempKey, mime, size, originalName }
 */
router.post('/upload', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });

    res.json({
      tempKey: req.file.filename,      // ex) 2b4d...-8f2f.png
      mime: req.file.mimetype,         // image/png 등
      size: req.file.size,
      originalName: req.file.originalname
    });
  } catch (e) {
    next(e);
  }
});

/**
 * 2) 커밋(영구 저장)
 * ✔ 로그인 필수: 업로드 결과를 사용자 소유로 저장
 * 요청: { tempKey }
 * 응답: { photoId, url }
 */
router.post('/upload/commit', authRequired, async (req, res, next) => {
  try {
    const { tempKey } = req.body || {};
    if (!tempKey) return res.status(400).json({ error: 'tempKey required' });

    const tempPath = path.join(TMP_DIR, tempKey);
    if (!fs.existsSync(tempPath)) {
      return res.status(404).json({ error: 'temp file not found' });
    }

    const ext = path.extname(tempKey) || '.bin';
    const photoId = uuid();                  // 외부 노출용 uuid (Mongo의 _id와 별개)
    const finalName = `${photoId}${ext}`;

    const buffer = await fs.promises.readFile(tempPath);
    const finalAbsPath = await storage.saveBuffer(buffer, finalName); // 로컬이면 uploads/에 저장
    const publicUrl = storage.getPublicUrl(finalAbsPath);             // 반드시 /static/<filename> 형태

    const mime = guessMimeByExt(ext);

    // ⬇ MongoDB에 저장
    const doc = await Photo.create({
      userId: req.user.id,   // JWT에서 주입
      url: publicUrl,
      thumbUrl: null,
      width: null,
      height: null,
      mime
    });

    // 임시 파일 제거 (실패해도 무시)
    fs.promises.unlink(tempPath).catch(() => {});

    res.json({ photoId: doc._id, url: doc.url });
  } catch (e) {
    next(e);
  }
});

module.exports = router;