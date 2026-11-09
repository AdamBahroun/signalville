// DONNÉES DE DÉMONSTRATION : l'API des incidents n'est pas encore branchée.
// Position approximative : centre de Nabeul. Les scores sont calculés par la formule RG4, pas écrits à la main.
export const INCIDENTS_DEMO = [
  { id: 1, categorie: 'coupure_eau', nbUtilisateurs: 9, ageJours: 2, statut: 'Nouveau', lat: 36.4531, lng: 10.7402, lieu: 'Quartier centre' },
  { id: 2, categorie: 'nid_de_poule', nbUtilisateurs: 6, ageJours: 5, statut: 'Pris en charge', lat: 36.4489, lng: 10.7311, lieu: "Devant l'école" },
  { id: 3, categorie: 'coupure_electricite', nbUtilisateurs: 3, ageJours: 4, statut: 'Nouveau', lat: 36.4562, lng: 10.7288, lieu: 'Route de Hammamet' },
  { id: 4, categorie: 'dechets', nbUtilisateurs: 3, ageJours: 8, statut: 'Résolu', lat: 36.4467, lng: 10.7405, lieu: 'Rue du marché' },
  { id: 5, categorie: 'eclairage', nbUtilisateurs: 4, ageJours: 3, statut: 'Nouveau', lat: 36.4511, lng: 10.7367, lieu: 'Avenue principale' },
  { id: 6, categorie: 'nid_de_poule', nbUtilisateurs: 2, ageJours: 1, statut: 'Nouveau', lat: 36.4544, lng: 10.7339, lieu: 'Carrefour nord' },
  { id: 7, categorie: 'eclairage', nbUtilisateurs: 1, ageJours: 6, statut: 'Pris en charge', lat: 36.4478, lng: 10.7352, lieu: 'Impasse des Jasmins' },
  { id: 8, categorie: 'dechets', nbUtilisateurs: 2, ageJours: 1, statut: 'Nouveau', lat: 36.4503, lng: 10.7425, lieu: 'Place de la gare' },
];
export const STATUTS = ['Nouveau', 'Pris en charge', 'Résolu', 'Rejeté'];
