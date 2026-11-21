// Cycle de vie d'un incident (RG7). Module pur : aucune base de données, donc facile à tester.
const STATUTS = ['nouveau', 'pris_en_charge', 'resolu', 'rejete'];
const STATUTS_OUVERTS = ['nouveau', 'pris_en_charge']; // seuls ces incidents absorbent de nouveaux signalements (RG3)

const LIBELLES = {
  nouveau: 'Nouveau',
  pris_en_charge: 'Pris en charge',
  resolu: 'Résolu',
  rejete: 'Rejeté',
};

// Transitions autorisées : Nouveau > Pris en charge > Résolu ; Nouveau ou Pris en charge > Rejeté ; Résolu > Pris en charge (réouverture).
const TRANSITIONS = {
  nouveau: ['pris_en_charge', 'rejete'],
  pris_en_charge: ['resolu', 'rejete'],
  resolu: ['pris_en_charge'],
  rejete: [],
};

// RG7 : vrai si le passage de de vers vers est autorisé.
const transitionAutorisee = (de, vers) => (TRANSITIONS[de] || []).includes(vers);

// Le motif est obligatoire pour un rejet et pour une réouverture (RG7).
const motifObligatoire = (de, vers) => vers === 'rejete' || (de === 'resolu' && vers === 'pris_en_charge');

module.exports = { STATUTS, STATUTS_OUVERTS, LIBELLES, TRANSITIONS, transitionAutorisee, motifObligatoire };
