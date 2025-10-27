const db = require('./index');

exports.insertPhoto = (photo) => {
  const stmt = db.prepare(`
    INSERT INTO photos (id, url, thumbUrl, width, height, mime, createdAt)
    VALUES (@id, @url, @thumbUrl, @width, @height, @mime, @createdAt)
  `);
  stmt.run(photo);
};

exports.listPhotos = (limit = 20) => {
  return db.prepare(`SELECT * FROM photos ORDER BY createdAt DESC LIMIT ?`).all(limit);
};