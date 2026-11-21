// F17 : génère des données de démonstration réalistes autour de Nabeul (environ 200 signalements).
// Les signalements passent par le VRAI algorithme de regroupement : le script sert donc aussi de test de charge.
// Utilisation :
//   npm run donnees-demo             refuse de s'exécuter si des signalements existent déjà
//   npm run donnees-demo -- --reset  efface tous les signalements, incidents et confirmations, puis régénère
// Les comptes de démonstration (citoyenN@demo.tuniins.test) ont un mot de passe aléatoire que personne ne connaît :
// ils ne permettent pas de se connecter. Les statuts ne sont modifiés que si un compte agent existe (npm run creer-agent).
const crypto = require('node:crypto');
const { parseArgs } = require('node:util');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../src/config');
const User = require('../src/models/User');
const Incident = require('../src/models/Incident');
const Report = require('../src/models/Report');
const Confirmation = require('../src/models/Confirmation');
const Category = require('../src/models/Category');
const { assurerCategories } = Category;
const { enregistrerSignalement, changerStatut, recalculerIncident } = require('../src/services/regroupement');
const { distanceMetres } = require('../src/services/geo');
const { MS_PAR_JOUR } = require('../src/services/score');

const DOMAINE_DEMO = '@demo.tuniins.test';
const NB_CITOYENS = 30;

// Générateur pseudo-aléatoire déterministe : deux exécutions donnent les mêmes données.
function mulberry32(graine) {
  let a = graine;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const alea = mulberry32(2026);
// Nombre décimal pseudo-aléatoire entre min et max.
const entre = (min, max) => min + alea() * (max - min);
// Entier pseudo-aléatoire entre min et max inclus.
const entier = (min, max) => Math.floor(entre(min, max + 1));
// Élément pseudo-aléatoire d'une liste.
const choisir = (liste) => liste[Math.floor(alea() * liste.length)];

// Décale un point de dx mètres vers l'est et dy mètres vers le nord.
function decaler([lng, lat], dx, dy) {
  return [lng + dx / (111320 * Math.cos((lat * Math.PI) / 180)), lat + dy / 111320];
}
// Point pseudo-aléatoire dans un disque autour d'un centre.
function pointDansDisque(centre, rayon) {
  const angle = entre(0, 2 * Math.PI);
  const r = rayon * Math.sqrt(alea());
  return decaler(centre, r * Math.cos(angle), r * Math.sin(angle));
}

const DESCRIPTIONS = {
  nid_de_poule: ['Trou profond au milieu de la chaussée', 'Nid-de-poule dangereux pour les deux-roues', 'La route est défoncée, les voitures zigzaguent', 'Trou qui s\'agrandit à chaque pluie'],
  eclairage: ['Lampadaire éteint depuis plusieurs jours', 'Rue complètement dans le noir le soir', 'Éclairage qui clignote sans arrêt', 'Poteau d\'éclairage sans lumière'],
  dechets: ['Déchets non ramassés depuis une semaine', 'Poubelles qui débordent sur le trottoir', 'Dépôt sauvage de gravats', 'Odeur forte, bac jamais vidé'],
  coupure_eau: ['Plus d\'eau dans tout le quartier', 'Coupure d\'eau depuis ce matin', 'Pas d\'eau au robinet depuis hier soir', 'Pression très faible puis coupure totale'],
  coupure_electricite: ['Coupure de courant dans la rue', 'Plus d\'électricité depuis deux heures', 'Panne de courant dans tout le quartier', 'Le courant saute en permanence'],
  autre: ['Panneau de signalisation arraché', 'Banc public cassé', 'Trottoir effondré devant l\'école', 'Arbre dangereux au-dessus de la route'],
};

// Nombre de foyers (lieux d'incident) par catégorie : l'ensemble donne environ 200 signalements.
const PLAN = [
  { categorie: 'coupure_eau', foyers: 2, min: 10, max: 16 },
  { categorie: 'coupure_electricite', foyers: 2, min: 8, max: 14 },
  { categorie: 'nid_de_poule', foyers: 9, min: 3, max: 10 },
  { categorie: 'eclairage', foyers: 8, min: 2, max: 9 },
  { categorie: 'dechets', foyers: 7, min: 3, max: 8 },
  { categorie: 'autre', foyers: 3, min: 1, max: 4 },
];

// Génère les signalements de démonstration en passant par le vrai regroupement.
async function main() {
  const { values } = parseArgs({ options: { reset: { type: 'boolean', default: false } } });
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  await Promise.all([User.init(), Incident.init(), Report.init(), Confirmation.init(), Category.init()]);
  await assurerCategories();

  const dejaDesDonnees = (await Report.estimatedDocumentCount()) + (await Incident.estimatedDocumentCount());
  if (dejaDesDonnees > 0 && !values.reset) {
    console.error('Des signalements ou des incidents existent déjà. Relance avec --reset pour tout effacer puis régénérer.');
    process.exit(1);
  }
  if (values.reset) {
    await Promise.all([Report.deleteMany({}), Incident.deleteMany({}), Confirmation.deleteMany({})]);
    await User.deleteMany({ email: new RegExp(`${DOMAINE_DEMO.replaceAll('.', '\\.')}$`) });
    console.log('Anciennes données effacées (signalements, incidents, confirmations, comptes de démonstration).');
  }

  // Comptes citoyens de démonstration, impossibles à utiliser pour se connecter.
  const hache = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), config.bcryptRounds);
  const citoyens = await User.insertMany(
    Array.from({ length: NB_CITOYENS }, (_, i) => ({ nom: `Citoyen démo ${i + 1}`, email: `citoyen${i + 1}${DOMAINE_DEMO}`, motDePasseHache: hache, role: 'citoyen' }))
  );

  // 1) Choix des foyers : deux foyers de même catégorie doivent être assez éloignés pour ne pas fusionner.
  const categories = await Category.find().lean();
  const rayonDe = Object.fromEntries(categories.map((c) => [c.nom, c.rayonMetres]));
  const centreCommune = [config.commune.lng, config.commune.lat];
  const foyers = [];
  for (const plan of PLAN) {
    let crees = 0;
    for (let essai = 0; crees < plan.foyers && essai < 500; essai += 1) {
      const position = pointDansDisque(centreCommune, 3500);
      const tropProche = foyers.some((f) => f.categorie === plan.categorie && distanceMetres(f.position, position) < rayonDe[plan.categorie] * 2.5);
      if (tropProche) continue;
      foyers.push({ categorie: plan.categorie, position, nb: entier(plan.min, plan.max), debutJours: entre(0.5, 14) });
      crees += 1;
    }
  }

  // 2) Génération des signalements, dans l'ordre chronologique (comme dans la vraie vie).
  const maintenant = Date.now();
  const evenements = [];
  for (const f of foyers) {
    const auteurs = [...citoyens].sort(() => alea() - 0.5);
    for (let k = 0; k < f.nb; k += 1) {
      const quand = maintenant - f.debutJours * MS_PAR_JOUR * (1 - k / Math.max(f.nb, 1)) - entre(0, 3600 * 1000);
      evenements.push({
        date: new Date(Math.min(quand, maintenant)),
        categorie: f.categorie,
        position: pointDansDisque(f.position, rayonDe[f.categorie] * 0.4),
        auteur: auteurs[k % auteurs.length],
        description: choisir(DESCRIPTIONS[f.categorie]),
      });
    }
  }
  evenements.sort((a, b) => a.date - b.date);

  const debut = Date.now();
  let nouveaux = 0;
  for (const e of evenements) {
    const r = await enregistrerSignalement({
      utilisateurId: e.auteur._id,
      categorie: e.categorie,
      description: e.description,
      lng: e.position[0],
      lat: e.position[1],
      date: e.date,
    });
    if (r.nouvelIncident) nouveaux += 1;
  }
  const dureeMs = Date.now() - debut;

  // 3) Quelques confirmations « moi aussi » (un utilisateur ne confirme un incident qu'une fois : RG5).
  const incidents = await Incident.find({}).lean();
  let nbConfirmations = 0;
  for (const inc of incidents) {
    if (alea() > 0.4) continue;
    const dejaPresents = new Set((await Report.find({ incident: inc._id }).select('utilisateur').lean()).map((r) => String(r.utilisateur)));
    const candidats = citoyens.filter((c) => !dejaPresents.has(String(c._id))).slice(0, entier(1, 3));
    for (const c of candidats) {
      await Confirmation.create({ utilisateur: c._id, incident: inc._id });
      nbConfirmations += 1;
    }
    await recalculerIncident(inc._id);
  }

  // 4) Statuts variés, si un agent existe pour signer l'historique.
  const agent = await User.findOne({ role: 'agent' });
  const stats = { pris_en_charge: 0, resolu: 0, rejete: 0 };
  if (agent) {
    const ouverts = await Incident.find({ statut: 'nouveau' });
    for (const inc of ouverts) {
      const tirage = alea();
      // Date située h heures après le premier signalement, sans dépasser maintenant.
      const apres = (h) => new Date(Math.min(inc.premierSignalement.getTime() + h * 3600 * 1000, Date.now()));
      if (tirage < 0.2) {
        await changerStatut({ incidentId: inc._id, vers: 'pris_en_charge', motif: 'Équipe prévenue', agentId: agent._id, date: apres(entre(2, 48)) });
        stats.pris_en_charge += 1;
      } else if (tirage < 0.35) {
        await changerStatut({ incidentId: inc._id, vers: 'pris_en_charge', motif: 'Intervention planifiée', agentId: agent._id, date: apres(entre(2, 24)) });
        await changerStatut({ incidentId: inc._id, vers: 'resolu', motif: 'Réparation effectuée', agentId: agent._id, date: apres(entre(30, 200)) });
        stats.resolu += 1;
      } else if (tirage < 0.4) {
        await changerStatut({ incidentId: inc._id, vers: 'rejete', motif: 'Incident non confirmé sur place', agentId: agent._id, date: apres(entre(5, 60)) });
        stats.rejete += 1;
      }
    }
  } else {
    console.log("Aucun compte agent : les statuts restent à « Nouveau ». Crée un agent (npm run creer-agent) puis relance avec --reset pour voir des statuts variés.");
  }

  const [nbIncidents, nbSignalements] = await Promise.all([Incident.countDocuments(), Report.countDocuments()]);
  console.log(`Terminé : ${nbSignalements} signalements regroupés en ${nbIncidents} incidents (${nouveaux} créés), ${nbConfirmations} confirmations.`);
  console.log(`Regroupement : ${dureeMs} ms au total, soit ${(dureeMs / Math.max(nbSignalements, 1)).toFixed(1)} ms par signalement.`);
  if (agent) console.log(`Statuts modifiés par ${agent.email} : ${stats.pris_en_charge} pris en charge, ${stats.resolu} résolus, ${stats.rejete} rejetés.`);
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(`Échec : ${err.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
