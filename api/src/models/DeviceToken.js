const mongoose = require('mongoose');

// Jeton d'appareil Firebase d'un citoyen (S4.1). Stockage minimal : qui, quel jeton, depuis quand.
const deviceTokenSchema = new mongoose.Schema({
  utilisateur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true }, // propriétaire actuel du jeton
  jeton: { type: String, required: true, unique: true, maxlength: 4096 }, // un jeton = un appareil, jamais de doublon
  date: { type: Date, default: Date.now }, // dernier enregistrement (sert à garder les appareils les plus récents)
});

module.exports = mongoose.model('DeviceToken', deviceTokenSchema);
