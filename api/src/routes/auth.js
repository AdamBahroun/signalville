const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const User = require('../models/User');
const { validerInscription, validerConnexion } = require('../validation');

const router = express.Router();

// Hachage factice : comparé quand l'email n'existe pas, pour que la durée de réponse
// ne révèle pas si un compte existe (sinon "email inconnu" répondrait plus vite que "mot de passe faux").
const HACHAGE_FACTICE = bcrypt.hashSync('mot-de-passe-factice', config.bcryptRounds);

// POST /auth/register : inscription d'un citoyen (S1.2)
router.post('/register', async (req, res) => {
  const { details, valeurs } = validerInscription(req.body);
  if (details) return res.status(400).json({ erreur: 'Données invalides.', details });

  const motDePasseHache = await bcrypt.hash(valeurs.motDePasse, config.bcryptRounds);
  try {
    // Le rôle n'est JAMAIS lu depuis la requête : un client ne peut pas se déclarer agent.
    const utilisateur = await User.create({ nom: valeurs.nom, email: valeurs.email, motDePasseHache, role: 'citoyen' });
    return res.status(201).json({ utilisateur });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ erreur: 'Cette adresse email est déjà utilisée.' });
    throw err;
  }
});

// POST /auth/login : renvoie un jeton JWT (S1.2)
router.post('/login', async (req, res) => {
  const { details, valeurs } = validerConnexion(req.body);
  if (details) return res.status(400).json({ erreur: 'Données invalides.', details });

  const utilisateur = await User.findOne({ email: valeurs.email }).select('+motDePasseHache');
  const motDePasseValide = await bcrypt.compare(valeurs.motDePasse, utilisateur ? utilisateur.motDePasseHache : HACHAGE_FACTICE);

  // Même message pour : email inconnu, mot de passe faux, compte bloqué (diagramme de séquence, figure 4).
  if (!utilisateur || !motDePasseValide || utilisateur.bloque) {
    return res.status(401).json({ erreur: 'Identifiants invalides.' });
  }

  const jeton = jwt.sign({ role: utilisateur.role }, config.jwtSecret, {
    subject: utilisateur.id,
    expiresIn: config.jwtExpiresIn,
    algorithm: 'HS256',
  });
  return res.status(200).json({ jeton, role: utilisateur.role, utilisateur });
});

module.exports = router;
