// Règle de gestion RG4 : score = poids de la catégorie x utilisateurs distincts + 0,5 x jours depuis le premier signalement.
export const CATEGORIES = {
  coupure_eau: { libelle: "Coupure d'eau", poids: 5 },
  coupure_electricite: { libelle: "Coupure d'électricité", poids: 5 },
  nid_de_poule: { libelle: 'Nid-de-poule', poids: 3 },
  eclairage: { libelle: 'Éclairage', poids: 2 },
  dechets: { libelle: 'Déchets', poids: 2 },
  autre: { libelle: 'Autre', poids: 1 },
};

export function calculerScore(categorie, nbUtilisateurs, ageJours) {
  const poids = CATEGORIES[categorie]?.poids ?? CATEGORIES.autre.poids;
  return poids * nbUtilisateurs + 0.5 * ageJours;
}
