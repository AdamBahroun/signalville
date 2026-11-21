// Règle RG4 : score = poids de la catégorie x utilisateurs distincts + 0,5 x jours depuis le premier signalement.
// Module pur. Le score n'est jamais stocké : l'ancienneté change chaque jour, un score enregistré serait faux dès le lendemain.
const MS_PAR_JOUR = 24 * 60 * 60 * 1000;

// Nombre de jours entiers écoulés depuis une date.
function joursDepuis(date, maintenant = new Date()) {
  return Math.max(0, Math.floor((maintenant.getTime() - new Date(date).getTime()) / MS_PAR_JOUR));
}

// RG4 : score de priorité d'un incident (poids de la catégorie, personnes distinctes, ancienneté).
function calculerScore({ poids, nbUtilisateurs, premierSignalement }, maintenant = new Date()) {
  return poids * nbUtilisateurs + 0.5 * joursDepuis(premierSignalement, maintenant);
}

module.exports = { calculerScore, joursDepuis, MS_PAR_JOUR };
