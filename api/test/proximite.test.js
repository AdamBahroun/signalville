// Tests d'intégration de RG10 : « moi aussi » seulement près de l'incident, avec une limite quotidienne.
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

// Prépare un signalement de A et le compte B, qui confirmera.
async function preparer() {
  const [a, b] = [await creerCompte('Amel'), await creerCompte('Bilel')];
  const s = (await signaler(a)).donnees;
  return { a, b, incidentId: s.incidentId };
}
const confirmer = (jeton, incidentId, corps) => appeler('POST', `/incidents/${incidentId}/confirm`, { jeton, corps });

test('RG10 : sans position ou avec une position invalide, la confirmation est refusée (400) avec un message clair', async () => {
  const { b, incidentId } = await preparer();
  const invalides = [undefined, {}, { lat: 'abc', lng: 10.7 }, { lat: 36.45 }, { lat: 91, lng: 10.7 }, { lat: 36.45, lng: 181 }, { lat: null, lng: null }];
  for (const corps of invalides) {
    const r = await confirmer(b, incidentId, corps);
    assert.equal(r.statut, 400, JSON.stringify(corps));
    assert.match(r.donnees.erreur, /Position du téléphone obligatoire/);
  }
  assert.equal(await Confirmation.countDocuments(), 0);
});

test("RG10 : un téléphone à plus de 1 000 m de l'incident est refusé (403), à moins de 1 000 m accepté (201)", async () => {
  const { b, incidentId } = await preparer();
  const loin = await confirmer(b, incidentId, { lat: NABEUL.lat + 0.02, lng: NABEUL.lng }); // environ 2 200 m
  assert.equal(loin.statut, 403);
  assert.match(loin.donnees.erreur, /trop loin/);
  assert.equal(await Confirmation.countDocuments(), 0);

  const pres = await confirmer(b, incidentId, { lat: NABEUL.lat + 0.0045, lng: NABEUL.lng }); // environ 500 m
  assert.equal(pres.statut, 201);
  assert.equal(await Confirmation.countDocuments(), 1);
});

test('RG10 : le rayon est configurable', async () => {
  const { b, incidentId } = await preparer();
  const avant = config.confirmation.rayonMetres;
  try {
    config.confirmation.rayonMetres = 100;
    const r = await confirmer(b, incidentId, { lat: NABEUL.lat + 0.0045, lng: NABEUL.lng }); // environ 500 m
    assert.equal(r.statut, 403);
    assert.match(r.donnees.erreur, /maximum 100 m/);
  } finally {
    config.confirmation.rayonMetres = avant;
  }
});

test('RG10 : limite quotidienne de confirmations (429), les confirmations de plus de 24 heures ne comptent pas', async () => {
  const [a, b] = [await creerCompte('Amel'), await creerCompte('Bilel')];
  const ids = [];
  for (const dLat of [0, 0.001, 0.002]) ids.push((await signaler(a, { lat: NABEUL.lat + dLat })).donnees.incidentId); // trois incidents distincts (plus de 30 m)
  const bilel = await User.findOne({ email: 'bilel@exemple.test' });
  await Confirmation.create({ utilisateur: bilel._id, incident: ids[0], date: new Date(Date.now() - 25 * 60 * 60 * 1000) }); // trop ancienne pour compter

  const avant = config.confirmation.limiteParJour;
  try {
    config.confirmation.limiteParJour = 1;
    assert.equal((await confirmer(b, ids[1], NABEUL)).statut, 201);
    const r = await confirmer(b, ids[2], NABEUL);
    assert.equal(r.statut, 429);
    assert.match(r.donnees.erreur, /Limite de 1 confirmations? par jour/);
  } finally {
    config.confirmation.limiteParJour = avant;
  }
});

test('RG5 reste prioritaire : une deuxième confirmation du même utilisateur donne 409, même avec la limite atteinte', async () => {
  const { b, incidentId } = await preparer();
  const avant = config.confirmation.limiteParJour;
  try {
    config.confirmation.limiteParJour = 1;
    assert.equal((await confirmer(b, incidentId, NABEUL)).statut, 201);
    assert.equal((await confirmer(b, incidentId, NABEUL)).statut, 409);
  } finally {
    config.confirmation.limiteParJour = avant;
  }
});

test('RG10 : les valeurs par défaut sont 1 000 m et 20 confirmations par jour', () => {
  assert.equal(config.confirmation.rayonMetres, 1000);
  assert.equal(config.confirmation.limiteParJour, 20);
});
