// Tests d'intégration des notifications (S4.1) : jeton d'appareil, envoi au changement de statut, échecs sans effet.
// L'envoi Firebase est remplacé par un faux envoyeur : aucun appel réseau. MongoDB doit tourner (base tuniins_test).
process.env.NODE_ENV = 'test'; // AVANT tout require : sinon la configuration pointerait vers la vraie base

const { test, before, after, beforeEach, afterEach } = require('node:test');
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
const notifications = require('../src/services/notifications');
const { LIBELLES } = require('../src/services/statuts');

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
  notifications.definirEnvoyeur(null); // Firebase désactivé par défaut
});

after(async () => {
  await new Promise((ok) => serveur.close(ok));
  await mongoose.disconnect();
});

afterEach(() => notifications.definirEnvoyeur(null));

const JETON_A = 'jeton-appareil-amel-'.padEnd(40, 'a');
const JETON_B = 'jeton-appareil-bilel-'.padEnd(40, 'b');
const JETON_C = 'jeton-appareil-chedi-'.padEnd(40, 'c');
const enregistrer = (jeton, jetonAppareil) => appeler('POST', '/me/device-token', { jeton, corps: { jetonAppareil } });

// A signale, B confirme, C n'a rien à voir avec l'incident ; chacun enregistre son appareil.
async function scenario() {
  const [a, b, c, admin] = [await creerCompte('Amel'), await creerCompte('Bilel'), await creerCompte('Chedi'), await creerCompte('Admin', 'agent')];
  const s = (await signaler(a)).donnees;
  assert.equal((await appeler('POST', `/incidents/${s.incidentId}/confirm`, { jeton: b, corps: NABEUL })).statut, 201);
  for (const [jeton, jetonAppareil] of [[a, JETON_A], [b, JETON_B], [c, JETON_C]]) assert.equal((await enregistrer(jeton, jetonAppareil)).statut, 200);
  return { a, b, c, admin, incidentId: s.incidentId, reportId: s.reportId };
}

test("POST /me/device-token : jeton enregistré (200), refusé sans jeton d'accès (401), pour l'administrateur (403) ou invalide (400)", async () => {
  const a = await creerCompte('Amel');
  const admin = await creerCompte('Admin', 'agent');
  assert.equal((await enregistrer(a, JETON_A)).statut, 200);
  assert.equal(await DeviceToken.countDocuments(), 1);
  assert.equal((await appeler('POST', '/me/device-token', { corps: { jetonAppareil: JETON_A } })).statut, 401);
  assert.equal((await enregistrer(admin, JETON_A)).statut, 403);
  assert.equal((await enregistrer(a, 'court')).statut, 400);
  assert.equal((await appeler('POST', '/me/device-token', { jeton: a, corps: { jetonAppareil: { $gt: '' } } })).statut, 400);
});

test('POST /me/device-token : un jeton est réattribué au dernier compte connecté et reste unique', async () => {
  const [a, b] = [await creerCompte('Amel'), await creerCompte('Bilel')];
  await enregistrer(a, JETON_A);
  await enregistrer(a, JETON_A); // même jeton deux fois : pas de doublon
  assert.equal(await DeviceToken.countDocuments(), 1);
  await enregistrer(b, JETON_A); // même téléphone, autre compte
  const enBase = await DeviceToken.find();
  assert.equal(enBase.length, 1);
  assert.equal(String(enBase[0].utilisateur), String((await User.findOne({ email: 'bilel@exemple.test' }))._id));
});

test('POST /me/device-token : seuls les 5 appareils les plus récents sont conservés', async () => {
  const a = await creerCompte('Amel');
  for (let i = 0; i < 7; i++) assert.equal((await enregistrer(a, `jeton-appareil-numero-${i}`.padEnd(40, 'x'))).statut, 200);
  assert.equal(await DeviceToken.countDocuments(), 5);
  assert.ok(await DeviceToken.exists({ jeton: 'jeton-appareil-numero-6'.padEnd(40, 'x') }));
});

test("changement de statut : l'auteur et le confirmateur sont notifiés, pas les autres, avec catégorie et statut seulement", async () => {
  const { admin, incidentId } = await scenario();
  const envois = [];
  notifications.definirEnvoyeur(async (envoi) => {
    envois.push(envoi);
    return { invalides: [] };
  });
  const r = await changerStatut(admin, incidentId, 'pris_en_charge', 'Équipe prévenue');
  assert.equal(r.statut, 200);
  await notifications.attendreEnvois();

  assert.equal(envois.length, 1);
  assert.deepEqual([...envois[0].jetons].sort(), [JETON_A, JETON_B]);
  const categorie = await Category.findOne({ nom: 'nid_de_poule' });
  assert.deepEqual(envois[0].donnees, { categorie: categorie.libelle, statut: LIBELLES.pris_en_charge });
  // Vie privée : ni le nom de l'agent, ni le motif, ni le score dans ce qui part vers Firebase.
  assert.doesNotMatch(JSON.stringify(envois[0]), /Admin|admin|Équipe|score/);
});

test('jetons que Firebase déclare invalides : supprimés de la base, les autres restent', async () => {
  const { admin, incidentId } = await scenario();
  notifications.definirEnvoyeur(async () => ({ invalides: [JETON_A] }));
  assert.equal((await changerStatut(admin, incidentId, 'pris_en_charge', 'Équipe prévenue')).statut, 200);
  await notifications.attendreEnvois();
  assert.equal(await DeviceToken.exists({ jeton: JETON_A }), null);
  assert.ok(await DeviceToken.exists({ jeton: JETON_B }));
  assert.ok(await DeviceToken.exists({ jeton: JETON_C }));
});

test("un échec d'envoi ne bloque ni ne fait échouer le changement de statut", async () => {
  const { admin, incidentId } = await scenario();
  notifications.definirEnvoyeur(async () => {
    throw new Error('Firebase indisponible');
  });
  const avertir = console.warn;
  console.warn = () => {}; // le message d'échec est attendu : on évite de polluer la sortie des tests
  try {
    const r = await changerStatut(admin, incidentId, 'pris_en_charge', 'Équipe prévenue');
    assert.equal(r.statut, 200);
    assert.equal(r.donnees.incident.statut, 'pris_en_charge');
    await notifications.attendreEnvois();
  } finally {
    console.warn = avertir;
  }
  assert.equal((await Incident.findById(incidentId)).statut, 'pris_en_charge');
});

test('sans configuration Firebase : le changement de statut fonctionne et rien n\'est envoyé', async () => {
  const { admin, incidentId } = await scenario();
  assert.equal((await changerStatut(admin, incidentId, 'pris_en_charge', 'Équipe prévenue')).statut, 200);
  const journal = console.log;
  console.log = () => {};
  try {
    assert.equal(notifications.initialiser(), false); // variable FIREBASE_SERVICE_ACCOUNT_PATH ignorée en test
  } finally {
    console.log = journal;
  }
});

test("le rejet du dernier signalement d'un incident (modération) notifie aussi son auteur", async () => {
  const { admin, reportId } = await scenario();
  const envois = [];
  notifications.definirEnvoyeur(async (envoi) => {
    envois.push(envoi);
    return { invalides: [] };
  });
  const r = await appeler('POST', `/admin/signalements/${reportId}/rejet`, { jeton: admin, corps: { motif: 'Signalement abusif' } });
  assert.equal(r.statut, 200);
  await notifications.attendreEnvois();
  assert.equal(envois.length, 1);
  assert.equal(envois[0].donnees.statut, LIBELLES.rejete);
  assert.ok(envois[0].jetons.includes(JETON_A));
});
