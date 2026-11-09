const mongoose = require('mongoose');
const { appliquerToJSON } = require('./outils');

const confirmationSchema = new mongoose.Schema({
  utilisateur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  incident: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident', required: true },
  date: { type: Date, default: Date.now },
});
// RG5 : garanti par la base, pas seulement par un test dans le code.
confirmationSchema.index({ utilisateur: 1, incident: 1 }, { unique: true });
appliquerToJSON(confirmationSchema);

module.exports = mongoose.model('Confirmation', confirmationSchema);
