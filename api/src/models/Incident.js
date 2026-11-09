const mongoose = require('mongoose');
const { appliquerToJSON } = require('./outils');
const { STATUTS } = require('../services/statuts');

const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point', required: true },
    coordinates: { type: [Number], required: true }, // [longitude, latitude]
  },
  { _id: false }
);

const changementSchema = new mongoose.Schema(
  {
    statut: { type: String, enum: STATUTS, required: true },
    agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = action du système
    date: { type: Date, default: Date.now },
    motif: { type: String, default: '', maxlength: 500 },
  },
  { _id: false }
);

const incidentSchema = new mongoose.Schema({
  categorie: { type: String, required: true, index: true },
  positionCentrale: { type: pointSchema, required: true },
  nbSignalements: { type: Number, default: 0 },
  nbUtilisateurs: { type: Number, default: 0 },
  statut: { type: String, enum: STATUTS, default: 'nouveau' },
  premierSignalement: { type: Date, required: true },
  dateCreation: { type: Date, default: Date.now },
  dateMiseAJour: { type: Date, default: Date.now },
  historique: { type: [changementSchema], default: [] }, // RG8
});

// Index géospatial : indispensable pour la requête $near du regroupement (RG2).
incidentSchema.index({ positionCentrale: '2dsphere' });
incidentSchema.index({ statut: 1, categorie: 1 });
appliquerToJSON(incidentSchema);

module.exports = mongoose.model('Incident', incidentSchema);
