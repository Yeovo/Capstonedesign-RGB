const mongoose = require('mongoose');

async function connectMongo() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI not set');
  mongoose.set('strictQuery', true);
  await mongoose.connect(uri, { dbName: 'colors' });
  console.log('[mongo] connected');
}

module.exports = { connectMongo };