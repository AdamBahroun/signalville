// Route inconnue : réponse JSON (et non la page HTML par défaut d'Express).
function introuvable(_req, res) {
  res.status(404).json({ erreur: 'Route introuvable.' });
}

// Gestionnaire d'erreurs central : aucune trace technique n'est renvoyée au client.
// Express 5 transmet ici les erreurs des fonctions async sans try/catch supplémentaire.
function gestionErreurs(err, _req, res, _next) {
  // Erreur prévue par les règles de gestion (transition interdite, incident introuvable, etc.).
  if (typeof err.statut === 'number' && err.statut >= 400 && err.statut < 500) return res.status(err.statut).json({ erreur: err.message });
  if (err.type === 'entity.parse.failed') return res.status(400).json({ erreur: 'Corps de requête JSON invalide.' });
  if (err.type === 'entity.too.large') return res.status(413).json({ erreur: 'Corps de requête trop volumineux.' });
  console.error(err);
  res.status(500).json({ erreur: 'Erreur interne du serveur.' });
}

module.exports = { introuvable, gestionErreurs };
