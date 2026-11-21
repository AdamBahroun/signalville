const mongoose = require('mongoose');
const { appliquerToJSON } = require('./outils');
const { STATUTS } = require('../services/statuts');

// Point GeoJSON [longitude, latitude], requis pour l'index géospatial 2dsphere.
const pointSchema = new mongoose.Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point', required: true },
    coordinates: { type: [Number], required: true }, // [longitude, latitude]
  },
  { _id: false }
);

// Une ligne de l'historique : statut, agent, date et motif (RG8).
const changementSchema = new mongoose.Schema(
  {
    statut: { type: String, enum: STATUTS, required: true },
    agent: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }, // null = action du système
    date: { type: Date, default: Date.now },
    motif: { type: String, default: '', maxlength: 500 },
  },
  { _id: false }
);

// Incident : regroupe les signalements proches de même catégorie (RG1, RG2).
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
// Accélère la recherche d'incidents ouverts d'une catégorie (RG2, RG3).
incidentSchema.index({ statut: 1, categorie: 1 });
appliquerToJSON(incidentSchema);

module.exports = mongoose.model('Incident', incidentSchema);
