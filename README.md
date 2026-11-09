# SignalVille

Plateforme de signalement citoyen d'incidents (projet d'intégration, Licence DSI 3e année, ISET Nabeul).
Ce dépôt contient pour l'instant le **Sprint 1** : le socle de l'API et l'authentification.

## Contenu du Sprint 1

| Story | Ce que ça fait | Où |
|---|---|---|
| S1.1 | L'API démarre avec `npm run dev`, connectée à MongoDB, `GET /health` répond 200 | `api/src/index.js`, `api/src/app.js` |
| S1.2 | Inscription (`POST /auth/register`) et connexion (`POST /auth/login`) avec jeton JWT | `api/src/routes/auth.js` |
| S1.3 (facultative) | Route `/admin/ping` : 403 pour un citoyen, 200 pour un agent. Agent créé par script | `api/src/routes/admin.js`, `api/scripts/creerAgent.js` |

## Prérequis

- **Node.js 20 ou plus** (vérifier avec `node -v`). Testé avec Node 22.
- **MongoDB Community Server** installé en local et démarré (sous Windows, l'installeur le configure comme service). Alternative : un cluster MongoDB Atlas gratuit, dont l'adresse va dans `MONGODB_URI`.
- Postman (ou l'éditeur HTTP d'IntelliJ / VS Code) pour les appels de démonstration.

## Installation et lancement

Depuis la racine du dépôt :

```
cd api
npm install
copy .env.example .env
```

Sous macOS ou Linux, remplace `copy` par `cp`. Génère ensuite un secret pour les jetons et colle-le dans `.env` à la ligne `JWT_SECRET=` :

```
node -p "require('crypto').randomBytes(48).toString('hex')"
```

Puis lance l'API :

```
npm run dev
```

Tu dois voir `MongoDB connecté : ...` puis `API SignalVille démarrée sur http://localhost:3000`. L'API se relance seule à chaque modification de fichier.

Si l'API refuse de démarrer, le message dit pourquoi : secret JWT absent ou trop court, ou MongoDB injoignable.

### Créer un compte agent

Il n'existe volontairement aucune route publique pour créer un agent (sinon n'importe qui se déclarerait agent) :

```
npm run creer-agent -- --nom "Agent Test" --email agent@exemple.test --motdepasse "choisis-un-mot-de-passe"
```

## Démonstration (revue de sprint)

Ouvre `api/SignalVille-Sprint1.postman_collection.json` dans Postman (Import), remplis la variable de collection `agentMotDePasse`, puis lance la collection avec le Runner : chaque requête affiche son test réussi ou échoué. Sinon, utilise `api/requests.http` à la main.

Ordre conseillé devant le jury :

1. `npm run dev` : montrer les deux lignes de démarrage.
2. `GET /health` : 200.
3. `POST /auth/register` : 201, et montrer que la réponse ne contient aucun mot de passe.
4. `POST /auth/login` : 200 avec le jeton. Option : coller le jeton sur jwt.io pour montrer son contenu (identifiant, rôle, expiration).
5. `GET /admin/ping` avec le jeton du citoyen : **403**.
6. `POST /auth/login` avec l'agent, puis `GET /admin/ping` avec son jeton : **200**.

## Tests automatiques

MongoDB doit être démarré. Les tests utilisent une base séparée `signalville_test`, vidée à chaque exécution, et refusent de tourner sur une base dont le nom ne contient pas "test".

```
cd api
npm test
```

## Ce qu'il faut comprendre avant la démonstration

1. **Hachage, pas chiffrement.** Le mot de passe est transformé par bcrypt en une empreinte à sens unique, avec un sel aléatoire. Même moi, avec la base de données, je ne peux pas le retrouver. À la connexion, on compare, on ne déchiffre jamais.
2. **Un JWT est signé, pas secret.** Son contenu (identifiant, rôle, date d'expiration) est lisible par n'importe qui. La signature, calculée avec `JWT_SECRET`, empêche seulement de le modifier. Il ne faut donc jamais y mettre d'information sensible, et le secret ne doit jamais fuiter.
3. **401 et 403 ne veulent pas dire la même chose.** 401 : je ne sais pas qui tu es (jeton absent, faux ou expiré). 403 : je sais qui tu es, mais tu n'as pas le droit. C'est exactement ce que montre `/admin/ping`.
4. **Le rôle ne vient jamais du client.** L'inscription force `citoyen`, quoi que contienne la requête. Et à chaque appel protégé, le rôle est relu en base : un compte bloqué perd l'accès tout de suite, même avec un jeton encore valide.
5. **Même message 401 pour "email inconnu" et "mot de passe faux".** Sinon un attaquant peut tester quels emails ont un compte. Un hachage factice est comparé quand l'email n'existe pas, pour que le temps de réponse ne trahisse pas non plus cette information.
6. **On vérifie le type des entrées.** Sans cela, envoyer `{"email": {"$gt": ""}}` peut contourner la recherche en base (injection d'opérateur MongoDB). Les tests couvrent ce cas.
7. **L'unicité de l'email est garantie par un index MongoDB**, pas seulement par un test dans le code : deux inscriptions simultanées ne peuvent pas créer deux comptes. L'API traduit l'erreur de l'index en réponse 409.
8. **Le fichier `.env` n'entre jamais dans Git.** Seul `.env.example` (sans secret) est versionné. C'est la définition de terminé du Sprint 1.

## Arborescence

```
signalville/
  README.md
  .gitignore
  api/
    package.json
    .env.example              modèle de configuration (sans secret)
    requests.http             appels de démonstration
    SignalVille-Sprint1.postman_collection.json
    src/
      index.js                démarrage : configuration, connexion MongoDB, écoute du port
      app.js                  application Express : routes, limitation de débit, erreurs
      config.js               lecture du .env et vérification du secret
      validation.js           validation des corps de requêtes
      models/User.js          modèle utilisateur (collection users)
      routes/auth.js          /auth/register et /auth/login
      routes/admin.js         /admin/ping (agent uniquement)
      middleware/auth.js      authentifier (jeton) et exigerRole (droits)
      middleware/erreurs.js   404 et gestion centrale des erreurs
    scripts/creerAgent.js     création d'un compte agent
    test/auth.test.js         tests d'intégration
```

## Workflow Git conseillé (une branche par fonctionnalité)

```
git init
git add .
git status
git commit -m "Initialisation du dépôt"
git checkout -b feature/s1-socle-et-auth
git add .
git commit -m "Sprint 1 : socle API, authentification JWT, routes agent protégées"
git diff main..feature/s1-socle-et-auth
git checkout main
git merge feature/s1-socle-et-auth
```

Avant chaque commit, `git status` ne doit jamais lister `.env` ni `node_modules`. Relire la différence (`git diff`) avant de fusionner fait partie de la définition de terminé.

## Hors Sprint 1

Écrans Android et web, signalements avec photo et position, regroupement, score de priorité, carte, statuts, notifications, documentation Swagger, intégration continue : prévus aux Sprints 2 et 3 et en semaine 6 du planning.
