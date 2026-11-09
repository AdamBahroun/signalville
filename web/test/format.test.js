import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formaterScore, formaterJours, lienSur, formaterDate, LIBELLES_STATUT, STATUTS } from '../src/format.js';

test('le score est affiché avec une décimale et une virgule', () => {
  assert.equal(formaterScore(46), '46,0');
  assert.equal(formaterScore(20.5), '20,5');
  assert.equal(formaterScore(4.5), '4,5');
});

test('ancienneté : singulier et pluriel', () => {
  assert.equal(formaterJours(0), '0 jour');
  assert.equal(formaterJours(1), '1 jour');
  assert.equal(formaterJours(5), '5 jours');
});

test('lien de photo : http(s) et chemins relatifs seulement', () => {
  assert.equal(lienSur('https://exemple.tn/photo.jpg'), true);
  assert.equal(lienSur('/uploads/photo.jpg'), true);
  assert.equal(lienSur('javascript:alert(1)'), false);
  assert.equal(lienSur('data:text/html;base64,AAAA'), false);
  assert.equal(lienSur(null), false);
});

test('date invalide : chaîne vide ; chaque statut a un libellé', () => {
  assert.equal(formaterDate('pas une date'), '');
  for (const s of STATUTS) assert.ok(LIBELLES_STATUT[s]);
});
