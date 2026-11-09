// Tests purs (sans base de données) : formule RG4 et poids des catégories.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { calculerScore, joursDepuis, MS_PAR_JOUR } = require('../src/services/score');

const maintenant = new Date('2026-10-19T12:00:00Z');
const ilYaJours = (n) => new Date(maintenant.getTime() - n * MS_PAR_JOUR);

// Les quatre valeurs de la maquette web (figure 12 du dossier de conception) doivent être retrouvées par la formule RG4.
test('RG4 : les scores de la maquette web sont reproduits (46,0 / 20,5 / 9,5 / 4,5)', () => {
  assert.equal(calculerScore({ poids: 5, nbUtilisateurs: 9, premierSignalement: ilYaJours(2) }, maintenant), 46.0);
  assert.equal(calculerScore({ poids: 3, nbUtilisateurs: 6, premierSignalement: ilYaJours(5) }, maintenant), 20.5);
  assert.equal(calculerScore({ poids: 2, nbUtilisateurs: 4, premierSignalement: ilYaJours(3) }, maintenant), 9.5);
  assert.equal(calculerScore({ poids: 2, nbUtilisateurs: 2, premierSignalement: ilYaJours(1) }, maintenant), 4.5);
});

test("RG4 : l'ancienneté compte en jours entiers et ne devient jamais négative", () => {
  assert.equal(joursDepuis(new Date(maintenant.getTime() - 3.9 * MS_PAR_JOUR), maintenant), 3);
  assert.equal(joursDepuis(new Date(maintenant.getTime() + MS_PAR_JOUR), maintenant), 0);
});

test('RG4 : le score change avec le poids de la catégorie (poids modifiable par l\'administrateur)', () => {
  const base = { nbUtilisateurs: 4, premierSignalement: ilYaJours(0) };
  assert.equal(calculerScore({ ...base, poids: 2 }, maintenant), 8);
  assert.equal(calculerScore({ ...base, poids: 5 }, maintenant), 20);
});
