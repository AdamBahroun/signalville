const express = require('express');
const Category = require('../models/Category');
const { authentifier } = require('../middleware/auth');

const router = express.Router();

// GET /categories : liste des catégories pour le formulaire de signalement de l'application mobile (F2).
// Seuls le nom technique et le libellé sont exposés : le rayon et le poids restent réservés à l'administrateur.
router.get('/', authentifier, async (_req, res) => {
  const categories = await Category.find().sort({ nom: 1 }).lean();
  res.json({ categories: categories.map((c) => ({ nom: c.nom, libelle: c.libelle })) });
});

module.exports = router;
