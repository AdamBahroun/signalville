// Cœur du projet : regroupement des signalements en incidents (RG1, RG2, RG3), statuts (RG7, RG8) et modération.
const Category = require('../models/Category');
const Incident = require('../models/Incident');
const Report = require('../models/Report');
const Confirmation = require('../models/Confirmation');
const User = require('../models/User');
const ErreurMetier = require('./ErreurMetier');
const { STATUTS_OUVERTS, LIBELLES, transitionAutorisee, motifObligatoire } = require('./statuts');
const { centre } = require('./geo');

// Recalcule les compteurs, la position centrale et la date du premier signalement à partir des signalements non rejetés.
// Les confirmations « moi aussi » comptent comme des utilisateurs distincts (RG4).
async function recalculerIncident(incidentId) {
  const [signalements, confirmations] = await Promise.all([
    Report.find({ incident: incidentId, rejete: false }).select('utilisateur position date').lean(),
    Confirmation.find({ incident: incidentId }).select('utilisateur').lean(),
  ]);
  const utilisateurs = new Set([...signalements.map((s) => String(s.utilisateur)), ...confirmations.map((c) => String(c.utilisateur))]);
  const maj = { nbSignalements: signalements.length, nbUtilisateurs: utilisateurs.size, dateMiseAJour: new Date() };
  if (signalements.length > 0) {
    maj.positionCentrale = { type: 'Point', coordinates: centre(signalements.map((s) => s.position.coordinates)) };
    maj.premierSignalement = new Date(Math.min(...signalements.map((s) => s.date.getTime())));
  }
  return Incident.findByIdAndUpdate(incidentId, { $set: maj }, { returnDocument: 'after' });
}

// Figure 3 du dossier : rattache le signalement à l'incident ouvert de même catégorie le plus proche dans le rayon, sinon crée un incident.
async function enregistrerSignalement({ utilisateurId, categorie, description, lng, lat, photoUrl = null, date = new Date() }) {
  const cat = await Category.findOne({ nom: categorie }).lean();
  if (!cat) throw new ErreurMetier(400, 'Catégorie inconnue.');

  const point = { type: 'Point', coordinates: [lng, lat] };
  // $near trie par distance croissante : le premier résultat est l'incident le plus proche (RG2). Il exige l'index 2dsphere.
  const [proche] = await Incident.find({
    categorie,
    statut: { $in: STATUTS_OUVERTS }, // RG3 : un incident résolu ou rejeté n'absorbe plus rien
    positionCentrale: { $near: { $geometry: point, $maxDistance: cat.rayonMetres } },
  }).limit(1);

  let incident = proche;
  let nouvelIncident = false;
  if (!incident) {
    incident = await Incident.create({
      categorie,
      positionCentrale: point,
      statut: 'nouveau',
      premierSignalement: date,
      dateCreation: date,
      dateMiseAJour: date,
      historique: [{ statut: 'nouveau', agent: null, date, motif: 'Premier signalement' }],
    });
    nouvelIncident = true;
  }

  let report;
  try {
    report = await Report.create({ utilisateur: utilisateurId, incident: incident._id, categorie, description, photoUrl, position: point, date });
  } catch (err) {
    // On ne laisse pas un incident vide derrière nous si l'enregistrement du signalement échoue.
    if (nouvelIncident) await Incident.deleteOne({ _id: incident._id });
    throw err;
  }
  incident = await recalculerIncident(incident._id);
  return { report, incident, nouvelIncident };
}

// F4 : confirmation « moi aussi ». RG5 : une seule confirmation par utilisateur et par incident (garantie par l'index unique de la base).
// Une confirmation compte comme un utilisateur distinct dans le score (RG4). Elle n'ajoute pas de signalement.
async function confirmerIncident({ incidentId, utilisateurId }) {
  const incident = await Incident.findById(incidentId).select('statut');
  if (!incident) throw new ErreurMetier(404, 'Incident introuvable.');
  // RG3 : un incident résolu ou rejeté est clos.
  if (!STATUTS_OUVERTS.includes(incident.statut)) throw new ErreurMetier(409, "Cet incident n'est plus ouvert.");
  // L'auteur d'un signalement valide est déjà compté dans le score : sa confirmation n'apporterait rien et fausserait l'impression de « plusieurs témoins ».
  if (await Report.exists({ incident: incident._id, utilisateur: utilisateurId, rejete: false })) {
    throw new ErreurMetier(409, 'Tu as déjà signalé cet incident : ton signalement est déjà pris en compte.');
  }
  try {
    await Confirmation.create({ utilisateur: utilisateurId, incident: incident._id });
  } catch (err) {
    if (err.code === 11000) throw new ErreurMetier(409, 'Tu as déjà confirmé cet incident.'); // RG5
    throw err;
  }
  return recalculerIncident(incident._id);
}

// RG7 et RG8 : transition contrôlée, motif si exigé, historique. La mise à jour est conditionnelle (le statut doit être celui qu'on a lu),
// ce qui évite que deux administrateurs écrasent mutuellement leur changement.
async function changerStatut({ incidentId, vers, motif = '', agentId, date = new Date() }) {
  const incident = await Incident.findById(incidentId).select('statut');
  if (!incident) throw new ErreurMetier(404, 'Incident introuvable.');
  const de = incident.statut;
  if (!transitionAutorisee(de, vers)) throw new ErreurMetier(400, `Transition interdite : ${LIBELLES[de]} vers ${LIBELLES[vers]}.`);
  if (motifObligatoire(de, vers) && !motif) throw new ErreurMetier(400, 'Un motif est obligatoire pour ce changement de statut.');

  const maj = await Incident.findOneAndUpdate(
    { _id: incidentId, statut: de },
    { $set: { statut: vers, dateMiseAJour: date }, $push: { historique: { statut: vers, agent: agentId, date, motif } } },
    { returnDocument: 'after' }
  );
  if (!maj) throw new ErreurMetier(409, "L'incident a été modifié entre-temps, recharge la page.");
  return maj;
}

// F14 : rejet d'un signalement abusif, avec blocage facultatif de son auteur.
async function rejeterSignalement({ reportId, motif, agentId, bloquerAuteur = false }) {
  const report = await Report.findById(reportId);
  if (!report) throw new ErreurMetier(404, 'Signalement introuvable.');
  if (report.rejete) throw new ErreurMetier(409, 'Ce signalement est déjà rejeté.');

  report.rejete = true;
  report.motifRejet = motif;
  report.rejetePar = agentId;
  report.dateRejet = new Date();
  await report.save();

  let auteurBloque = false;
  if (bloquerAuteur) {
    // Seuls les comptes citoyens peuvent être bloqués : un administrateur ne peut pas se verrouiller (ni verrouiller un collègue) par erreur.
    const r = await User.updateOne({ _id: report.utilisateur, role: 'citoyen' }, { $set: { bloque: true } });
    auteurBloque = r.modifiedCount > 0;
  }

  let incident = await recalculerIncident(report.incident);
  // Si plus aucun signalement valide ne reste, l'incident n'a plus de raison d'être ouvert.
  if (incident && incident.nbSignalements === 0 && STATUTS_OUVERTS.includes(incident.statut)) {
    incident = await changerStatut({ incidentId: incident._id, vers: 'rejete', motif: 'Tous les signalements ont été rejetés (modération).', agentId });
  }
  return { report, incident, auteurBloque };
}

// F16 : fusion manuelle. Indispensable car le regroupement automatique n'est pas atomique :
// deux signalements simultanés au même endroit peuvent créer deux incidents.
async function fusionnerIncidents({ sourceId, cibleId, agentId }) {
  if (String(sourceId) === String(cibleId)) throw new ErreurMetier(400, 'Impossible de fusionner un incident avec lui-même.');
  const [source, cible] = await Promise.all([Incident.findById(sourceId), Incident.findById(cibleId)]);
  if (!source || !cible) throw new ErreurMetier(404, 'Incident introuvable.');
  if (source.categorie !== cible.categorie) throw new ErreurMetier(400, 'Seuls des incidents de même catégorie peuvent être fusionnés.');
  if (!STATUTS_OUVERTS.includes(source.statut) || !STATUTS_OUVERTS.includes(cible.statut)) {
    throw new ErreurMetier(400, 'Seuls des incidents ouverts peuvent être fusionnés.');
  }

  await Report.updateMany({ incident: source._id }, { $set: { incident: cible._id } });
  const confirmations = await Confirmation.find({ incident: source._id }).select('_id');
  for (const c of confirmations) {
    try {
      await Confirmation.updateOne({ _id: c._id }, { $set: { incident: cible._id } });
    } catch (err) {
      // RG5 : cet utilisateur avait déjà confirmé l'incident cible, on supprime le doublon.
      if (err.code === 11000) await Confirmation.deleteOne({ _id: c._id });
      else throw err;
    }
  }
  await Incident.deleteOne({ _id: source._id });
  await Incident.updateOne(
    { _id: cible._id },
    { $push: { historique: { statut: cible.statut, agent: agentId, date: new Date(), motif: `Fusion avec un incident voisin (${source.nbSignalements} signalement(s) rattaché(s))` } } }
  );
  return recalculerIncident(cible._id);
}

module.exports = { recalculerIncident, enregistrerSignalement, confirmerIncident, changerStatut, rejeterSignalement, fusionnerIncidents };
