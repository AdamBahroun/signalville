// Lecture de la configuration depuis les variables d'environnement (fichier .env).
require('dotenv').config({ quiet: true });

const enTest = process.env.NODE_ENV === 'test';

const config = {
  enTest,
  port: Number(process.env.PORT) || 3000,
  mongoUri: enTest
    ? process.env.MONGODB_URI_TEST || 'mongodb://127.0.0.1:27017/tuniins_test'
    : process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/tuniins',
  jwtSecret: process.env.JWT_SECRET || (enTest ? 'secret-de-test-uniquement-pas-pour-la-prod-0123456789' : ''),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1h',
  // Le coût de hachage est abaissé en test pour que les tests restent rapides.
  bcryptRounds: enTest ? 4 : Number(process.env.BCRYPT_ROUNDS) || 10,

  // RG9 : zone de la commune (cercle autour d'un centre). Valeurs par défaut : Nabeul.
  commune: {
    lat: Number(process.env.COMMUNE_LAT) || 36.4513,
    lng: Number(process.env.COMMUNE_LNG) || 10.7357,
    rayonMetres: Number(process.env.COMMUNE_RAYON_M) || 8000,
  },
  // RG6 : nombre maximal de signalements par utilisateur sur 24 heures glissantes.
  limiteSignalementsParJour: Number(process.env.LIMITE_SIGNALEMENTS_PAR_JOUR) || 10,
  // RG10 : « moi aussi » seulement près de l'incident. Rayon et limite quotidienne configurables (valeurs initiales à calibrer).
  confirmation: {
    rayonMetres: Number(process.env.CONFIRMATION_RAYON_M) || 1000, // distance maximale téléphone-incident
    limiteParJour: Number(process.env.LIMITE_CONFIRMATIONS_PAR_JOUR) || 20, // fenêtre glissante de 24 heures
  },
  // S4.1 : chemin du fichier JSON du compte de service Firebase. Vide : notifications désactivées (jamais lu en test).
  firebaseCheminCompte: enTest ? '' : process.env.FIREBASE_SERVICE_ACCOUNT_PATH || '',

  // Appelée au démarrage de l'API : on refuse de démarrer avec un secret JWT faible ou absent.
  verifier() {
    if (!this.jwtSecret || this.jwtSecret.length < 32 || this.jwtSecret.startsWith('remplacer')) {
      throw new Error(
        'JWT_SECRET est absent ou trop court (32 caractères minimum). Copie .env.example vers .env puis génère un secret : ' +
          "node -p \"require('crypto').randomBytes(48).toString('hex')\""
      );
    }
  },
};

module.exports = config;
