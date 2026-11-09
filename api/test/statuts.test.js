// Tests purs : transitions de statut autorisées (RG7).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { STATUTS, transitionAutorisee, motifObligatoire } = require('../src/services/statuts');

test('RG7 : transitions autorisées', () => {
  assert.ok(transitionAutorisee('nouveau', 'pris_en_charge'));
  assert.ok(transitionAutorisee('pris_en_charge', 'resolu'));
  assert.ok(transitionAutorisee('nouveau', 'rejete'));
  assert.ok(transitionAutorisee('pris_en_charge', 'rejete'));
  assert.ok(transitionAutorisee('resolu', 'pris_en_charge'));
});

test('RG7 : toutes les autres transitions sont interdites (11 couples sur 16)', () => {
  const autorisees = new Set(['nouveau>pris_en_charge', 'pris_en_charge>resolu', 'nouveau>rejete', 'pris_en_charge>rejete', 'resolu>pris_en_charge']);
  for (const de of STATUTS) {
    for (const vers of STATUTS) {
      assert.equal(transitionAutorisee(de, vers), autorisees.has(`${de}>${vers}`), `${de} vers ${vers}`);
    }
  }
});

test('RG7 : un incident rejeté est définitif', () => {
  for (const vers of STATUTS) assert.equal(transitionAutorisee('rejete', vers), false);
});

test('RG7 : motif obligatoire pour un rejet et une réouverture seulement', () => {
  assert.equal(motifObligatoire('nouveau', 'rejete'), true);
  assert.equal(motifObligatoire('pris_en_charge', 'rejete'), true);
  assert.equal(motifObligatoire('resolu', 'pris_en_charge'), true);
  assert.equal(motifObligatoire('nouveau', 'pris_en_charge'), false);
  assert.equal(motifObligatoire('pris_en_charge', 'resolu'), false);
});
