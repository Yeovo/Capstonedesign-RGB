const Database = require('better-sqlite3');
const db = new Database('app.db');

db.exec(`
CREATE TABLE IF NOT EXISTS photos (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  thumbUrl TEXT,
  width INTEGER,
  height INTEGER,
  mime TEXT,
  createdAt TEXT
);
`);

module.exports = db;