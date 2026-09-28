const mongoose = require('mongoose');

const wordSchema = new mongoose.Schema({
  text: { type: String, required: true, unique: true, trim: true },
  addedBy: { type: Number }, // Telegram user ID
  addedByName: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Word', wordSchema);
