const mongoose = require('mongoose');

const scoreSchema = new mongoose.Schema({
  chatId: { type: Number, required: true },
  userId: { type: Number, required: true },
  name: { type: String, required: true },
  score: { type: Number, default: 0 },
});

scoreSchema.index({ chatId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model('Score', scoreSchema);
