const express = require('express');
const Report = require('../models/Report');
const Incident = require('../models/Incident');
const Category = require('../models/Category');
const { authentifier, exigerRole } = require('../middleware/auth');
const { LIBELLES } = require('../services/statuts');

const router = express.Router();

router.use(authentifier, exigerRole('citoyen'));

// GET /me/reports : mes signalements et l'état de l'incident auquel chacun est rattaché (F5, suivi côté mobile).
// Chaque signalement porte l'historique de son incident (statut, date, motif). Le nom de l'agent n'est volontairement pas renvoyé :
// le citoyen doit savoir ce qui s'est passé, pas qui l'a fait. Le score n'est jamais renvoyé non plus.
router.get('/reports', async (req, res) => {
  const signalements = await Report.find({ utilisateur: req.utilisateur._id }).sort({ date: -1 }).limit(100).lean();
  const [incidents, categories] = await Promise.all([
    Incident.find({ _id: { $in: [...new Set(signalements.map((s) => String(s.incident)))] } }).lean(),
    Category.find().lean(),
  ]);
  const incidentParId = new Map(incidents.map((i) => [String(i._id), i]));
  const libelles = new Map(categories.map((c) => [c.nom, c.libelle]));

  res.json({
    signalements: signalements.map((s) => {
      const i = incidentParId.get(String(s.incident));
      return {
        id: String(s._id),
        categorie: s.categorie,
        libelle: libelles.get(s.categorie) || s.categorie,
        description: s.description,
        photoUrl: s.photoUrl,
        date: s.date,
        position: { lat: s.position.coordinates[1], lng: s.position.coordinates[0] },
        rejete: s.rejete,
        motifRejet: s.rejete ? s.motifRejet : '',
        incident: i
          ? {
              id: String(i._id),
              statut: i.statut,
              libelleStatut: LIBELLES[i.statut],
              nbSignalements: i.nbSignalements,
              nbPersonnes: i.nbUtilisateurs,
              historique: i.historique.map((h) => ({ statut: h.statut, libelleStatut: LIBELLES[h.statut], date: h.date, motif: h.motif })),
            }
          : null,
      };
    }),
  });
});

module.exports = router;
