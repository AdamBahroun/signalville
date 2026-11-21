# TuniIns : API

Node.js, Express 5, MongoDB (Mongoose), JWT. Prérequis : Node.js 22.12 ou plus (ou 20.19 ou plus) et MongoDB.

## Lancer

```
npm install
cp .env.example .env     # remplir JWT_SECRET
npm run dev              # http://localhost:3000
```

`GET /health` répond 200 quand l'API est connectée à la base. Au démarrage, l'API crée les index (dont l'index géospatial 2dsphere) et les six catégories par défaut.

## Scripts

| Commande | Rôle |
|---|---|
| `npm run dev` | API avec rechargement automatique |
| `npm run creer-agent -- --email ... --motdepasse ...` | crée ou promeut le compte administrateur (aucune route publique pour cela, volontairement) |
| `npm run donnees-demo` | génère les données de démonstration ; `-- --reset` pour tout régénérer |
| `npm test` | tests purs, puis tests d'intégration (MongoDB requis), un fichier à la fois car ils partagent la base `tuniins_test` |

## Routes

| Méthode | Route | Accès | Rôle |
|---|---|---|---|
| POST | /auth/register | public | inscription d'un citoyen |
| POST | /auth/login | public | connexion, renvoie le jeton JWT |
| GET | /categories | citoyen | catégories (nom et libellé) pour le formulaire de signalement |
| POST | /reports | citoyen | créer un signalement, en JSON ou en multipart avec une photo (regroupement automatique, RG6 et RG9 contrôlées) |
| GET | /incidents | citoyen | incidents ouverts proches d'une position (`lat`, `lng`, `rayon`, `categorie`), pour la carte mobile ; indique si l'utilisateur a signalé (`monSignalement`) ou confirmé (`dejaConfirme`) chaque incident |
| POST | /incidents/:id/confirm | citoyen | « moi aussi » : confirmer un incident ouvert (RG5, une seule fois). Corps `{ lat, lng }` obligatoire : refusé à plus de 1 000 m de l'incident et au-delà de 20 confirmations par jour (RG10) |
| GET | /me/reports | citoyen | mes signalements, avec le statut de l'incident et l'historique (statut, date, motif) |
| POST | /me/device-token | citoyen | enregistre le jeton Firebase de l'appareil (notifications, facultatif) |
| GET | /uploads/:fichier | public | photo d'un signalement (nom aléatoire, jamais celui du client) |
| GET | /admin/ping | administrateur | vérification du droit d'accès |
| GET | /admin/incidents | administrateur | liste triée par score, filtres `statut` (ou `ouverts`), `categorie`, `page`, `limite` |
| GET | /admin/incidents/:id | administrateur | détail, signalements, historique, transitions possibles |
| PATCH | /admin/incidents/:id/status | administrateur | changer le statut (RG7, RG8) |
| POST | /admin/incidents/:id/fusion | administrateur | fusionner un doublon dans un autre incident |
| POST | /admin/signalements/:id/rejet | administrateur | rejeter un signalement, bloquer l'auteur (facultatif) |
| GET | /admin/utilisateurs | administrateur | liste des citoyens, filtres `q`, `bloque` |
| PATCH | /admin/utilisateurs/:id/blocage | administrateur | bloquer ou débloquer un citoyen |
| GET, PATCH | /admin/categories(/:nom) | administrateur | rayon de regroupement et poids du score |
| GET | /admin/heatmap | administrateur | points de la carte de chaleur |
| GET | /admin/stats | administrateur | statistiques et délai moyen de résolution |

La documentation interactive Swagger est sur **http://localhost:3000/docs** (bouton Authorize : coller le jeton obtenu avec `POST /auth/login`). Le fichier `requetes.http` (extension REST Client de VS Code) et la collection `TuniIns.postman_collection.json` contiennent des exemples prêts à lancer.

## Photos des signalements

- Envoi en `multipart/form-data` : champs `categorie`, `description`, `lat`, `lng` et fichier `photo` (facultatif). Le JSON sans photo reste accepté.
- JPEG ou PNG, 5 Mo maximum, un seul fichier. Le format est vérifié sur les **premiers octets du fichier**, pas sur son nom ni sur le Content-Type envoyé par le client (les deux sont falsifiables).
- Le fichier est enregistré dans `api/uploads/` sous un nom aléatoire de 32 caractères hexadécimaux. Le nom d'origine n'est jamais utilisé.
- La photo n'est écrite qu'après les contrôles RG9 et RG6, et elle est supprimée si l'enregistrement du signalement échoue : pas de fichier orphelin.
- Le dossier `uploads/` est ignoré par Git. L'URL stockée est relative (`/uploads/....jpg`) : le client la complète avec l'adresse de l'API.

## Choix à connaître

- **Le score n'est pas stocké.** Il est recalculé à chaque lecture avec le poids actuel de la catégorie, car l'ancienneté change chaque jour : un score enregistré serait faux dès le lendemain pour tout incident qui ne reçoit plus de signalement.
- **Un incident est « ouvert » s'il est nouveau ou pris en charge** (RG3). Un incident résolu ou rejeté n'absorbe plus rien.
- **Les confirmations « moi aussi » comptent comme des utilisateurs distincts** dans le score.
- **« Moi aussi » (S3.5)** : une confirmation compte comme une personne de plus dans le score, mais ne crée pas de signalement. Elle est refusée (409) si l'incident est résolu ou rejeté (RG3), si l'utilisateur l'a déjà confirmée (RG5, garanti par l'index unique de la base, y compris pour deux requêtes simultanées) ou s'il en est déjà l'auteur (son signalement compte déjà).
- **Suivi citoyen (S3.6)** : `GET /me/reports` renvoie l'historique des statuts avec le motif, sans le nom de l'agent et sans le score. Le citoyen voit ce qui s'est passé, pas qui l'a fait.
- **Photos et vie privée** : un citoyen ne voit jamais les photos des autres citoyens (visages, plaques). Seul l'administrateur les voit, et chacun voit les siennes.
- **Un signalement rejeté reste en base** (traçabilité) mais ne compte plus. S'il était le dernier de son incident, l'incident passe à « Rejeté ».
- **Le rôle « agent » désigne l'administrateur** dans la base et dans les jetons.
- **RG10, « moi aussi » seulement près de l'incident (S4.4)** : la requête envoie la position du téléphone (`{ lat, lng }`, 400 si absente ou invalide). L'API la compare au centre de l'incident et refuse (403, message en français) au-delà de `CONFIRMATION_RAYON_M` (1 000 m par défaut). Une limite de `LIMITE_CONFIRMATIONS_PAR_JOUR` confirmations (20 par défaut, fenêtre glissante de 24 heures) renvoie 429. Ordre des contrôles : incident clos (409), auteur (409), déjà confirmé (409), distance (403), limite (429).
- **Limite connue (RG10)** : la position est déclarée par le client, donc falsifiable. Un utilisateur techniquement habile peut envoyer de fausses coordonnées. Le contrôle décourage l'abus courant (confirmer à distance), il ne l'empêche pas.
- **Notifications Firebase (S4.1)** : à chaque changement de statut (changement par l'administrateur ou incident passé à « Rejeté » par modération), les auteurs et les confirmateurs reçoivent une notification qui ne contient que la catégorie et le nouveau statut, jamais le nom de l'agent, le motif ni le score. L'envoi est lancé en arrière-plan : un échec ne bloque jamais le changement de statut. Les jetons que Firebase déclare invalides sont supprimés. Sans la variable `FIREBASE_SERVICE_ACCOUNT_PATH`, l'API écrit une seule ligne au démarrage et fonctionne normalement. `firebase-admin` n'est chargé que si la variable existe.
- **Limite connue** : le regroupement cherche puis crée, sans verrou. Deux signalements simultanés au même endroit peuvent créer deux incidents. La fusion manuelle existe pour cette raison.
- **Limite connue** : sans réplica MongoDB, la fusion n'est pas transactionnelle.
- La limite de 10 signalements par jour est une fenêtre glissante de 24 heures.
- **`GET /incidents` (citoyen) n'expose ni score, ni historique, ni auteur.** Seul l'administrateur voit le score.
- **Limite connue** : les photos sont stockées sur le disque du serveur, sans compression ni floutage (hors périmètre, section 4 du cahier des charges). L'avertissement vie privée est affiché par l'application mobile avant l'envoi.
- **Limite connue** : la documentation OpenAPI (`src/openapi.js`) est écrite à la main. Un test vérifie que les routes principales y figurent, pas que chaque schéma est exact.
