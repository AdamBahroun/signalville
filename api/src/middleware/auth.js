const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const config = require('../config');
const User = require('../models/User');

// 1) Authentification : qui es-tu ? Lit "Authorization: Bearer <jeton>" et vérifie la signature.
async function authentifier(req, res, next) {
  const [schema, jeton] = (req.headers.authorization || '').split(' ');
  if (schema !== 'Bearer' || !jeton) {
    return res.status(401).json({ erreur: 'Jeton manquant : en-tête Authorization: Bearer <jeton> attendu.' });
  }

  let charge;
  try {
    // On impose l'algorithme : on n'accepte pas un jeton signé autrement (ou non signé).
    charge = jwt.verify(jeton, config.jwtSecret, { algorithms: ['HS256'] });
  } catch {
    return res.status(401).json({ erreur: 'Jeton invalide ou expiré.' });
  }

  if (!mongoose.isValidObjectId(charge.sub)) return res.status(401).json({ erreur: 'Jeton invalide.' });

  // On relit l'utilisateur : un compte supprimé ou bloqué perd l'accès immédiatement,
  // et le rôle qui fait foi est celui de la base, pas celui écrit dans le jeton.
  const utilisateur = await User.findById(charge.sub);
  if (!utilisateur || utilisateur.bloque) return res.status(401).json({ erreur: 'Compte inexistant ou bloqué.' });

  req.utilisateur = utilisateur;
  next();
}

// 2) Autorisation : as-tu le droit ? À placer APRÈS authentifier.
function exigerRole(...rolesAutorises) {
  return (req, res, next) => {
    if (!rolesAutorises.includes(req.utilisateur.role)) {
      return res.status(403).json({ erreur: 'Accès refusé : droits insuffisants.' });
    }
    next();
  };
}

module.exports = { authentifier, exigerRole };
