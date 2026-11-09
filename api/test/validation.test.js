// Tests purs : validation des entrées de l'administration (types vérifiés, pas d'injection d'opérateur).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const v = require('../src/validation');

test('identifiant : 24 caractères hexadécimaux exigés', () => {
  assert.equal(v.estIdObjet('507f1f77bcf86cd799439011'), true);
  assert.equal(v.estIdObjet('abcdefghijkl'), false); // 12 caractères : accepté par isValidObjectId, refusé ici
  assert.equal(v.estIdObjet({ $gt: '' }), false);
});

test('filtres incidents : valeurs par défaut et rejet des valeurs invalides', () => {
  assert.deepEqual(v.validerFiltresIncidents({}).valeurs, { statut: '', categorie: '', page: 1, limite: 50 });
  assert.deepEqual(v.validerFiltresIncidents({ statut: 'ouverts', page: '2', limite: '20' }).valeurs, { statut: 'ouverts', categorie: '', page: 2, limite: 20 });
  assert.ok(v.validerFiltresIncidents({ statut: 'inconnu' }).details.statut);
  assert.ok(v.validerFiltresIncidents({ limite: '1000' }).details.limite);
  assert.ok(v.validerFiltresIncidents({ page: '0' }).details.page);
  assert.ok(v.validerFiltresIncidents({ categorie: ['a', 'b'] }).details.categorie);
});

test('changement de statut : statut connu obligatoire, motif de 500 caractères maximum', () => {
  assert.ok(v.validerChangementStatut({ statut: 'inconnu' }).details.statut);
  assert.ok(v.validerChangementStatut({ statut: 'resolu', motif: 'x'.repeat(501) }).details.motif);
  assert.ok(v.validerChangementStatut({ statut: 'resolu', motif: { $ne: '' } }).details.motif);
  assert.deepEqual(v.validerChangementStatut({ statut: 'resolu', motif: '  fait  ' }).valeurs, { statut: 'resolu', motif: 'fait' });
});

test('rejet : motif obligatoire, bloquerAuteur booléen', () => {
  assert.ok(v.validerRejet({}).details.motif);
  assert.ok(v.validerRejet({ motif: 'spam', bloquerAuteur: 'oui' }).details.bloquerAuteur);
  assert.deepEqual(v.validerRejet({ motif: 'faux signalement' }).valeurs, { motif: 'faux signalement', bloquerAuteur: false });
});

test('catégorie : rayon entier 1 à 5000, poids entier 0 à 20, au moins une valeur', () => {
  assert.ok(v.validerCategorie({}).details.general);
  assert.ok(v.validerCategorie({ rayonMetres: 0 }).details.rayonMetres);
  assert.ok(v.validerCategorie({ rayonMetres: 12.5 }).details.rayonMetres);
  assert.ok(v.validerCategorie({ poids: 21 }).details.poids);
  assert.deepEqual(v.validerCategorie({ rayonMetres: 40, poids: 4 }).valeurs, { rayonMetres: 40, poids: 4 });
});

test('signalement : catégorie, description 3 à 500 caractères, coordonnées numériques', () => {
  assert.ok(v.validerSignalement({ categorie: 'dechets', description: 'ok', lat: 36.45, lng: 10.73 }).details.description);
  assert.ok(v.validerSignalement({ categorie: 'dechets', description: 'Bac plein', lat: '36.45', lng: 10.73 }).details.position);
  assert.ok(v.validerSignalement({ categorie: { $ne: '' }, description: 'Bac plein', lat: 36.45, lng: 10.73 }).details.categorie);
  assert.ok(v.validerSignalement({ categorie: 'dechets', description: 'Bac plein', lat: 36.45, lng: 10.73 }).valeurs);
});

test('blocage et fusion : types vérifiés', () => {
  assert.ok(v.validerBlocage({ bloque: 'true' }).details.bloque);
  assert.equal(v.validerBlocage({ bloque: true }).valeurs.bloque, true);
  assert.ok(v.validerFusion({ cibleId: 'pas-un-id' }).details.cibleId);
  assert.ok(v.validerFusion({ cibleId: '507f1f77bcf86cd799439011' }).valeurs);
});
