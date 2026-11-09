// Tests d'intégration du Sprint 1 : on démarre vraiment l'API et on l'appelle en HTTP.
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

let serveur;
let base;

const appeler = async (methode, chemin, { corps, jeton } = {}) => {
  const entetes = { 'Content-Type': 'application/json' };
  if (jeton) entetes.Authorization = `Bearer ${jeton}`;
  const reponse = await fetch(base + chemin, { method: methode, headers: entetes, body: corps === undefined ? undefined : JSON.stringify(corps) });
  const texte = await reponse.text();
  return { statut: reponse.status, corps: texte ? JSON.parse(texte) : null };
};

const citoyen = { nom: 'Citoyen Test', email: 'citoyen@exemple.test', motDePasse: 'MotDePasseTest123' };

before(async () => {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  // Garde-fou : on ne vide jamais une base qui n'est pas clairement une base de test.
  assert.match(mongoose.connection.name, /test/i, 'La base utilisée par les tests doit contenir "test" dans son nom.');
  await mongoose.connection.dropDatabase();
  await User.syncIndexes(); // dropDatabase supprime aussi l'index unique sur l'email : on le recrée
  serveur = app.listen(0);
  base = `http://127.0.0.1:${serveur.address().port}`;
});

after(async () => {
  serveur.close();
  await mongoose.disconnect();
});

test('S1.1 GET /health répond 200 avec la base connectée', async () => {
  const r = await appeler('GET', '/health');
  assert.equal(r.statut, 200);
  assert.equal(r.corps.baseDeDonnees, 'connectee');
});

test('Route inconnue : 404 en JSON', async () => {
  const r = await appeler('GET', '/nimporte-quoi');
  assert.equal(r.statut, 404);
});

test('S1.2 inscription : 201, aucun hachage renvoyé, rôle citoyen même si le client demande agent', async () => {
  const r = await appeler('POST', '/auth/register', { corps: { ...citoyen, role: 'agent' } });
  assert.equal(r.statut, 201);
  assert.equal(r.corps.utilisateur.email, citoyen.email);
  assert.equal(r.corps.utilisateur.role, 'citoyen');
  assert.equal(r.corps.utilisateur.motDePasseHache, undefined);
  assert.equal(r.corps.utilisateur.motDePasse, undefined);

  const enBase = await User.findOne({ email: citoyen.email }).select('+motDePasseHache');
  assert.notEqual(enBase.motDePasseHache, citoyen.motDePasse, 'le mot de passe ne doit pas être stocké en clair');
  assert.ok(await bcrypt.compare(citoyen.motDePasse, enBase.motDePasseHache));
});

test('S1.2 inscription : email déjà utilisé (même en majuscules) => 409', async () => {
  const r = await appeler('POST', '/auth/register', { corps: { ...citoyen, email: 'CITOYEN@exemple.test' } });
  assert.equal(r.statut, 409);
});

test('S1.2 inscription : données invalides => 400', async () => {
  const cas = [
    { ...citoyen, email: 'pas-un-email' },
    { ...citoyen, email: 'autre@exemple.test', motDePasse: 'court' },
    { ...citoyen, email: 'autre@exemple.test', nom: '' },
    { ...citoyen, email: { $gt: '' } },
    { ...citoyen, email: 'autre@exemple.test', motDePasse: 12345678 },
  ];
  for (const corps of cas) {
    const r = await appeler('POST', '/auth/register', { corps });
    assert.equal(r.statut, 400, `devrait refuser : ${JSON.stringify(corps)}`);
  }
});

test('Corps JSON malformé => 400 (et non 500)', async () => {
  const reponse = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{pas du json' });
  assert.equal(reponse.status, 400);
});

test('S1.2 connexion : jeton JWT renvoyé avec identifiant et rôle', async () => {
  const r = await appeler('POST', '/auth/login', { corps: { email: citoyen.email, motDePasse: citoyen.motDePasse } });
  assert.equal(r.statut, 200);
  assert.equal(r.corps.role, 'citoyen');
  const charge = jwt.verify(r.corps.jeton, config.jwtSecret);
  assert.equal(charge.sub, r.corps.utilisateur.id);
  assert.equal(charge.role, 'citoyen');
  assert.ok(charge.exp > charge.iat);
});

test('S1.2 connexion : mot de passe faux et email inconnu donnent le même 401', async () => {
  const faux = await appeler('POST', '/auth/login', { corps: { email: citoyen.email, motDePasse: 'mauvais-mot-de-passe' } });
  const inconnu = await appeler('POST', '/auth/login', { corps: { email: 'inconnu@exemple.test', motDePasse: 'MotDePasseTest123' } });
  assert.equal(faux.statut, 401);
  assert.equal(inconnu.statut, 401);
  assert.deepEqual(faux.corps, inconnu.corps);
});

test('Sécurité : tentative d\'injection d\'opérateur MongoDB à la connexion => 400', async () => {
  const r = await appeler('POST', '/auth/login', { corps: { email: { $gt: '' }, motDePasse: { $gt: '' } } });
  assert.equal(r.statut, 400);
});

test('Compte bloqué : connexion refusée (401) et jeton déjà émis inutilisable', async () => {
  const hache = await bcrypt.hash('MotDePasseTest123', 4);
  await User.create({ nom: 'Bloque', email: 'bloque@exemple.test', motDePasseHache: hache });
  const ok = await appeler('POST', '/auth/login', { corps: { email: 'bloque@exemple.test', motDePasse: 'MotDePasseTest123' } });
  assert.equal(ok.statut, 200);

  await User.updateOne({ email: 'bloque@exemple.test' }, { bloque: true });
  const refus = await appeler('POST', '/auth/login', { corps: { email: 'bloque@exemple.test', motDePasse: 'MotDePasseTest123' } });
  assert.equal(refus.statut, 401);
  const ancienJeton = await appeler('GET', '/admin/ping', { jeton: ok.corps.jeton });
  assert.equal(ancienJeton.statut, 401);
});

test('S1.3 /admin/ping : 401 sans jeton ou avec un jeton falsifié', async () => {
  assert.equal((await appeler('GET', '/admin/ping')).statut, 401);
  assert.equal((await appeler('GET', '/admin/ping', { jeton: 'abc.def.ghi' })).statut, 401);
  const forge = jwt.sign({ role: 'agent' }, 'un-autre-secret-que-celui-du-serveur-0123456789', { subject: new mongoose.Types.ObjectId().toString() });
  assert.equal((await appeler('GET', '/admin/ping', { jeton: forge })).statut, 401);
});

test('S1.3 /admin/ping : 403 pour un citoyen, 200 pour un agent', async () => {
  const connexionCitoyen = await appeler('POST', '/auth/login', { corps: { email: citoyen.email, motDePasse: citoyen.motDePasse } });
  const refus = await appeler('GET', '/admin/ping', { jeton: connexionCitoyen.corps.jeton });
  assert.equal(refus.statut, 403);

  const hache = await bcrypt.hash('MotDePasseAgent123', 4);
  await User.create({ nom: 'Agent Test', email: 'agent@exemple.test', motDePasseHache: hache, role: 'agent' });
  const connexionAgent = await appeler('POST', '/auth/login', { corps: { email: 'agent@exemple.test', motDePasse: 'MotDePasseAgent123' } });
  assert.equal(connexionAgent.corps.role, 'agent');
  const ok = await appeler('GET', '/admin/ping', { jeton: connexionAgent.corps.jeton });
  assert.equal(ok.statut, 200);
  assert.equal(ok.corps.agent.role, 'agent');
});
