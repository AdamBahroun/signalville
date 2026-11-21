const express = require('express');
const { authentifier, exigerRole } = require('../middleware/auth');
const User = require('../models/User');
const Incident = require('../models/Incident');
const Report = require('../models/Report');
const Confirmation = require('../models/Confirmation');
const Category = require('../models/Category');
const ErreurMetier = require('../services/ErreurMetier');
const { STATUTS, STATUTS_OUVERTS, LIBELLES, TRANSITIONS, motifObligatoire } = require('../services/statuts');
const { presenterIncident } = require('../services/presentation');
const { MS_PAR_JOUR } = require('../services/score');
const { changerStatut, rejeterSignalement, fusionnerIncidents } = require('../services/regroupement');
const {
  estIdObjet,
  validerFiltresIncidents,
  validerChangementStatut,
  validerRejet,
  validerCategorie,
  validerBlocage,
  validerFusion,
  validerFiltresUtilisateurs,
} = require('../validation');

const router = express.Router();

// Toutes les routes /admin exigent : un jeton valide ET le rôle "agent" (l'administrateur du site web).
router.use(authentifier, exigerRole('agent'));

// Échappe les caractères spéciaux d'un texte avant de l'utiliser dans une recherche par expression régulière.
const echapperRegex = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// Refuse (400) un identifiant qui n'est pas un ObjectId MongoDB valide.
const verifierId = (id) => {
  if (!estIdObjet(id)) throw new ErreurMetier(400, 'Identifiant invalide.');
};
// Réponse 400 uniforme pour une validation de données qui échoue.
const erreurValidation = (res, details) => res.status(400).json({ erreur: 'Données invalides.', details });

// GET /admin/ping : permet au site web de vérifier le droit d'accès (200 agent, 403 citoyen)
router.get('/ping', (req, res) => {
  res.json({ message: 'Accès administrateur autorisé.', agent: req.utilisateur });
});

// ---------------------------------------------------------------- Incidents

// GET /admin/incidents : liste triée par score décroissant (F10), filtres statut (ou "ouverts") et catégorie.
// Le score est calculé à chaque lecture avec le poids actuel de la catégorie, puis la liste est triée et paginée.
router.get('/incidents', async (req, res) => {
  const { details, valeurs } = validerFiltresIncidents(req.query);
  if (details) return erreurValidation(res, details);

  const filtre = {};
  if (valeurs.statut === 'ouverts') filtre.statut = { $in: STATUTS_OUVERTS };
  else if (valeurs.statut) filtre.statut = valeurs.statut;
  if (valeurs.categorie) filtre.categorie = valeurs.categorie;

  const [incidents, categories] = await Promise.all([Incident.find(filtre).select('-historique').lean(), Category.find().lean()]);
  const parNom = new Map(categories.map((c) => [c.nom, c]));
  const maintenant = new Date();
  const liste = incidents.map((i) => presenterIncident(i, parNom.get(i.categorie), maintenant));
  // Égalité de score : le plus ancien d'abord.
  liste.sort((a, b) => b.score - a.score || new Date(a.premierSignalement) - new Date(b.premierSignalement));

  const debut = (valeurs.page - 1) * valeurs.limite;
  res.json({ total: liste.length, page: valeurs.page, limite: valeurs.limite, incidents: liste.slice(debut, debut + valeurs.limite) });
});

// GET /admin/incidents/:id : détail (F11), signalements rattachés, historique des statuts.
router.get('/incidents/:id', async (req, res) => {
  verifierId(req.params.id);
  const incident = await Incident.findById(req.params.id).populate({ path: 'historique.agent', select: 'nom' }).lean();
  if (!incident) throw new ErreurMetier(404, 'Incident introuvable.');

  const [categorie, signalements, nbConfirmations] = await Promise.all([
    Category.findOne({ nom: incident.categorie }).lean(),
    Report.find({ incident: incident._id }).sort({ date: 1 }).populate({ path: 'utilisateur', select: 'nom email bloque' }).lean(),
    Confirmation.countDocuments({ incident: incident._id }),
  ]);

  res.json({
    incident: {
      ...presenterIncident(incident, categorie),
      historique: incident.historique.map((h) => ({
        statut: h.statut,
        libelleStatut: LIBELLES[h.statut],
        agent: h.agent ? { id: String(h.agent._id), nom: h.agent.nom } : null,
        date: h.date,
        motif: h.motif,
      })),
    },
    nbConfirmations,
    // Le site web n'a pas sa propre copie des règles RG7 : il affiche seulement ce que l'API autorise.
    transitionsPossibles: TRANSITIONS[incident.statut].map((vers) => ({ statut: vers, libelle: LIBELLES[vers], motifObligatoire: motifObligatoire(incident.statut, vers) })),
    signalements: signalements.map((s) => ({
      id: String(s._id),
      // L'identité n'est visible que de l'administrateur : jamais des autres citoyens (section 8 du cahier des charges).
      auteur: s.utilisateur ? { id: String(s.utilisateur._id), nom: s.utilisateur.nom, email: s.utilisateur.email, bloque: s.utilisateur.bloque } : null,
      description: s.description,
      photoUrl: s.photoUrl,
      date: s.date,
      position: { lat: s.position.coordinates[1], lng: s.position.coordinates[0] },
      rejete: s.rejete,
      motifRejet: s.motifRejet,
    })),
  });
});

// PATCH /admin/incidents/:id/status : changement de statut avec motif (F12, RG7, RG8).
router.patch('/incidents/:id/status', async (req, res) => {
  verifierId(req.params.id);
  const { details, valeurs } = validerChangementStatut(req.body);
  if (details) return erreurValidation(res, details);
  const incident = await changerStatut({ incidentId: req.params.id, vers: valeurs.statut, motif: valeurs.motif, agentId: req.utilisateur._id });
  const categorie = await Category.findOne({ nom: incident.categorie }).lean();
  res.json({ incident: presenterIncident(incident.toObject(), categorie) });
});

// POST /admin/incidents/:id/fusion : fusionne cet incident (source) dans un autre (cible) (F16).
router.post('/incidents/:id/fusion', async (req, res) => {
  verifierId(req.params.id);
  const { details, valeurs } = validerFusion(req.body);
  if (details) return erreurValidation(res, details);
  const cible = await fusionnerIncidents({ sourceId: req.params.id, cibleId: valeurs.cibleId, agentId: req.utilisateur._id });
  const categorie = await Category.findOne({ nom: cible.categorie }).lean();
  res.json({ incident: presenterIncident(cible.toObject(), categorie) });
});

// ---------------------------------------------------------------- Modération

// POST /admin/signalements/:id/rejet : rejette un signalement abusif, avec blocage facultatif de l'auteur (F14).
router.post('/signalements/:id/rejet', async (req, res) => {
  verifierId(req.params.id);
  const { details, valeurs } = validerRejet(req.body);
  if (details) return erreurValidation(res, details);
  const { incident, auteurBloque } = await rejeterSignalement({
    reportId: req.params.id,
    motif: valeurs.motif,
    agentId: req.utilisateur._id,
    bloquerAuteur: valeurs.bloquerAuteur,
  });
  const categorie = await Category.findOne({ nom: incident.categorie }).lean();
  res.json({ incident: presenterIncident(incident.toObject(), categorie), auteurBloque });
});

// GET /admin/utilisateurs : liste des comptes citoyens (filtre bloqué, recherche par nom ou email).
router.get('/utilisateurs', async (req, res) => {
  const { details, valeurs } = validerFiltresUtilisateurs(req.query);
  if (details) return erreurValidation(res, details);

  const filtre = { role: 'citoyen' };
  if (valeurs.bloque !== null) filtre.bloque = valeurs.bloque;
  if (valeurs.recherche) {
    const motif = new RegExp(echapperRegex(valeurs.recherche), 'i');
    filtre.$or = [{ nom: motif }, { email: motif }];
  }
  const [total, utilisateurs] = await Promise.all([
    User.countDocuments(filtre),
    User.find(filtre).sort({ dateCreation: -1 }).skip((valeurs.page - 1) * valeurs.limite).limit(valeurs.limite),
  ]);
  res.json({ total, page: valeurs.page, limite: valeurs.limite, utilisateurs });
});

// PATCH /admin/utilisateurs/:id/blocage : bloque ou débloque un citoyen (F14).
router.patch('/utilisateurs/:id/blocage', async (req, res) => {
  verifierId(req.params.id);
  const { details, valeurs } = validerBlocage(req.body);
  if (details) return erreurValidation(res, details);
  const utilisateur = await User.findById(req.params.id);
  if (!utilisateur) throw new ErreurMetier(404, 'Utilisateur introuvable.');
  if (utilisateur.role !== 'citoyen') throw new ErreurMetier(403, 'Seuls les comptes citoyens peuvent être bloqués.');
  utilisateur.bloque = valeurs.bloque;
  await utilisateur.save();
  res.json({ utilisateur });
});

// ---------------------------------------------------------------- Catégories (rayon et poids paramétrables, RG2 et RG4)

// GET /admin/categories : liste des catégories avec leur rayon et leur poids.
router.get('/categories', async (_req, res) => {
  res.json({ categories: await Category.find().sort({ nom: 1 }) });
});

// PATCH /admin/categories/:nom : modifie le rayon (RG2) ou le poids (RG4) d'une catégorie.
router.patch('/categories/:nom', async (req, res) => {
  const { details, valeurs } = validerCategorie(req.body);
  if (details) return erreurValidation(res, details);
  const nom = typeof req.params.nom === 'string' ? req.params.nom : '';
  const categorie = await Category.findOneAndUpdate({ nom }, { $set: valeurs }, { returnDocument: 'after', runValidators: true });
  if (!categorie) throw new ErreurMetier(404, 'Catégorie introuvable.');
  res.json({ categorie });
});

// ---------------------------------------------------------------- Carte de chaleur et statistiques

// GET /admin/heatmap : un point par incident ouvert, pondéré par son nombre de signalements (F13).
router.get('/heatmap', async (_req, res) => {
  const incidents = await Incident.find({ statut: { $in: STATUTS_OUVERTS }, nbSignalements: { $gt: 0 } }).select('positionCentrale nbSignalements').lean();
  res.json({
    points: incidents.map((i) => ({ lat: i.positionCentrale.coordinates[1], lng: i.positionCentrale.coordinates[0], poids: i.nbSignalements })),
  });
});

// GET /admin/stats : nombre par catégorie et par statut, délai moyen de résolution (F15).
router.get('/stats', async (_req, res) => {
  const [incidents, categories, nbSignalements] = await Promise.all([
    Incident.find().select('categorie statut premierSignalement historique').lean(),
    Category.find().sort({ nom: 1 }).lean(),
    Report.countDocuments({ rejete: false }),
  ]);

  const parStatut = Object.fromEntries(STATUTS.map((s) => [s, 0]));
  const parCategorie = new Map(categories.map((c) => [c.nom, { categorie: c.nom, libelle: c.libelle, total: 0, ouverts: 0, resolus: 0 }]));
  const delais = [];

  for (const i of incidents) {
    parStatut[i.statut] += 1;
    const ligne = parCategorie.get(i.categorie) || parCategorie.set(i.categorie, { categorie: i.categorie, libelle: i.categorie, total: 0, ouverts: 0, resolus: 0 }).get(i.categorie);
    ligne.total += 1;
    if (STATUTS_OUVERTS.includes(i.statut)) ligne.ouverts += 1;
    if (i.statut === 'resolu') {
      ligne.resolus += 1;
      // Dernière résolution (un incident peut avoir été rouvert puis résolu de nouveau).
      const derniere = [...i.historique].reverse().find((h) => h.statut === 'resolu');
      if (derniere) delais.push((new Date(derniere.date) - new Date(i.premierSignalement)) / MS_PAR_JOUR);
    }
  }

  res.json({
    totaux: { incidents: incidents.length, ouverts: parStatut.nouveau + parStatut.pris_en_charge, signalements: nbSignalements },
    parStatut,
    parCategorie: [...parCategorie.values()],
    nbResolus: delais.length,
    delaiMoyenResolutionJours: delais.length ? Math.round((delais.reduce((a, b) => a + b, 0) / delais.length) * 10) / 10 : null,
  });
});

module.exports = router;
