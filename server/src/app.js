require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { connectMongo } = require('./db/mongo');

const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');      // ⬅ 추가
const uploadRouter = require('./routes/upload');
const colorsRouter = require('./routes/colors');  // ⬅ 추가

const app = express();
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

// 정적 파일
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
app.use('/static', express.static(UPLOAD_DIR));

// 라우트
app.use('/health', healthRouter);
app.use('/api', authRouter);     
app.use('/api', uploadRouter);
app.use('/api', colorsRouter);  

// 404
app.use((req, res) => res.status(404).json({ error: 'not found' }));

// 에러 핸들러
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'server error' });
});

// 서버 시작 + Mongo 연결
const port = process.env.PORT || 5000;
connectMongo()
  .then(() => {
    app.listen(port, () => console.log(`API running on http://localhost:${port}`));
  })
  .catch(err => {
    console.error('[mongo] connection failed', err);
    process.exit(1);
  });