const mongoose = require('mongoose');

async function connectDB() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI .env faylida topilmadi!');
  }
  await mongoose.connect(uri);
  console.log('✅ MongoDB Atlas\'ga ulanildi');
}

module.exports = { connectDB };
