const Score = require('../models/Score');

async function addScore(chatId, userId, name, delta) {
  return Score.findOneAndUpdate(
    { chatId, userId },
    { $inc: { score: delta }, $set: { name } },
    { upsert: true, new: true }
  );
}

async function getScore(chatId, userId) {
  const doc = await Score.findOne({ chatId, userId });
  return doc ? doc.score : 0;
}

async function topScores(chatId, limit = 10) {
  return Score.find({ chatId }).sort({ score: -1 }).limit(limit);
}

module.exports = { addScore, getScore, topScores };
