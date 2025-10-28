require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const { connectMongo } = require('./db/mongo');

const healthRouter = require('./routes/health');
const authRouter = require('./routes/auth');
const uploadRouter = require('./routes/upload');
const colorsRouter = require('./routes/colors');

const app = express();
app.use(cors());
app.use(helmet());
app.use(morgan('dev'));
app.use(express.json());

// 정적 파일
const UPLOAD_DIR = process.env.UPLOAD_DIR || '/app/uploads';
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
const port = process.env.PORT || 3000; // Docker Compose와 맞춤
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/mydb'; // Docker에서 환경변수로 주입 가능

connectMongo(mongoUri)
  .then(() => {
    app.listen(port, '0.0.0.0', () => {
      console.log(`API running on http://0.0.0.0:${port}`);
    });
  })
  .catch(err => {
    console.error('[mongo] connection failed', err);
    process.exit(1);
  });
