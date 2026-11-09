const mongoose = require('mongoose');
const { appliquerToJSON } = require('./outils');

// Une catégorie porte le rayon de regroupement (RG2) et le poids du score (RG4).
// Ces deux valeurs sont modifiables par l'administrateur, sans toucher au code.
const categorySchema = new mongoose.Schema({
  nom: { type: String, required: true, unique: true, trim: true, maxlength: 40 }, // clé technique, ex : nid_de_poule
  libelle: { type: String, required: true, trim: true, maxlength: 60 },
  rayonMetres: { type: Number, required: true, min: 1, max: 5000 },
  poids: { type: Number, required: true, min: 0, max: 20 },
});
appliquerToJSON(categorySchema);

// Valeurs initiales du cahier des charges (RG2 et RG4). Le rayon de "autre" n'est pas fixé par le cahier : 50 m par défaut.
const CATEGORIES_PAR_DEFAUT = [
  { nom: 'coupure_eau', libelle: "Coupure d'eau", rayonMetres: 500, poids: 5 },
  { nom: 'coupure_electricite', libelle: "Coupure d'électricité", rayonMetres: 500, poids: 5 },
  { nom: 'nid_de_poule', libelle: 'Nid-de-poule', rayonMetres: 30, poids: 3 },
  { nom: 'eclairage', libelle: 'Éclairage', rayonMetres: 30, poids: 2 },
  { nom: 'dechets', libelle: 'Déchets', rayonMetres: 50, poids: 2 },
  { nom: 'autre', libelle: 'Autre', rayonMetres: 50, poids: 1 },
];

const Category = mongoose.model('Category', categorySchema);

// Crée les catégories manquantes, sans écraser celles que l'administrateur a déjà modifiées.
async function assurerCategories() {
  for (const c of CATEGORIES_PAR_DEFAUT) {
    await Category.updateOne({ nom: c.nom }, { $setOnInsert: c }, { upsert: true });
  }
}

module.exports = Category;
module.exports.assurerCategories = assurerCategories;
module.exports.CATEGORIES_PAR_DEFAUT = CATEGORIES_PAR_DEFAUT;
