// Tests d'intégration du Sprint 2 : signalement avec photo, incidents proches, catégories, documentation Swagger.
// Prérequis : MongoDB lancé (base "tuniins_test", vidée au début des tests).
process.env.NODE_ENV = 'test';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../src/config');
const app = require('../src/app');
const openapi = require('../src/openapi');
const User = require('../src/models/User');
const Incident = require('../src/models/Incident');
const Report = require('../src/models/Report');
const Confirmation = require('../src/models/Confirmation');
const Category = require('../src/models/Category');
const { DOSSIER } = require('../src/services/photos');

let serveur;
let base;
let jetonCitoyen;
let jetonAgent;
let citoyen;
const fichiersCrees = [];

const { lat: LAT, lng: LNG } = config.commune;
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF-fausse-image-pour-les-tests')]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('PNG-fausse-image-pour-les-tests')]);

const jetonPour = (u) => jwt.sign({ role: u.role }, config.jwtSecret, { subject: u.id, expiresIn: '1h', algorithm: 'HS256' });
const lire = async (reponse) => {
  const texte = await reponse.text();
  let corps = null;
  try {
    corps = texte ? JSON.parse(texte) : null;
  } catch {
    corps = texte;
  }
  return { statut: reponse.status, corps, entetes: reponse.headers };
};
const get = async (chemin, jeton) => lire(await fetch(base + chemin, { headers: jeton ? { Authorization: `Bearer ${jeton}` } : {} }));
const postJson = async (chemin, corps, jeton) =>
  lire(await fetch(base + chemin, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(jeton ? { Authorization: `Bearer ${jeton}` } : {}) }, body: JSON.stringify(corps) }));
// Envoi multipart : tous les champs sont des textes, comme le fera l'application mobile.
const postPhoto = async ({ champs = {}, fichier, nomFichier = 'photo.jpg', type = 'image/jpeg', jeton = jetonCitoyen } = {}) => {
  const form = new FormData();
  const valeurs = { categorie: 'nid_de_poule', description: 'Trou profond devant la mairie', lat: String(LAT), lng: String(LNG), ...champs };
  for (const [k, v] of Object.entries(valeurs)) if (v !== undefined) form.append(k, v);
  if (fichier) form.append('photo', new Blob([fichier], { type }), nomFichier);
  return lire(await fetch(base + '/reports', { method: 'POST', headers: jeton ? { Authorization: `Bearer ${jeton}` } : {}, body: form }));
};
const fichiersUploads = () => (fs.existsSync(DOSSIER) ? fs.readdirSync(DOSSIER) : []);

before(async () => {
  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  assert.match(mongoose.connection.name, /test/i, 'La base utilisée par les tests doit contenir "test" dans son nom.');
  await mongoose.connection.dropDatabase();
  await Promise.all([User, Incident, Report, Confirmation, Category].map((m) => m.syncIndexes()));
  await Category.assurerCategories();
  serveur = app.listen(0);
  base = `http://127.0.0.1:${serveur.address().port}`;
  const hache = await bcrypt.hash('MotDePasseTest123', 4);
  citoyen = await User.create({ nom: 'Citoyen Photo', email: 'photo@exemple.test', motDePasseHache: hache });
  const agent = await User.create({ nom: 'Agent', email: 'agent-photo@exemple.test', motDePasseHache: hache, role: 'agent' });
  jetonCitoyen = jetonPour(citoyen);
  jetonAgent = jetonPour(agent);
});

after(async () => {
  // On supprime uniquement les photos créées par ces tests, jamais tout le dossier.
  for (const nom of fichiersCrees) fs.rmSync(path.join(DOSSIER, nom), { force: true });
  serveur.close();
  await mongoose.disconnect();
});

test('Signalement avec photo JPEG : 201, URL relative aléatoire, fichier écrit puis servi sur /uploads', async () => {
  const r = await postPhoto({ fichier: JPEG, nomFichier: '../../etc/passwd.jpg' }); // un nom piégé ne doit rien changer
  assert.equal(r.statut, 201, JSON.stringify(r.corps));
  assert.match(r.corps.photoUrl, /^\/uploads\/[0-9a-f]{32}\.jpg$/);
  const nom = path.basename(r.corps.photoUrl);
  fichiersCrees.push(nom);
  assert.ok(fs.existsSync(path.join(DOSSIER, nom)));

  const stocke = await Report.findById(r.corps.reportId).lean();
  assert.equal(stocke.photoUrl, r.corps.photoUrl);
  assert.deepEqual(stocke.position.coordinates, [LNG, LAT], 'lat et lng reçus en texte sont convertis en nombres');

  const image = await fetch(base + r.corps.photoUrl);
  assert.equal(image.status, 200);
  assert.equal(image.headers.get('content-type'), 'image/jpeg');
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(image.headers.get('cross-origin-resource-policy'), 'cross-origin');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), JPEG);
});

test('Signalement avec photo PNG accepté', async () => {
  const r = await postPhoto({ fichier: PNG, nomFichier: 'p.png', type: 'image/png', champs: { description: 'Lampadaire éteint', categorie: 'eclairage' } });
  assert.equal(r.statut, 201, JSON.stringify(r.corps));
  assert.match(r.corps.photoUrl, /\.png$/);
  fichiersCrees.push(path.basename(r.corps.photoUrl));
});

test('Signalement multipart sans photo : accepté, photoUrl vide', async () => {
  const r = await postPhoto({ champs: { description: 'Sans photo' } });
  assert.equal(r.statut, 201);
  assert.equal(r.corps.photoUrl, null);
});

test('Le format JSON (Sprint 1) fonctionne toujours', async () => {
  const r = await postJson('/reports', { categorie: 'dechets', description: 'Poubelles débordantes', lat: LAT, lng: LNG }, jetonCitoyen);
  assert.equal(r.statut, 201);
  assert.equal(r.corps.photoUrl, null);
});

test('Faux fichier image (texte renommé en .jpg avec un Content-Type menteur) : 400, rien écrit sur le disque', async () => {
  const avant = fichiersUploads().length;
  const r = await postPhoto({ fichier: Buffer.from('<?php echo "pas une image"; ?>'), nomFichier: 'photo.jpg', type: 'image/jpeg' });
  assert.equal(r.statut, 400);
  assert.match(r.corps.erreur, /JPEG ou PNG/);
  assert.equal(fichiersUploads().length, avant);
});

test('Photo de plus de 5 Mo : 413', async () => {
  const grosse = Buffer.concat([JPEG, Buffer.alloc(5 * 1024 * 1024 + 10)]);
  const r = await postPhoto({ fichier: grosse });
  assert.equal(r.statut, 413);
});

test('Position hors de la commune avec photo : 400 et aucun fichier orphelin (RG9)', async () => {
  const avant = fichiersUploads().length;
  const r = await postPhoto({ fichier: JPEG, champs: { lat: '36.80', lng: '10.18' } }); // Tunis, hors zone
  assert.equal(r.statut, 400);
  assert.match(r.corps.erreur, /zone de la commune/);
  assert.equal(fichiersUploads().length, avant);
});

test('Champs multipart invalides : lat texte non numérique et description trop courte : 400', async () => {
  const r = await postPhoto({ champs: { lat: 'abc', description: 'x' } });
  assert.equal(r.statut, 400);
  assert.ok(r.corps.details.position);
  assert.ok(r.corps.details.description);
});

test('Catégorie inconnue avec photo : 400 et le fichier écrit est supprimé', async () => {
  const avant = fichiersUploads().length;
  const r = await postPhoto({ fichier: JPEG, champs: { categorie: 'inexistante' } });
  assert.equal(r.statut, 400);
  assert.equal(fichiersUploads().length, avant);
});

test('Envoi de photo sans jeton : 401 ; avec un jeton agent : 403', async () => {
  assert.equal((await postPhoto({ fichier: JPEG, jeton: null })).statut, 401);
  assert.equal((await postPhoto({ fichier: JPEG, jeton: jetonAgent })).statut, 403);
});

test('Plusieurs fichiers dans un seul envoi : 400', async () => {
  const form = new FormData();
  form.append('categorie', 'dechets');
  form.append('photo', new Blob([JPEG], { type: 'image/jpeg' }), 'a.jpg');
  form.append('photo', new Blob([JPEG], { type: 'image/jpeg' }), 'b.jpg');
  const r = await lire(await fetch(base + '/reports', { method: 'POST', headers: { Authorization: `Bearer ${jetonCitoyen}` }, body: form }));
  assert.equal(r.statut, 400);
});

test('/uploads : pas de listing du dossier, pas de sortie du dossier', async () => {
  assert.equal((await fetch(base + '/uploads/')).status, 404);
  assert.equal((await fetch(base + '/uploads/..%2F..%2Fpackage.json')).status, 404);
  assert.equal((await fetch(base + '/uploads/%2e%2e/package.json')).status, 404);
});

test('GET /categories : nom et libellé seulement (ni rayon, ni poids), jeton exigé', async () => {
  assert.equal((await get('/categories')).statut, 401);
  const r = await get('/categories', jetonCitoyen);
  assert.equal(r.statut, 200);
  assert.equal(r.corps.categories.length, 6);
  assert.deepEqual(Object.keys(r.corps.categories[0]).sort(), ['libelle', 'nom']);
});

test('GET /incidents : proches, ouverts, triés par distance, sans score ni identité', async () => {
  await Promise.all([Incident.deleteMany({}), Report.deleteMany({})]);
  // 0,0001 degré de latitude vaut environ 11 m. Un nid-de-poule au centre, un à environ 1,1 km, un éclairage au centre.
  await postJson('/reports', { categorie: 'nid_de_poule', description: 'Trou au centre', lat: LAT, lng: LNG }, jetonCitoyen);
  await postJson('/reports', { categorie: 'nid_de_poule', description: 'Trou loin', lat: LAT + 0.01, lng: LNG }, jetonCitoyen);
  await postJson('/reports', { categorie: 'eclairage', description: 'Lampadaire éteint', lat: LAT, lng: LNG }, jetonCitoyen);
  const [loin] = await Incident.find({ categorie: 'nid_de_poule', 'positionCentrale.coordinates.1': { $gt: LAT + 0.005 } });
  await Incident.updateOne({ _id: loin._id }, { $set: { statut: 'resolu' } }); // un incident résolu n'apparaît pas sur la carte

  const r = await get(`/incidents?lat=${LAT}&lng=${LNG}&rayon=3000`, jetonCitoyen);
  assert.equal(r.statut, 200, JSON.stringify(r.corps));
  assert.equal(r.corps.incidents.length, 2, 'le résolu est exclu');
  for (const i of r.corps.incidents) {
    assert.ok(i.distanceMetres <= 5);
    assert.equal(i.score, undefined);
    assert.equal(i.historique, undefined);
    assert.equal(i.utilisateur, undefined);
    assert.ok(i.libelle);
  }
  const filtre = await get(`/incidents?lat=${LAT}&lng=${LNG}&categorie=eclairage`, jetonCitoyen);
  assert.deepEqual(filtre.corps.incidents.map((i) => i.categorie), ['eclairage']);

  // Rayon trop petit pour atteindre un incident à environ 1,1 km : on remet l'incident lointain en nouveau pour le vérifier.
  await Incident.updateOne({ _id: loin._id }, { $set: { statut: 'nouveau' } });
  const petit = await get(`/incidents?lat=${LAT}&lng=${LNG}&rayon=500&categorie=nid_de_poule`, jetonCitoyen);
  assert.equal(petit.corps.incidents.length, 1);
  const grand = await get(`/incidents?lat=${LAT}&lng=${LNG}&rayon=2000&categorie=nid_de_poule`, jetonCitoyen);
  assert.equal(grand.corps.incidents.length, 2);
  assert.ok(grand.corps.incidents[0].distanceMetres <= grand.corps.incidents[1].distanceMetres);
});

test('GET /incidents : paramètres invalides (400), sans jeton (401), agent refusé (403), injection d\'opérateur refusée', async () => {
  assert.equal((await get('/incidents', jetonCitoyen)).statut, 400);
  assert.equal((await get(`/incidents?lat=${LAT}`, jetonCitoyen)).statut, 400);
  assert.equal((await get(`/incidents?lat=abc&lng=${LNG}`, jetonCitoyen)).statut, 400);
  assert.equal((await get(`/incidents?lat=${LAT}&lng=${LNG}&rayon=99999`, jetonCitoyen)).statut, 400);
  assert.equal((await get(`/incidents?lat=${LAT}&lng=${LNG}&rayon=1.5`, jetonCitoyen)).statut, 400);
  assert.equal((await get(`/incidents?lat=${LAT}&lat=${LAT}&lng=${LNG}`, jetonCitoyen)).statut, 400, 'paramètre répété');
  assert.equal((await get(`/incidents?lat=${LAT}&lng=${LNG}&categorie=a&categorie=b`, jetonCitoyen)).statut, 400, 'categorie répétée arrive en tableau');
  // Express 5 n'interprète pas la notation categorie[$ne] : la clé est ignorée comme un paramètre inconnu, l'opérateur n'atteint jamais MongoDB.
  const sans = await get(`/incidents?lat=${LAT}&lng=${LNG}`, jetonCitoyen);
  const piege = await get(`/incidents?lat=${LAT}&lng=${LNG}&categorie[$ne]=x`, jetonCitoyen);
  assert.equal(piege.statut, 200);
  assert.deepEqual(piege.corps, sans.corps);
  assert.equal((await get(`/incidents?lat=${LAT}&lng=${LNG}`)).statut, 401);
  assert.equal((await get(`/incidents?lat=${LAT}&lng=${LNG}`, jetonAgent)).statut, 403);
});

test('Swagger : /docs répond et la description OpenAPI couvre les routes principales', async () => {
  const page = await fetch(base + '/docs/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /swagger-ui/i);
  const attendues = ['/health', '/auth/register', '/auth/login', '/categories', '/reports', '/incidents', '/admin/incidents', '/admin/incidents/{id}/status', '/admin/heatmap', '/admin/stats'];
  for (const chemin of attendues) assert.ok(openapi.paths[chemin], `absent de la documentation : ${chemin}`);
});
