const config = require('./config');

try {
  config.verifier();
} catch (err) {
  console.error(`Configuration invalide : ${err.message}`);
  process.exit(1);
}

const mongoose = require('mongoose');
const app = require('./app');
const User = require('./models/User');
const Incident = require('./models/Incident');
const Report = require('./models/Report');
const Confirmation = require('./models/Confirmation');
const Category = require('./models/Category');
const DeviceToken = require('./models/DeviceToken');
const notifications = require('./services/notifications');

// Affiche l'adresse de la base sans l'identifiant ni le mot de passe (cas MongoDB Atlas).
function adresseSansSecret(uri) {
  try {
    const u = new URL(uri);
    return `${u.host}${u.pathname}`;
  } catch {
    return '(adresse illisible)';
  }
}

// Connecte MongoDB, crée les index, active Firebase s'il est configuré, puis démarre l'API.
async function demarrer() {
  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
    // Crée les index (unicité de l'email et des confirmations, index géospatial 2dsphere) avant d'accepter des requêtes.
    await Promise.all([User.init(), Incident.init(), Report.init(), Confirmation.init(), Category.init(), DeviceToken.init()]);
    await Category.assurerCategories();
  } catch (err) {
    console.error(`Connexion à MongoDB impossible (${adresseSansSecret(config.mongoUri)}) : ${err.message}`);
    console.error('Vérifie que MongoDB est lancé, ou que MONGODB_URI est correcte dans le fichier .env.');
    process.exit(1);
  }
  console.log(`MongoDB connecté : ${adresseSansSecret(config.mongoUri)}`);
  notifications.initialiser(); // S4.1 : active Firebase si la variable d'environnement existe (une seule ligne de log sinon)

  const serveur = app.listen(config.port, () => {
    console.log(`API TuniIns démarrée sur http://localhost:${config.port}`);
  });

  // Arrêt propre sur Ctrl+C ou arrêt du service : ferme le serveur puis la base.
  const arreter = async () => {
    serveur.close();
    await mongoose.disconnect();
    process.exit(0);
  };
  process.on('SIGINT', arreter);
  process.on('SIGTERM', arreter);
}

demarrer();
