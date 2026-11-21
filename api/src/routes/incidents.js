const express = require('express');
const Incident = require('../models/Incident');
const Category = require('../models/Category');
const Report = require('../models/Report');
const Confirmation = require('../models/Confirmation');
const { authentifier, exigerRole } = require('../middleware/auth');
const { validerProximite, validerConfirmation, estIdObjet } = require('../validation');
const ErreurMetier = require('../services/ErreurMetier');
const { STATUTS_OUVERTS, LIBELLES } = require('../services/statuts');
const { distanceMetres } = require('../services/geo');
const { confirmerIncident } = require('../services/regroupement');

const router = express.Router();

// GET /incidents : incidents ouverts proches d'une position, pour la carte de l'application mobile (F3).
// Version citoyen : ni score, ni historique, ni identité d'auteur. Triés du plus proche au plus éloigné.
// Pour chaque incident, deux indicateurs propres à l'utilisateur connecté : a-t-il signalé cet incident (monSignalement) ou l'a-t-il confirmé (dejaConfirme).
// L'application s'en sert pour désactiver le bouton « moi aussi ».
router.get('/', authentifier, exigerRole('citoyen'), async (req, res) => {
  const { details, valeurs } = validerProximite(req.query);
  if (details) return res.status(400).json({ erreur: 'Données invalides.', details });

  const filtre = {
    statut: { $in: STATUTS_OUVERTS },
    positionCentrale: { $near: { $geometry: { type: 'Point', coordinates: [valeurs.lng, valeurs.lat] }, $maxDistance: valeurs.rayon } },
  };
  if (valeurs.categorie) filtre.categorie = valeurs.categorie;

  const [incidents, categories] = await Promise.all([Incident.find(filtre).select('-historique').limit(100).lean(), Category.find().lean()]);
  const ids = incidents.map((i) => i._id);
  const [mesSignalements, mesConfirmations] = await Promise.all([
    Report.distinct('incident', { utilisateur: req.utilisateur._id, rejete: false, incident: { $in: ids } }),
    Confirmation.distinct('incident', { utilisateur: req.utilisateur._id, incident: { $in: ids } }),
  ]);
  const aSignale = new Set(mesSignalements.map(String));
  const aConfirme = new Set(mesConfirmations.map(String));
  const libelles = new Map(categories.map((c) => [c.nom, c.libelle]));
  res.json({
    incidents: incidents.map((i) => {
      const [lng, lat] = i.positionCentrale.coordinates;
      return {
        id: String(i._id),
        categorie: i.categorie,
        libelle: libelles.get(i.categorie) || i.categorie,
        position: { lat, lng },
        distanceMetres: Math.round(distanceMetres([valeurs.lng, valeurs.lat], [lng, lat])),
        nbSignalements: i.nbSignalements,
        nbPersonnes: i.nbUtilisateurs, // signalements et confirmations, par personne distincte (pas le score)
        statut: i.statut,
        libelleStatut: LIBELLES[i.statut],
        premierSignalement: i.premierSignalement,
        monSignalement: aSignale.has(String(i._id)),
        dejaConfirme: aConfirme.has(String(i._id)),
      };
    }),
  });
});

// POST /incidents/:id/confirm : « moi aussi » (F4, RG5, RG10). Corps { lat, lng } obligatoire. 201 si la confirmation est enregistrée.
router.post('/:id/confirm', authentifier, exigerRole('citoyen'), async (req, res) => {
  if (!estIdObjet(req.params.id)) throw new ErreurMetier(400, 'Identifiant invalide.');
  const { details, valeurs } = validerConfirmation(req.body);
  if (details) return res.status(400).json({ erreur: details.position, details });
  const incident = await confirmerIncident({ incidentId: req.params.id, utilisateurId: req.utilisateur._id, lat: valeurs.lat, lng: valeurs.lng });
  res.status(201).json({ incidentId: String(incident._id), nbSignalements: incident.nbSignalements, nbPersonnes: incident.nbUtilisateurs, dejaConfirme: true });
});

module.exports = router;
