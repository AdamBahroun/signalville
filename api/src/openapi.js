// Description OpenAPI 3 de l'API TuniIns, affichée par Swagger UI sur /docs.
// Elle est écrite à la main : quand une route change, ce fichier doit changer aussi (un test vérifie que les routes principales y figurent).
const erreur = { description: 'Erreur', content: { 'application/json': { schema: { $ref: '#/components/schemas/Erreur' } } } };
const secu = [{ jeton: [] }];
const idParam = { name: 'id', in: 'path', required: true, schema: { type: 'string', pattern: '^[0-9a-f]{24}$' }, description: 'Identifiant MongoDB (24 caractères hexadécimaux)' };
// Fabrique les réponses d'une route : la réponse de succès plus les codes d'erreur listés.
const reponses = (ok, ...codes) => ({ ...ok, ...Object.fromEntries(codes.map((c) => [String(c), erreur])) });
// Enveloppe un schéma dans un contenu application/json.
const json = (schema) => ({ content: { 'application/json': { schema } } });

module.exports = {
  openapi: '3.0.3',
  info: {
    title: 'API TuniIns',
    version: '0.4.0',
    description:
      "Signalement citoyen d'incidents avec regroupement automatique des doublons et score de priorité.\n\n" +
      'Authentification : `POST /auth/login` renvoie un jeton JWT. Bouton **Authorize** ci-dessus, puis coller le jeton (sans le mot Bearer).\n\n' +
      'Le rôle `agent` désigne l\'administrateur du site web ; le rôle `citoyen` désigne l\'utilisateur de l\'application mobile.',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Développement local' }],
  tags: [
    { name: 'Santé' },
    { name: 'Authentification' },
    { name: 'Citoyen', description: 'Routes de l\'application mobile' },
    { name: 'Administration', description: 'Routes du site web (rôle agent uniquement)' },
  ],
  components: {
    securitySchemes: { jeton: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' } },
    schemas: {
      Erreur: { type: 'object', properties: { erreur: { type: 'string' }, details: { type: 'object', additionalProperties: { type: 'string' } } } },
      Utilisateur: {
        type: 'object',
        properties: { id: { type: 'string' }, nom: { type: 'string' }, email: { type: 'string' }, role: { type: 'string', enum: ['citoyen', 'agent'] }, bloque: { type: 'boolean' } },
      },
      Position: { type: 'object', properties: { lat: { type: 'number', example: 36.4489 }, lng: { type: 'number', example: 10.7311 } } },
      Statut: { type: 'string', enum: ['nouveau', 'pris_en_charge', 'resolu', 'rejete'] },
      IncidentProche: {
        type: 'object',
        description: "Vue citoyen d'un incident : ni score, ni historique, ni identité des auteurs.",
        properties: {
          id: { type: 'string' },
          categorie: { type: 'string', example: 'nid_de_poule' },
          libelle: { type: 'string', example: 'Nid-de-poule' },
          position: { $ref: '#/components/schemas/Position' },
          distanceMetres: { type: 'integer' },
          nbSignalements: { type: 'integer' },
          nbPersonnes: { type: 'integer', description: 'Personnes distinctes concernées : auteurs de signalements et confirmations « moi aussi »' },
          statut: { $ref: '#/components/schemas/Statut' },
          libelleStatut: { type: 'string' },
          premierSignalement: { type: 'string', format: 'date-time' },
          monSignalement: { type: 'boolean', description: "L'utilisateur connecté a signalé cet incident" },
          dejaConfirme: { type: 'boolean', description: "L'utilisateur connecté a déjà confirmé cet incident (RG5)" },
        },
      },
      SuiviSignalement: {
        type: 'object',
        description: "Un signalement de l'utilisateur connecté et l'état de son incident. Pas de score, pas de nom d'agent.",
        properties: {
          id: { type: 'string' },
          categorie: { type: 'string' },
          libelle: { type: 'string' },
          description: { type: 'string' },
          photoUrl: { type: 'string', nullable: true },
          date: { type: 'string', format: 'date-time' },
          position: { $ref: '#/components/schemas/Position' },
          rejete: { type: 'boolean' },
          motifRejet: { type: 'string' },
          incident: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string' },
              statut: { $ref: '#/components/schemas/Statut' },
              libelleStatut: { type: 'string' },
              nbSignalements: { type: 'integer' },
              nbPersonnes: { type: 'integer' },
              historique: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { statut: { $ref: '#/components/schemas/Statut' }, libelleStatut: { type: 'string' }, date: { type: 'string', format: 'date-time' }, motif: { type: 'string' } },
                },
              },
            },
          },
        },
      },
      IncidentAdmin: {
        type: 'object',
        description: 'Vue administrateur : ajoute le score de priorité (RG4), calculé à chaque lecture.',
        properties: {
          id: { type: 'string' },
          categorie: { type: 'string' },
          libelle: { type: 'string' },
          position: { $ref: '#/components/schemas/Position' },
          nbSignalements: { type: 'integer' },
          nbUtilisateurs: { type: 'integer' },
          statut: { $ref: '#/components/schemas/Statut' },
          libelleStatut: { type: 'string' },
          score: { type: 'number', example: 20.5 },
          ageJours: { type: 'number' },
          premierSignalement: { type: 'string', format: 'date-time' },
          dateMiseAJour: { type: 'string', format: 'date-time' },
        },
      },
    },
  },
  paths: {
    '/health': {
      get: { tags: ['Santé'], summary: "L'API répond et la base est connectée", responses: { 200: { description: 'ok' }, 503: { description: 'Base de données déconnectée' } } },
    },
    '/auth/register': {
      post: {
        tags: ['Authentification'],
        summary: "Inscription d'un citoyen (le rôle n'est jamais lu dans la requête)",
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['nom', 'email', 'motDePasse'],
            properties: { nom: { type: 'string', minLength: 2, maxLength: 60 }, email: { type: 'string', format: 'email' }, motDePasse: { type: 'string', minLength: 8, description: '8 caractères minimum, 72 octets maximum' } },
          }),
        },
        responses: reponses({ 201: { description: 'Compte créé', ...json({ type: 'object', properties: { utilisateur: { $ref: '#/components/schemas/Utilisateur' } } }) } }, 400, 409, 429),
      },
    },
    '/auth/login': {
      post: {
        tags: ['Authentification'],
        summary: 'Connexion : renvoie un jeton JWT',
        description: 'Même réponse 401 pour un email inconnu, un mot de passe faux ou un compte bloqué.',
        requestBody: { required: true, ...json({ type: 'object', required: ['email', 'motDePasse'], properties: { email: { type: 'string' }, motDePasse: { type: 'string' } } }) },
        responses: reponses(
          { 200: { description: 'Connecté', ...json({ type: 'object', properties: { jeton: { type: 'string' }, role: { type: 'string' }, utilisateur: { $ref: '#/components/schemas/Utilisateur' } } }) } },
          400,
          401,
          429
        ),
      },
    },
    '/categories': {
      get: {
        tags: ['Citoyen'],
        summary: 'Catégories disponibles pour un signalement',
        security: secu,
        responses: reponses({ 200: { description: 'Liste', ...json({ type: 'object', properties: { categories: { type: 'array', items: { type: 'object', properties: { nom: { type: 'string' }, libelle: { type: 'string' } } } } } }) } }, 401),
      },
    },
    '/reports': {
      post: {
        tags: ['Citoyen'],
        summary: 'Créer un signalement (regroupement automatique)',
        description:
          'Deux formats : `application/json` (sans photo) ou `multipart/form-data` (avec un fichier `photo`, JPEG ou PNG, 5 Mo maximum). ' +
          'Règles : position dans la zone de la commune (RG9), 10 signalements par 24 h (RG6). Le type de la photo est vérifié sur son contenu, pas sur son nom.',
        security: secu,
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['categorie', 'description', 'lat', 'lng'],
                properties: { categorie: { type: 'string', example: 'nid_de_poule' }, description: { type: 'string', minLength: 3, maxLength: 500 }, lat: { type: 'number', example: 36.4489 }, lng: { type: 'number', example: 10.7311 } },
              },
            },
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['categorie', 'description', 'lat', 'lng'],
                properties: {
                  categorie: { type: 'string' },
                  description: { type: 'string' },
                  lat: { type: 'number' },
                  lng: { type: 'number' },
                  photo: { type: 'string', format: 'binary', description: 'JPEG ou PNG, 5 Mo maximum' },
                },
              },
            },
          },
        },
        responses: reponses(
          {
            201: {
              description: 'Signalement créé',
              ...json({ type: 'object', properties: { reportId: { type: 'string' }, incidentId: { type: 'string' }, nouvelIncident: { type: 'boolean' }, photoUrl: { type: 'string', nullable: true, example: '/uploads/3f9c….jpg' } } }),
            },
          },
          400,
          401,
          403,
          413,
          429
        ),
      },
    },
    '/incidents': {
      get: {
        tags: ['Citoyen'],
        summary: 'Incidents ouverts proches d\'une position (carte mobile)',
        security: secu,
        parameters: [
          { name: 'lat', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'lng', in: 'query', required: true, schema: { type: 'number' } },
          { name: 'rayon', in: 'query', schema: { type: 'integer', minimum: 100, maximum: 5000, default: 2000 }, description: 'Mètres' },
          { name: 'categorie', in: 'query', schema: { type: 'string' } },
        ],
        responses: reponses({ 200: { description: 'Du plus proche au plus éloigné, 100 maximum', ...json({ type: 'object', properties: { incidents: { type: 'array', items: { $ref: '#/components/schemas/IncidentProche' } } } }) } }, 400, 401, 403),
      },
    },
    '/incidents/{id}/confirm': {
      post: {
        tags: ['Citoyen'],
        summary: 'Confirmer un incident : « moi aussi » (RG5, RG10)',
        description:
          'Une seule confirmation par utilisateur et par incident (409 sinon). Refusée (409) si l\'incident est résolu ou rejeté, ou si l\'utilisateur est déjà l\'auteur d\'un signalement de cet incident. ' +
          'RG10 : le corps doit contenir la position du téléphone (400 sinon) ; refusée (403) si elle est à plus de 1 000 m de l\'incident (rayon configurable, variable CONFIRMATION_RAYON_M), ' +
          'et limitée par jour (429, variable LIMITE_CONFIRMATIONS_PAR_JOUR). La position est déclarée par le client : elle n\'est pas vérifiable côté serveur. ' +
          'La confirmation compte comme une personne de plus dans le score, sans créer de signalement.',
        security: secu,
        parameters: [idParam],
        requestBody: {
          required: true,
          ...json({
            type: 'object',
            required: ['lat', 'lng'],
            properties: { lat: { type: 'number', minimum: -90, maximum: 90, description: 'Latitude du téléphone' }, lng: { type: 'number', minimum: -180, maximum: 180, description: 'Longitude du téléphone' } },
          }),
        },
        responses: reponses(
          { 201: { description: 'Confirmation enregistrée', ...json({ type: 'object', properties: { incidentId: { type: 'string' }, nbSignalements: { type: 'integer' }, nbPersonnes: { type: 'integer' }, dejaConfirme: { type: 'boolean' } } }) } },
          400,
          401,
          403,
          404,
          409,
          429
        ),
      },
    },
    '/me/device-token': {
      post: {
        tags: ['Citoyen'],
        summary: 'Enregistrer le jeton Firebase de l\'appareil (notifications)',
        description:
          'Appelée par l\'application après la connexion. Un jeton appartient à un seul utilisateur (réattribué si un autre compte se connecte sur le même appareil) ; ' +
          '5 appareils conservés par utilisateur. Sans configuration Firebase côté serveur, la route fonctionne mais aucune notification n\'est envoyée.',
        security: secu,
        requestBody: { required: true, ...json({ type: 'object', required: ['jetonAppareil'], properties: { jetonAppareil: { type: 'string', minLength: 20, maxLength: 4096 } } }) },
        responses: reponses({ 200: { description: 'Jeton enregistré', ...json({ type: 'object', properties: { enregistre: { type: 'boolean' } } }) } }, 400, 401, 403),
      },
    },
    '/me/reports': {
      get: {
        tags: ['Citoyen'],
        summary: 'Mes signalements et le suivi de leur incident',
        description: 'Du plus récent au plus ancien, 100 maximum. Chaque signalement porte le statut de son incident et l\'historique des changements (statut, date, motif).',
        security: secu,
        responses: reponses({ 200: { description: 'Liste', ...json({ type: 'object', properties: { signalements: { type: 'array', items: { $ref: '#/components/schemas/SuiviSignalement' } } } }) } }, 401, 403),
      },
    },
    '/admin/ping': { get: { tags: ['Administration'], summary: 'Vérifie le droit d\'accès (200 agent, 403 citoyen)', security: secu, responses: reponses({ 200: { description: 'Accès autorisé' } }, 401, 403) } },
    '/admin/incidents': {
      get: {
        tags: ['Administration'],
        summary: 'Liste triée par score décroissant',
        security: secu,
        parameters: [
          { name: 'statut', in: 'query', schema: { type: 'string', description: 'nouveau, pris_en_charge, resolu, rejete ou ouverts' } },
          { name: 'categorie', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limite', in: 'query', schema: { type: 'integer', default: 50, maximum: 200 } },
        ],
        responses: reponses(
          { 200: { description: 'Page de résultats', ...json({ type: 'object', properties: { total: { type: 'integer' }, page: { type: 'integer' }, limite: { type: 'integer' }, incidents: { type: 'array', items: { $ref: '#/components/schemas/IncidentAdmin' } } } }) } },
          400,
          401,
          403
        ),
      },
    },
    '/admin/incidents/{id}': {
      get: { tags: ['Administration'], summary: 'Détail : signalements, historique, transitions possibles', security: secu, parameters: [idParam], responses: reponses({ 200: { description: 'Détail' } }, 400, 401, 403, 404) },
    },
    '/admin/incidents/{id}/status': {
      patch: {
        tags: ['Administration'],
        summary: 'Changer le statut (RG7 transitions, RG8 historique)',
        security: secu,
        parameters: [idParam],
        requestBody: { required: true, ...json({ type: 'object', required: ['statut'], properties: { statut: { $ref: '#/components/schemas/Statut' }, motif: { type: 'string', maxLength: 500, description: 'Obligatoire pour un rejet ou une réouverture' } } }) },
        responses: reponses({ 200: { description: 'Incident mis à jour' } }, 400, 401, 403, 404, 409),
      },
    },
    '/admin/incidents/{id}/fusion': {
      post: {
        tags: ['Administration'],
        summary: 'Fusionner ce doublon dans un autre incident',
        security: secu,
        parameters: [idParam],
        requestBody: { required: true, ...json({ type: 'object', required: ['cibleId'], properties: { cibleId: { type: 'string' } } }) },
        responses: reponses({ 200: { description: 'Incident cible mis à jour' } }, 400, 401, 403, 404, 409),
      },
    },
    '/admin/signalements/{id}/rejet': {
      post: {
        tags: ['Administration'],
        summary: 'Rejeter un signalement abusif (blocage facultatif de l\'auteur)',
        security: secu,
        parameters: [idParam],
        requestBody: { required: true, ...json({ type: 'object', required: ['motif'], properties: { motif: { type: 'string', minLength: 3, maxLength: 500 }, bloquerAuteur: { type: 'boolean' } } }) },
        responses: reponses({ 200: { description: 'Signalement rejeté' } }, 400, 401, 403, 404, 409),
      },
    },
    '/admin/utilisateurs': {
      get: {
        tags: ['Administration'],
        summary: 'Liste des citoyens',
        security: secu,
        parameters: [
          { name: 'q', in: 'query', schema: { type: 'string' } },
          { name: 'bloque', in: 'query', schema: { type: 'boolean' } },
          { name: 'page', in: 'query', schema: { type: 'integer' } },
          { name: 'limite', in: 'query', schema: { type: 'integer' } },
        ],
        responses: reponses({ 200: { description: 'Page de résultats' } }, 400, 401, 403),
      },
    },
    '/admin/utilisateurs/{id}/blocage': {
      patch: {
        tags: ['Administration'],
        summary: 'Bloquer ou débloquer un citoyen',
        security: secu,
        parameters: [idParam],
        requestBody: { required: true, ...json({ type: 'object', required: ['bloque'], properties: { bloque: { type: 'boolean' } } }) },
        responses: reponses({ 200: { description: 'Utilisateur mis à jour' } }, 400, 401, 403, 404),
      },
    },
    '/admin/categories': { get: { tags: ['Administration'], summary: 'Catégories avec rayon et poids', security: secu, responses: reponses({ 200: { description: 'Liste' } }, 401, 403) } },
    '/admin/categories/{nom}': {
      patch: {
        tags: ['Administration'],
        summary: 'Modifier le rayon de regroupement et/ou le poids du score',
        security: secu,
        parameters: [{ name: 'nom', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: { required: true, ...json({ type: 'object', properties: { rayonMetres: { type: 'integer', minimum: 1, maximum: 5000 }, poids: { type: 'integer', minimum: 0, maximum: 20 } } }) },
        responses: reponses({ 200: { description: 'Catégorie mise à jour' } }, 400, 401, 403, 404),
      },
    },
    '/admin/heatmap': { get: { tags: ['Administration'], summary: 'Points de la carte de chaleur', security: secu, responses: reponses({ 200: { description: 'Points pondérés' } }, 401, 403) } },
    '/admin/stats': { get: { tags: ['Administration'], summary: 'Statistiques et délai moyen de résolution', security: secu, responses: reponses({ 200: { description: 'Statistiques' } }, 401, 403) } },
  },
};
