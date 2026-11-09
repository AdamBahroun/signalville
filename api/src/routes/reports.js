const express = require('express');
const config = require('../config');
const Report = require('../models/Report');
const { authentifier, exigerRole } = require('../middleware/auth');
const { validerSignalement, convertirChampsMultipart } = require('../validation');
const { distanceMetres } = require('../services/geo');
const { enregistrerSignalement } = require('../services/regroupement');
const { recevoirPhotoFacultative, verifierPhoto, enregistrerPhoto, supprimerPhoto } = require('../services/photos');

const router = express.Router();

// POST /reports : création d'un signalement avec regroupement automatique (figure 3 du dossier).
// Deux formats acceptés : JSON (sans photo) ou multipart/form-data (champs categorie, description, lat, lng et fichier "photo").
// L'ordre compte : authentification d'abord (on ne lit pas un fichier envoyé par un inconnu), puis les contrôles, puis l'écriture de la photo.
router.post('/', authentifier, exigerRole('citoyen'), recevoirPhotoFacultative, async (req, res) => {
  const multipart = req.is('multipart/form-data');
  const { details, valeurs } = validerSignalement(multipart ? convertirChampsMultipart(req.body) : req.body);
  if (details) return res.status(400).json({ erreur: 'Données invalides.', details });
  const photo = verifierPhoto(req.file); // 400 si ce n'est pas un vrai JPEG ou PNG ; rien n'est encore écrit sur le disque

  // RG9 : la position doit se situer dans la zone de la commune.
  const { lat, lng, rayonMetres } = config.commune;
  if (distanceMetres([valeurs.lng, valeurs.lat], [lng, lat]) > rayonMetres) {
    return res.status(400).json({ erreur: 'La position est en dehors de la zone de la commune.' });
  }

  // RG6 : 10 signalements par utilisateur sur 24 heures glissantes.
  const depuis = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const nb = await Report.countDocuments({ utilisateur: req.utilisateur._id, date: { $gte: depuis } });
  if (nb >= config.limiteSignalementsParJour) {
    return res.status(429).json({ erreur: `Limite de ${config.limiteSignalementsParJour} signalements par jour atteinte.` });
  }

  const photoUrl = photo ? await enregistrerPhoto(photo) : null;
  try {
    const { report, incident, nouvelIncident } = await enregistrerSignalement({
      utilisateurId: req.utilisateur._id,
      categorie: valeurs.categorie,
      description: valeurs.description,
      lat: valeurs.lat,
      lng: valeurs.lng,
      photoUrl,
    });
    res.status(201).json({ reportId: report.id, incidentId: incident.id, nouvelIncident, photoUrl });
  } catch (err) {
    await supprimerPhoto(photoUrl); // pas de fichier orphelin si l'enregistrement échoue (catégorie inconnue, erreur base)
    throw err;
  }
});

module.exports = router;
