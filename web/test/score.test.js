import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculerScore } from '../src/score.js';

// Les quatre valeurs de la maquette (figure 12 du dossier de conception) doivent être retrouvées par la formule RG4.
test('RG4 : les scores de la maquette web sont reproduits', () => {
  assert.equal(calculerScore('coupure_eau', 9, 2), 46.0);
  assert.equal(calculerScore('nid_de_poule', 6, 5), 20.5);
  assert.equal(calculerScore('eclairage', 4, 3), 9.5);
  assert.equal(calculerScore('dechets', 2, 1), 4.5);
});

test('RG4 : catégorie inconnue = poids de "autre"', () => {
  assert.equal(calculerScore('inconnue', 2, 0), 2);
});
