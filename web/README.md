# TuniIns : site web d'administration

React + Vite + react-leaflet. Prérequis : **Node.js 20.19 ou plus** (ou 22.12 ou plus), exigé par Vite 8. Vérifier avec `node -v`.

## Lancer

1. Démarrer l'API (dossier `api`, voir le README à la racine) : `npm run dev`, sur le port 3000.
2. Créer un compte administrateur si ce n'est pas fait : `npm run creer-agent -- --email admin@exemple.test --motdepasse "..."` (dans `api`).
3. Générer des données : `npm run donnees-demo` (dans `api`).
4. Dans ce dossier :

```
npm install
npm run dev
```

5. Ouvrir http://localhost:5173 et se connecter avec le compte administrateur.

Les appels `/api/...` sont redirigés vers `http://localhost:3000` par le proxy de `vite.config.js` (pas de configuration CORS à faire). Si l'API tourne sur un autre port, modifier la cible dans ce fichier.

## Écrans

| Onglet | Contenu |
|---|---|
| Incidents | liste triée par priorité, filtres par statut et catégorie, pagination, carte OpenStreetMap |
| Détail (depuis la liste) | signalements rattachés, carte, changement de statut avec motif, historique, rejet d'un signalement avec blocage de l'auteur, fusion de doublons |
| Carte de chaleur | incidents ouverts pondérés par leur nombre de signalements |
| Statistiques | totaux, incidents par statut et par catégorie, délai moyen de résolution |
| Utilisateurs | recherche, blocage et déblocage des citoyens |
| Paramètres | rayon de regroupement et poids de chaque catégorie |

Tout vient de l'API : le site ne recalcule ni le score ni les règles de transition. Il affiche ce que l'API renvoie.

## Session

- Le jeton est conservé dans `sessionStorage` : il disparaît à la fermeture de l'onglet.
- Un jeton expiré, un compte bloqué ou une réponse 401 renvoient à l'écran de connexion.
- Un compte citoyen qui essaie de se connecter est refusé (l'API répond 403 sur `/admin/ping`).

## Tests et build

```
npm test         # formats d'affichage
npm run build    # produit le dossier dist
```

## Fichiers

```
src/main.jsx            point d'entrée
src/App.jsx             session, navigation par onglets
src/Login.jsx           connexion
src/Incidents.jsx       liste priorisée, filtres, carte
src/IncidentDetail.jsx  détail, statut, rejet, fusion
src/CarteChaleur.jsx    carte de chaleur (plugin leaflet.heat)
src/Statistiques.jsx    statistiques
src/Utilisateurs.jsx    modération des comptes
src/Parametres.jsx      rayon et poids des catégories
src/api.js              appels à l'API et session
src/format.js           libellés, couleurs, formats
src/styles.css          styles
```
