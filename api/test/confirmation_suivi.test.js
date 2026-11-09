// Tests d'intégration du Sprint 3 : confirmation « moi aussi » (RG5) et suivi côté citoyen (/me/reports).
// MongoDB doit tourner. Les tests utilisent la base tuniins_test, jamais la base de développement.
process.env.NODE_ENV = 'test'; // AVANT tout require : sinon la configuration pointerait vers la vraie base

const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../src/config');
const app = require('../src/app');
const User = require('../src/models/User');
const Incident = require('../src/models/Incident');
const Report = require('../src/models/Report');
const Confirmation = require('../src/models/Confirmation');
const Category = require('../src/models/Category');

assert.ok(config.enTest, 'Ces tests ne doivent jamais tourner sur la base de développement.');

let serveur;
let base;

// Un point de Nabeul (dans la zone de la commune, RG9).
const NABEUL = { lat: 36.4513, lng: 10.7357 };

async function appeler(methode, chemin, { jeton, corps } = {}) {
  const entetes = {};
  if (jeton) entetes.Authorization = `Bearer ${jeton}`;
  if (corps !== undefined) entetes['Content-Type'] = 'application/json';
  const r = await fetch(`${base}${chemin}`, { method: methode, headers: entetes, body: corps === undefined ? undefined : JSON.stringify(corps) });
  return { statut: r.status, donnees: await r.json().catch(() => ({})) };
}

// Crée un compte directement en base puis se connecte par l'API (même chemin que l'application).
async function creerCompte(nom, role = 'citoyen') {
  const email = `${nom.toLowerCase()}@exemple.test`;
  await User.create({ nom, email, motDePasseHache: await bcrypt.hash('MotDePasseTest123', 4), role });
  const { donnees } = await appeler('POST', '/auth/login', { corps: { email, motDePasse: 'MotDePasseTest123' } });
  return donnees.jeton;
}

const signaler = (jeton, extra = {}) =>
  appeler('POST', '/reports', { jeton, corps: { categorie: 'nid_de_poule', description: 'Trou profond devant la mairie', ...NABEUL, ...extra } });

before(async () => {
  await mongoose.connect(config.mongoUri);
  await Promise.all([User.init(), Incident.init(), Report.init(), Confirmation.init(), Category.init()]);
  await new Promise((ok) => {
    serveur = app.listen(0, '127.0.0.1', ok);
  });
  base = `http://127.0.0.1:${serveur.address().port}`;
});

beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Incident.deleteMany({}), Report.deleteMany({}), Confirmation.deleteMany({}), Category.deleteMany({})]);
  await Category.assurerCategories();
});

after(async () => {
  await new Promise((ok) => serveur.close(ok));
  await mongoose.disconnect();
});

// ------------------------------------------------------------------ Confirmation « moi aussi » (RG5)

test('moi aussi : une confirmation est enregistrée et compte comme une personne de plus', async () => {
  const [a, b] = [await creerCompte('Amel'), await creerCompte('Bilel')];
  const { donnees: s } = await signaler(a);

  const r = await appeler('POST', `/incidents/${s.incidentId}/confirm`, { jeton: b });
  assert.equal(r.statut, 201);
  assert.equal(r.donnees.nbSignalements, 1, 'une confirmation ne crée pas de signalement');
  assert.equal(r.donnees.nbPersonnes, 2);
  assert.equal(r.donnees.dejaConfirme, true);

  const incident = await Incident.findById(s.incidentId);
  assert.equal(incident.nbUtilisateurs, 2);
});

test('moi aussi : le score de l\'administrateur augmente (poids 3 du nid-de-poule x 2 personnes)', async () => {
  const [a, b] = [await creerCompte('Amel'), await creerCompte('Bilel')];
  const admin = await creerCompte('Admin', 'agent');
  const { donnees: s } = await signaler(a);
  await appeler('POST', `/incidents/${s.incidentId}/confirm`, { jeton: b });

  const r = await appeler('GET', '/admin/incidents', { jeton: admin });
  assert.equal(r.donnees.incidents[0].nbUtilisateurs, 2);
  assert.equal(r.donnees.incidents[0].score, 6); // 3 x 2 + 0,5 x 0 jour
});

test('RG5 : une deuxième confirmation du même utilisateur est refusée (409) et ne change rien', async () => {
  const [a, b] = [await creerCompte('Amel'), await creerCompte('Bilel')];
  const { donnees: s } = await signaler(a);
  assert.equal((await appeler('POST', `/incidents/${s.incidentId}/confirm`, { jeton: b })).statut, 201);

  const r = await appeler('POST', `/incidents/${s.incidentId}/confirm`, { jeton: b });
  assert.equal(r.statut, 409);
  assert.match(r.donnees.erreur, /déjà confirmé/);
  assert.equal(await Confirmation.countDocuments({ incident: s.incidentId }), 1);
  assert.equal((await Incident.findById(s.incidentId)).nbUtilisateurs, 2);
});

test('RG5 : deux confirmations simultanées du même utilisateur donnent une seule confirmation', async () => {
  const [a, b] = [await creerCompte('Amel'), await creerCompte('Bilel')];
  const { donnees: s } = await signaler(a);
  const reponses = await Promise.all([1, 2, 3].map(() => appeler('POST', `/incidents/${s.incidentId}/confirm`, { jeton: b })));
  assert.deepEqual(reponses.map((r) => r.statut).sort(), [201, 409, 409]);
  assert.equal(await Confirmation.countDocuments({ incident: s.incidentId }), 1);
});

test('l\'auteur d\'un signalement ne peut pas confirmer son propre incident', async () => {
  const a = await creerCompte('Amel');
  const { donnees: s } = await signaler(a);
  const r = await appeler('POST', `/incidents/${s.incidentId}/confirm`, { jeton: a });
  assert.equal(r.statut, 409);
  assert.match(r.donnees.erreur, /déjà signalé/);
});

test('RG3 : un incident résolu ou rejeté ne se confirme plus', async () => {
  const [a, b] = [await creerCompte('Amel'), await creerCompte('Bilel')];
  const admin = await creerCompte('Admin', 'agent');
  const { donnees: s } = await signaler(a);
  await appeler('PATCH', `/admin/incidents/${s.incidentId}/status`, { jeton: admin, corps: { statut: 'pris_en_charge', motif: 'Équipe envoyée' } });
  await appeler('PATCH', `/admin/incidents/${s.incidentId}/status`, { jeton: admin, corps: { statut: 'resolu', motif: 'Réparé' } });

  const r = await appeler('POST', `/incidents/${s.incidentId}/confirm`, { jeton: b });
  assert.equal(r.statut, 409);
  assert.match(r.donnees.erreur, /plus ouvert/);
});

test('moi aussi : accès refusé sans jeton (401), à l\'administrateur (403) ; identifiant invalide (400) ou inconnu (404)', async () => {
  const [a, b] = [await creerCompte('Amel'), await creerCompte('Bilel')];
  const admin = await creerCompte('Admin', 'agent');
  const { donnees: s } = await signaler(a);

  assert.equal((await appeler('POST', `/incidents/${s.incidentId}/confirm`)).statut, 401);
  assert.equal((await appeler('POST', `/incidents/${s.incidentId}/confirm`, { jeton: admin })).statut, 403);
  assert.equal((await appeler('POST', '/incidents/pas-un-id/confirm', { jeton: b })).statut, 400);
  assert.equal((await appeler('POST', `/incidents/${'a'.repeat(24)}/confirm`, { jeton: b })).statut, 404);
});

test('un utilisateur bloqué ne peut plus confirmer', async () => {
  const [a, b] = [await creerCompte('Amel'), await creerCompte('Bilel')];
  const { donnees: s } = await signaler(a);
  await User.updateOne({ email: 'bilel@exemple.test' }, { bloque: true });
  assert.equal((await appeler('POST', `/incidents/${s.incidentId}/confirm`, { jeton: b })).statut, 401);
});

test('GET /incidents : monSignalement et dejaConfirme sont propres à l\'utilisateur connecté, sans score ni historique', async () => {
  const [a, b, c] = [await creerCompte('Amel'), await creerCompte('Bilel'), await creerCompte('Chaima')];
  const { donnees: s } = await signaler(a);
  await appeler('POST', `/incidents/${s.incidentId}/confirm`, { jeton: b });
  const chemin = `/incidents?lat=${NABEUL.lat}&lng=${NABEUL.lng}`;

  const vueA = (await appeler('GET', chemin, { jeton: a })).donnees.incidents[0];
  const vueB = (await appeler('GET', chemin, { jeton: b })).donnees.incidents[0];
  const vueC = (await appeler('GET', chemin, { jeton: c })).donnees.incidents[0];
  assert.deepEqual([vueA.monSignalement, vueA.dejaConfirme], [true, false]);
  assert.deepEqual([vueB.monSignalement, vueB.dejaConfirme], [false, true]);
  assert.deepEqual([vueC.monSignalement, vueC.dejaConfirme], [false, false]);
  assert.equal(vueC.nbPersonnes, 2);
  assert.equal(vueC.score, undefined);
  assert.equal(vueC.historique, undefined);
});

// ------------------------------------------------------------------ Suivi côté citoyen

test('/me/reports : seulement mes signalements, du plus récent au plus ancien', async () => {
  const [a, b] = [await creerCompte('Amel'), await creerCompte('Bilel')];
  await signaler(a, { description: 'Premier signalement' });
  await signaler(a, { categorie: 'dechets', description: 'Déchets non ramassés', lat: 36.46, lng: 10.74 });
  await signaler(b, { description: 'Signalement de Bilel' });

  const r = await appeler('GET', '/me/reports', { jeton: a });
  assert.equal(r.statut, 200);
  assert.equal(r.donnees.signalements.length, 2);
  assert.equal(r.donnees.signalements[0].description, 'Déchets non ramassés');
  assert.equal(r.donnees.signalements[0].libelle, 'Déchets');
  assert.ok(r.donnees.signalements.every((s) => s.description !== 'Signalement de Bilel'));
});

test('/me/reports : le changement de statut et son motif apparaissent, sans nom d\'agent ni score', async () => {
  const a = await creerCompte('Amel');
  const admin = await creerCompte('Admin', 'agent');
  const { donnees: s } = await signaler(a);
  await appeler('PATCH', `/admin/incidents/${s.incidentId}/status`, { jeton: admin, corps: { statut: 'pris_en_charge', motif: 'Équipe voirie envoyée' } });

  const { donnees } = await appeler('GET', '/me/reports', { jeton: a });
  const incident = donnees.signalements[0].incident;
  assert.equal(incident.statut, 'pris_en_charge');
  assert.equal(incident.libelleStatut, 'Pris en charge');
  assert.deepEqual(incident.historique.map((h) => h.statut), ['nouveau', 'pris_en_charge']);
  assert.equal(incident.historique[1].motif, 'Équipe voirie envoyée');
  const texte = JSON.stringify(donnees);
  assert.ok(!texte.includes('Admin'), "le nom de l'agent ne doit pas être renvoyé");
  assert.ok(!texte.includes('"agent"'), "aucun champ agent dans la réponse");
  assert.ok(!texte.includes('score'), 'aucun score dans la réponse');
});

test('/me/reports : un signalement rejeté par la modération montre son motif à son auteur', async () => {
  const a = await creerCompte('Amel');
  const admin = await creerCompte('Admin', 'agent');
  const { donnees: s } = await signaler(a);
  await appeler('POST', `/admin/signalements/${s.reportId}/rejet`, { jeton: admin, corps: { motif: 'Signalement sans rapport avec la voirie' } });

  const { donnees } = await appeler('GET', '/me/reports', { jeton: a });
  assert.equal(donnees.signalements[0].rejete, true);
  assert.equal(donnees.signalements[0].motifRejet, 'Signalement sans rapport avec la voirie');
  assert.equal(donnees.signalements[0].incident.statut, 'rejete');
});

test('/me/reports : 401 sans jeton, 403 pour l\'administrateur, liste vide pour un nouveau compte', async () => {
  const a = await creerCompte('Amel');
  const admin = await creerCompte('Admin', 'agent');
  assert.equal((await appeler('GET', '/me/reports')).statut, 401);
  assert.equal((await appeler('GET', '/me/reports', { jeton: admin })).statut, 403);
  assert.deepEqual((await appeler('GET', '/me/reports', { jeton: a })).donnees.signalements, []);
});

test('Swagger : les nouvelles routes figurent dans la documentation', () => {
  const openapi = require('../src/openapi');
  assert.ok(openapi.paths['/incidents/{id}/confirm'].post);
  assert.ok(openapi.paths['/me/reports'].get);
});
