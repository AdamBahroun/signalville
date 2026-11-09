// Tests purs : distance, centre et validation des coordonnées.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { distanceMetres, centre, coordonneesValides } = require('../src/services/geo');

test('distance : un millième de degré de latitude vaut environ 111 m', () => {
  const d = distanceMetres([10.7357, 36.4513], [10.7357, 36.4523]);
  assert.ok(d > 110 && d < 112, `distance obtenue : ${d}`);
});

test('distance : même point = 0, et la distance est symétrique', () => {
  const a = [10.7357, 36.4513];
  const b = [10.74, 36.45];
  assert.equal(distanceMetres(a, a), 0);
  assert.ok(Math.abs(distanceMetres(a, b) - distanceMetres(b, a)) < 1e-6);
});

test('centre : moyenne des points', () => {
  assert.deepEqual(centre([[10, 36], [12, 38]]), [11, 37]);
  assert.equal(centre([]), null);
});

test('coordonnées : valeurs hors limites, texte et NaN refusés', () => {
  assert.equal(coordonneesValides(10.7, 36.4), true);
  assert.equal(coordonneesValides(200, 36.4), false);
  assert.equal(coordonneesValides(10.7, 95), false);
  assert.equal(coordonneesValides('10.7', 36.4), false);
  assert.equal(coordonneesValides(NaN, 36.4), false);
});
