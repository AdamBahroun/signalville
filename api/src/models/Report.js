const mongoose = require('mongoose');
const { appliquerToJSON } = require('./outils');

const reportSchema = new mongoose.Schema({
  utilisateur: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  incident: { type: mongoose.Schema.Types.ObjectId, ref: 'Incident', required: true, index: true }, // RG1 : un seul incident
  categorie: { type: String, required: true },
  description: { type: String, required: true, trim: true, maxlength: 500 },
  photoUrl: { type: String, default: null, maxlength: 300 },
  position: {
    type: { type: String, enum: ['Point'], default: 'Point', required: true },
    coordinates: { type: [Number], required: true }, // [longitude, latitude]
  },
  date: { type: Date, default: Date.now },
  // Modération : un signalement rejeté reste en base (traçabilité) mais ne compte plus nulle part.
  rejete: { type: Boolean, default: false },
  motifRejet: { type: String, default: '', maxlength: 500 },
  rejetePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  dateRejet: { type: Date, default: null },
});
reportSchema.index({ utilisateur: 1, date: -1 }); // limite quotidienne (RG6)
appliquerToJSON(reportSchema);

module.exports = mongoose.model('Report', reportSchema);
