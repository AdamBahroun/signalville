// Tests d'intégration du regroupement et de l'administration : on démarre vraiment l'API et on l'appelle en HTTP.
// Prérequis : MongoDB lancé (base dédiée "tuniins_test", vidée au début des tests).
process.env.NODE_ENV = 'test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../src/config');
const app = require('../src/app');
const User = require('../src/models/User');
const Incident = require('../src/models/Incident');
const Report = require('../src/models/Report');
const Confirmation = require('../src/models/Confirmation');
const Category = require('../src/models/Category');

let serveur;
let base;
let jetonAgent;
let jetonCitoyen;
let citoyen;
let agent;

const appeler = async (methode, chemin, { corps, jeton } = {}) => {
  const entetes = { 'Content-Type': 'application/json' };
  if (jeton) entetes.Authorization = `Bearer ${jeton}`;
  const reponse = await fetch(base + chemin, { method: methode, headers: entetes, body: corps === undefined ? undefined : JSON.stringify(corps) });
  const texte = await reponse.text();
  return { statut: reponse.status, corps: texte ? JSON.parse(texte) : null };
};
const jetonPour = (u) => jwt.sign({ role: u.role }, config.jwtSecret, { subject: u.id, expiresIn: '1h', algorithm: 'HS256' });

// Centre de la commune : le point de départ de tous les signalements de test.
const { lat: LAT, lng: LNG } = config.commune;
// 0,0001 degré de latitude vaut environ 11 m.
const signaler = (jeton, { categorie = 'nid_de_poule', dLat = 0, description = 'Trou profond devant la mairie' } = {}) =>
  appeler('POST', '/reports', { jeton, corps: { categorie, description, lat: LAT + dLat, lng: LNG } });

before(async () => {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  assert.match(mongoose.connection.name, /test/i, 'La base utilisée par les tests doit contenir "test" dans son nom.');
  await mongoose.connection.dropDatabase();
  // dropDatabase supprime aussi les index : on les recrée explicitement (unicité, index géospatial 2dsphere).
  await Promise.all([User, Incident, Report, Confirmation, Category].map((m) => m.syncIndexes()));
  await Category.assurerCategories();
  serveur = app.listen(0);
  base = `http://127.0.0.1:${serveur.address().port}`;

  const hache = await bcrypt.hash('MotDePasseTest123', 4);
  citoyen = await User.create({ nom: 'Citoyen A', email: 'a@exemple.test', motDePasseHache: hache });
  agent = await User.create({ nom: 'Agent Test', email: 'agent@exemple.test', motDePasseHache: hache, role: 'agent' });
  jetonCitoyen = jetonPour(citoyen);
  jetonAgent = jetonPour(agent);
});

after(async () => {
  serveur.close();
  await mongoose.disconnect();
});

test('Contrôle d\'accès : toutes les routes /admin refusent un citoyen (403) et l\'absence de jeton (401)', async () => {
  const routes = [
    ['GET', '/admin/incidents'],
    ['GET', '/admin/heatmap'],
    ['GET', '/admin/stats'],
    ['GET', '/admin/utilisateurs'],
    ['GET', '/admin/categories'],
    ['PATCH', '/admin/categories/dechets'],
    ['PATCH', '/admin/incidents/507f1f77bcf86cd799439011/status'],
  ];
  for (const [methode, chemin] of routes) {
    const corps = methode === 'GET' ? undefined : {};
    assert.equal((await appeler(methode, chemin, { jeton: jetonCitoyen, corps })).statut, 403, `${methode} ${chemin} (citoyen)`);
    assert.equal((await appeler(methode, chemin, { corps })).statut, 401, `${methode} ${chemin} (sans jeton)`);
  }
});

test('RG2 : deux signalements de même catégorie à environ 11 m sont rattachés au même incident', async () => {
  const a = await signaler(jetonCitoyen);
  assert.equal(a.statut, 201);
  assert.equal(a.corps.nouvelIncident, true);

  const autre = await User.create({ nom: 'Citoyen B', email: 'b@exemple.test', motDePasseHache: 'x'.repeat(20) });
  const b = await signaler(jetonPour(autre), { dLat: 0.0001, description: 'Le même trou, vu de l\'autre côté' });
  assert.equal(b.statut, 201);
  assert.equal(b.corps.nouvelIncident, false);
  assert.equal(b.corps.incidentId, a.corps.incidentId);

  const incident = await Incident.findById(a.corps.incidentId);
  assert.equal(incident.nbSignalements, 2);
  assert.equal(incident.nbUtilisateurs, 2);
});

test('RG2 : un signalement à plus de 30 m (nid-de-poule) ou d\'une autre catégorie crée un nouvel incident', async () => {
  const loin = await signaler(jetonCitoyen, { dLat: 0.001 }); // environ 111 m
  assert.equal(loin.corps.nouvelIncident, true);
  const autreCategorie = await signaler(jetonCitoyen, { categorie: 'dechets', description: 'Poubelles pleines' });
  assert.equal(autreCategorie.corps.nouvelIncident, true);
});

test('RG9 : position hors de la commune refusée (400) ; données invalides refusées (400)', async () => {
  const horsZone = await appeler('POST', '/reports', { jeton: jetonCitoyen, corps: { categorie: 'dechets', description: 'Loin de tout', lat: 48.85, lng: 2.35 } });
  assert.equal(horsZone.statut, 400);
  const invalide = await appeler('POST', '/reports', { jeton: jetonCitoyen, corps: { categorie: 'dechets', description: 'ok', lat: '36.4', lng: 10.7 } });
  assert.equal(invalide.statut, 400);
  const categorieInconnue = await appeler('POST', '/reports', { jeton: jetonCitoyen, corps: { categorie: 'inconnue', description: 'Test catégorie', lat: LAT, lng: LNG } });
  assert.equal(categorieInconnue.statut, 400);
});

test('RG6 : au-delà de 10 signalements par jour, la réponse est 429', async () => {
  const gros = await User.create({ nom: 'Gros posteur', email: 'gros@exemple.test', motDePasseHache: 'x'.repeat(20) });
  const jeton = jetonPour(gros);
  for (let i = 0; i < config.limiteSignalementsParJour; i += 1) {
    assert.equal((await signaler(jeton, { categorie: 'autre', dLat: 0.02 + i * 0.001 })).statut, 201);
  }
  assert.equal((await signaler(jeton, { categorie: 'autre', dLat: 0.05 })).statut, 429);
});

test('F10 : la liste est triée par score décroissant et le score vient de la formule RG4', async () => {
  const r = await appeler('GET', '/admin/incidents?statut=ouverts', { jeton: jetonAgent });
  assert.equal(r.statut, 200);
  const scores = r.corps.incidents.map((i) => i.score);
  assert.deepEqual(scores, [...scores].sort((x, y) => y - x));
  const incident = r.corps.incidents.find((i) => i.categorie === 'nid_de_poule' && i.nbUtilisateurs === 2);
  assert.ok(incident, 'incident à deux utilisateurs attendu');
  assert.equal(incident.score, 3 * 2 + 0.5 * incident.ageJours);
});

test('F10 : filtres par catégorie et paramètres invalides (400)', async () => {
  const r = await appeler('GET', '/admin/incidents?categorie=dechets', { jeton: jetonAgent });
  assert.ok(r.corps.incidents.length >= 1);
  assert.ok(r.corps.incidents.every((i) => i.categorie === 'dechets'));
  assert.equal((await appeler('GET', '/admin/incidents?statut=nimporte', { jeton: jetonAgent })).statut, 400);
  assert.equal((await appeler('GET', '/admin/incidents?limite=5000', { jeton: jetonAgent })).statut, 400);
});

test('RG7 et RG8 : changement de statut avec historique ; transition interdite et motif manquant refusés', async () => {
  const incident = await Incident.findOne({ categorie: 'nid_de_poule', nbUtilisateurs: 2 });
  const id = incident.id;

  // Nouveau > Résolu : interdit
  assert.equal((await appeler('PATCH', `/admin/incidents/${id}/status`, { jeton: jetonAgent, corps: { statut: 'resolu' } })).statut, 400);
  // Nouveau > Rejeté sans motif : interdit
  assert.equal((await appeler('PATCH', `/admin/incidents/${id}/status`, { jeton: jetonAgent, corps: { statut: 'rejete' } })).statut, 400);
  // Nouveau > Pris en charge : autorisé
  const ok = await appeler('PATCH', `/admin/incidents/${id}/status`, { jeton: jetonAgent, corps: { statut: 'pris_en_charge', motif: 'Équipe prévenue' } });
  assert.equal(ok.statut, 200);
  assert.equal(ok.corps.incident.statut, 'pris_en_charge');

  const detail = await appeler('GET', `/admin/incidents/${id}`, { jeton: jetonAgent });
  assert.equal(detail.statut, 200);
  assert.equal(detail.corps.signalements.length, 2);
  assert.equal(detail.corps.incident.historique.length, 2);
  assert.deepEqual(
    detail.corps.transitionsPossibles.map((t) => [t.statut, t.motifObligatoire]),
    [['resolu', false], ['rejete', true]]
  );
  const dernier = detail.corps.incident.historique.at(-1);
  assert.equal(dernier.statut, 'pris_en_charge');
  assert.equal(dernier.motif, 'Équipe prévenue');
  assert.equal(dernier.agent.nom, 'Agent Test');

  assert.equal((await appeler('PATCH', '/admin/incidents/pas-un-id/status', { jeton: jetonAgent, corps: { statut: 'resolu' } })).statut, 400);
  assert.equal((await appeler('PATCH', '/admin/incidents/507f1f77bcf86cd799439011/status', { jeton: jetonAgent, corps: { statut: 'resolu' } })).statut, 404);
});

test('RG3 : un incident résolu n\'absorbe plus de signalements, un nouvel incident est créé au même endroit', async () => {
  const incident = await Incident.findOne({ categorie: 'nid_de_poule', statut: 'pris_en_charge' });
  const [lng, lat] = incident.positionCentrale.coordinates;
  const resolu = await appeler('PATCH', `/admin/incidents/${incident.id}/status`, { jeton: jetonAgent, corps: { statut: 'resolu', motif: 'Réparé' } });
  assert.equal(resolu.statut, 200);

  const r = await appeler('POST', '/reports', { jeton: jetonCitoyen, corps: { categorie: 'nid_de_poule', description: 'Le trou est revenu', lat, lng } });
  assert.equal(r.statut, 201);
  assert.equal(r.corps.nouvelIncident, true);
  assert.notEqual(r.corps.incidentId, incident.id);

  // Réouverture : le motif est obligatoire (RG7)
  assert.equal((await appeler('PATCH', `/admin/incidents/${incident.id}/status`, { jeton: jetonAgent, corps: { statut: 'pris_en_charge' } })).statut, 400);
  assert.equal((await appeler('PATCH', `/admin/incidents/${incident.id}/status`, { jeton: jetonAgent, corps: { statut: 'pris_en_charge', motif: 'Le problème persiste' } })).statut, 200);
});

test('F14 : rejet d\'un signalement abusif et blocage de son auteur (connexion et jeton existant refusés)', async () => {
  const spammeur = await User.create({ nom: 'Spammeur', email: 'spam@exemple.test', motDePasseHache: 'x'.repeat(20) });
  const jetonSpam = jetonPour(spammeur);
  const s = await signaler(jetonSpam, { categorie: 'eclairage', dLat: -0.03, description: 'Faux signalement pour tester' });
  assert.equal(s.statut, 201);
  const report = await Report.findById(s.corps.reportId);

  assert.equal((await appeler('POST', `/admin/signalements/${report.id}/rejet`, { jeton: jetonAgent, corps: {} })).statut, 400);
  const r = await appeler('POST', `/admin/signalements/${report.id}/rejet`, { jeton: jetonAgent, corps: { motif: 'Faux signalement', bloquerAuteur: true } });
  assert.equal(r.statut, 200);
  assert.equal(r.corps.auteurBloque, true);
  // Il ne restait que ce signalement : l'incident est rejeté automatiquement.
  assert.equal(r.corps.incident.statut, 'rejete');
  assert.equal(r.corps.incident.nbSignalements, 0);
  assert.equal((await appeler('POST', `/admin/signalements/${report.id}/rejet`, { jeton: jetonAgent, corps: { motif: 'Encore' } })).statut, 409);
  assert.equal((await appeler('GET', '/admin/ping', { jeton: jetonSpam })).statut, 401);
});

test('F14 : un administrateur ne peut pas bloquer un compte agent ; blocage et déblocage d\'un citoyen', async () => {
  assert.equal((await appeler('PATCH', `/admin/utilisateurs/${agent.id}/blocage`, { jeton: jetonAgent, corps: { bloque: true } })).statut, 403);
  const bloque = await appeler('PATCH', `/admin/utilisateurs/${citoyen.id}/blocage`, { jeton: jetonAgent, corps: { bloque: true } });
  assert.equal(bloque.corps.utilisateur.bloque, true);
  const liste = await appeler('GET', '/admin/utilisateurs?bloque=true', { jeton: jetonAgent });
  assert.ok(liste.corps.utilisateurs.some((u) => u.id === citoyen.id));
  assert.equal(liste.corps.utilisateurs[0].motDePasseHache, undefined);
  const debloque = await appeler('PATCH', `/admin/utilisateurs/${citoyen.id}/blocage`, { jeton: jetonAgent, corps: { bloque: false } });
  assert.equal(debloque.corps.utilisateur.bloque, false);
});

test('F16 : fusion de deux incidents de même catégorie ; refus si catégories différentes', async () => {
  const a = await signaler(jetonCitoyen, { categorie: 'eclairage', dLat: 0.04, description: 'Lampadaire éteint' });
  const b = await signaler(jetonCitoyen, { categorie: 'eclairage', dLat: 0.0402, description: 'Lampadaire éteint, doublon créé par concurrence' });
  // 0,0002 degré = environ 22 m : sous le rayon de 30 m, donc regroupés (a et b forment un seul incident).
  assert.equal(b.corps.incidentId, a.corps.incidentId);
  const autre = await signaler(jetonCitoyen, { categorie: 'eclairage', dLat: 0.06, description: 'Autre lampadaire' });
  assert.notEqual(autre.corps.incidentId, a.corps.incidentId);

  const refus = await appeler('POST', `/admin/incidents/${autre.corps.incidentId}/fusion`, { jeton: jetonAgent, corps: { cibleId: (await Incident.findOne({ categorie: 'dechets' })).id } });
  assert.equal(refus.statut, 400);

  const fusion = await appeler('POST', `/admin/incidents/${autre.corps.incidentId}/fusion`, { jeton: jetonAgent, corps: { cibleId: a.corps.incidentId } });
  assert.equal(fusion.statut, 200);
  assert.equal(fusion.corps.incident.id, a.corps.incidentId);
  assert.equal(fusion.corps.incident.nbSignalements, 3);
  assert.equal(await Incident.findById(autre.corps.incidentId), null);
});

test('F13, F15 : carte de chaleur et statistiques', async () => {
  // On résout un incident (catégorie "autre") pour que le délai moyen de résolution soit calculable.
  const aResoudre = await Incident.findOne({ categorie: 'autre', statut: 'nouveau' });
  assert.equal((await appeler('PATCH', `/admin/incidents/${aResoudre.id}/status`, { jeton: jetonAgent, corps: { statut: 'pris_en_charge' } })).statut, 200);
  assert.equal((await appeler('PATCH', `/admin/incidents/${aResoudre.id}/status`, { jeton: jetonAgent, corps: { statut: 'resolu', motif: 'Traité' } })).statut, 200);

  const chaleur = await appeler('GET', '/admin/heatmap', { jeton: jetonAgent });
  assert.equal(chaleur.statut, 200);
  assert.ok(chaleur.corps.points.length > 0);
  assert.ok(chaleur.corps.points.every((p) => typeof p.lat === 'number' && typeof p.lng === 'number' && p.poids > 0));

  const stats = await appeler('GET', '/admin/stats', { jeton: jetonAgent });
  assert.equal(stats.statut, 200);
  assert.equal(stats.corps.totaux.incidents, await Incident.countDocuments());
  assert.equal(stats.corps.totaux.signalements, await Report.countDocuments({ rejete: false }));
  assert.equal(stats.corps.parCategorie.length, 6);
  assert.ok(stats.corps.nbResolus >= 1);
  assert.ok(stats.corps.delaiMoyenResolutionJours >= 0);
});

test('RG2 et RG4 paramétrables : modifier le rayon et le poids d\'une catégorie change le comportement', async () => {
  const maj = await appeler('PATCH', '/admin/categories/dechets', { jeton: jetonAgent, corps: { rayonMetres: 200, poids: 4 } });
  assert.equal(maj.statut, 200);
  assert.equal(maj.corps.categorie.rayonMetres, 200);

  // Un déchet à environ 111 m du premier : regroupé avec le rayon de 200 m (il aurait créé un nouvel incident avec 50 m).
  const existant = await Incident.findOne({ categorie: 'dechets', statut: 'nouveau' });
  const [lng, lat] = existant.positionCentrale.coordinates;
  const r = await appeler('POST', '/reports', { jeton: jetonCitoyen, corps: { categorie: 'dechets', description: 'Autre tas de déchets', lat: lat + 0.001, lng } });
  assert.equal(r.corps.incidentId, existant.id);

  assert.equal((await appeler('PATCH', '/admin/categories/dechets', { jeton: jetonAgent, corps: { rayonMetres: -5 } })).statut, 400);
  assert.equal((await appeler('PATCH', '/admin/categories/inexistante', { jeton: jetonAgent, corps: { poids: 3 } })).statut, 404);
});
