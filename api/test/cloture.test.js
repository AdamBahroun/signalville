// Tests d'intégration : incident rejeté (RG3) et rejet définitif (RG7), en HTTP.
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
const DeviceToken = require('../src/models/DeviceToken');

assert.ok(config.enTest, 'Ces tests ne doivent jamais tourner sur la base de développement.');

let serveur;
let base;

// Un point de Nabeul (dans la zone de la commune, RG9). 0,001 degré de latitude vaut environ 111 m.
const NABEUL = { lat: 36.4513, lng: 10.7357 };

// Appelle l'API en HTTP ; renvoie le statut et le corps JSON.
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

// Crée un signalement de nid-de-poule (position de Nabeul par défaut).
const signaler = (jeton, extra = {}) =>
  appeler('POST', '/reports', { jeton, corps: { categorie: 'nid_de_poule', description: 'Trou profond devant la mairie', ...NABEUL, ...extra } });

// Changement de statut par l'administrateur.
const changerStatut = (jeton, incidentId, statut, motif) =>
  appeler('PATCH', `/admin/incidents/${incidentId}/status`, { jeton, corps: motif === undefined ? { statut } : { statut, motif } });

before(async () => {
  await mongoose.connect(config.mongoUri);
  await Promise.all([User.init(), Incident.init(), Report.init(), Confirmation.init(), Category.init(), DeviceToken.init()]);
  await new Promise((ok) => {
    serveur = app.listen(0, '127.0.0.1', ok);
  });
  base = `http://127.0.0.1:${serveur.address().port}`;
});

// Base vide avant chaque test.
beforeEach(async () => {
  await Promise.all([User.deleteMany({}), Incident.deleteMany({}), Report.deleteMany({}), Confirmation.deleteMany({}), Category.deleteMany({}), DeviceToken.deleteMany({})]);
  await Category.assurerCategories();
});

after(async () => {
  await new Promise((ok) => serveur.close(ok));
  await mongoose.disconnect();
});

// Prépare un incident rejeté : A signale, l'administrateur le rejette avec un motif (RG7).
async function incidentRejete() {
  const [a, b, admin] = [await creerCompte('Amel'), await creerCompte('Bilel'), await creerCompte('Admin', 'agent')];
  const s = (await signaler(a)).donnees;
  const rejet = await changerStatut(admin, s.incidentId, 'rejete', 'Signalement abusif');
  assert.equal(rejet.statut, 200);
  return { a, b, admin, incidentId: s.incidentId };
}

test("RG3 : un incident rejeté n'absorbe plus de signalements, un nouvel incident est créé au même endroit", async () => {
  const { b, incidentId } = await incidentRejete();
  const r = await signaler(b); // même catégorie, même position : sans RG3 il serait rattaché à l'incident rejeté
  assert.equal(r.statut, 201);
  assert.equal(r.donnees.nouvelIncident, true);
  assert.notEqual(r.donnees.incidentId, incidentId);
  assert.equal(await Incident.countDocuments(), 2);
  assert.equal((await Incident.findById(incidentId)).nbSignalements, 1); // l'incident rejeté n'a rien reçu de plus
});

test('RG3 : un incident rejeté ne se confirme plus (409)', async () => {
  const { b, incidentId } = await incidentRejete();
  const r = await appeler('POST', `/incidents/${incidentId}/confirm`, { jeton: b, corps: NABEUL });
  assert.equal(r.statut, 409);
  assert.match(r.donnees.erreur, /plus ouvert/);
  assert.equal(await Confirmation.countDocuments(), 0);
});

test("RG7 : un incident rejeté est définitif, toute transition est refusée (400) et l'historique ne change pas", async () => {
  const { admin, incidentId } = await incidentRejete();
  for (const vers of ['nouveau', 'pris_en_charge', 'resolu', 'rejete']) {
    const r = await changerStatut(admin, incidentId, vers, 'Tentative de réouverture');
    assert.equal(r.statut, 400, `rejete vers ${vers}`);
    assert.match(r.donnees.erreur, /Transition interdite/);
  }
  const incident = await Incident.findById(incidentId);
  assert.equal(incident.statut, 'rejete');
  assert.equal(incident.historique.length, 2); // « nouveau » à la création, puis « rejete »
});
