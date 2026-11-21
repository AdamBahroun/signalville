// Notifications Firebase (S4.1) : alerte les auteurs et confirmateurs d'un incident quand son statut change.
// Tout est facultatif : sans configuration Firebase, l'API fonctionne normalement et n'envoie rien.
const fs = require('fs');
const config = require('../config');
const Report = require('../models/Report');
const Confirmation = require('../models/Confirmation');
const Category = require('../models/Category');
const DeviceToken = require('../models/DeviceToken');
const { LIBELLES } = require('./statuts');

const TAILLE_LOT = 500; // maximum de jetons par envoi multiple Firebase
const CODES_JETON_INVALIDE = new Set(['messaging/registration-token-not-registered', 'messaging/invalid-registration-token']);

let envoyeur = null; // fonction ({ jetons, donnees }) => Promise<{ invalides: string[] }> ; null = notifications désactivées
const enCours = new Set(); // envois en arrière-plan, pour que les tests puissent les attendre

// Construit l'envoyeur réel avec firebase-admin (chargé seulement ici, jamais quand Firebase est désactivé).
function creerEnvoyeurFirebase(chemin) {
  const { initializeApp, cert } = require('firebase-admin/app');
  const { getMessaging } = require('firebase-admin/messaging');
  const compte = JSON.parse(fs.readFileSync(chemin, 'utf8'));
  const messaging = getMessaging(initializeApp({ credential: cert(compte) }));
  return async ({ jetons, donnees }) => {
    const invalides = [];
    for (let i = 0; i < jetons.length; i += TAILLE_LOT) {
      const lot = jetons.slice(i, i + TAILLE_LOT);
      // Message de données seul : l'application construit le texte et l'affiche, au premier plan comme en arrière-plan.
      const reponse = await messaging.sendEachForMulticast({ tokens: lot, data: donnees, android: { priority: 'high' } });
      reponse.responses.forEach((r, k) => {
        if (!r.success && CODES_JETON_INVALIDE.has(r.error?.code)) invalides.push(lot[k]); // jeton périmé : à supprimer
      });
    }
    return { invalides };
  };
}

// Appelée une fois au démarrage : active Firebase si FIREBASE_SERVICE_ACCOUNT_PATH est défini, sinon une seule ligne de log.
function initialiser() {
  if (!config.firebaseCheminCompte) {
    console.log('Notifications Firebase désactivées (variable FIREBASE_SERVICE_ACCOUNT_PATH absente).');
    return false;
  }
  try {
    envoyeur = creerEnvoyeurFirebase(config.firebaseCheminCompte);
    console.log('Notifications Firebase activées.');
    return true;
  } catch (err) {
    console.log(`Notifications Firebase désactivées (configuration illisible : ${err.message}).`);
    return false;
  }
}

// Utilisé par les tests pour remplacer l'envoi réel ; null remet l'état « désactivé ».
function definirEnvoyeur(fonction) {
  envoyeur = fonction;
}

// Envoie la notification de changement de statut. Ne lève jamais d'erreur : un échec ne doit pas bloquer le changement de statut.
// Contenu : catégorie et nouveau statut seulement, jamais le nom de l'agent ni le score (vie privée).
function notifierChangementStatut(incident) {
  if (!envoyeur) return Promise.resolve();
  const tache = envoyer(incident).catch((err) => console.warn(`Notification non envoyée : ${err.message}`));
  enCours.add(tache);
  tache.finally(() => enCours.delete(tache));
  return tache;
}

// Cherche les destinataires (auteurs et confirmateurs), envoie, puis supprime les jetons que Firebase déclare invalides.
async function envoyer(incident) {
  const [auteurs, confirmateurs, categorie] = await Promise.all([
    Report.distinct('utilisateur', { incident: incident._id }),
    Confirmation.distinct('utilisateur', { incident: incident._id }),
    Category.findOne({ nom: incident.categorie }).lean(),
  ]);
  const destinataires = [...new Set([...auteurs, ...confirmateurs].map(String))];
  if (destinataires.length === 0) return;
  const jetons = await DeviceToken.distinct('jeton', { utilisateur: { $in: destinataires } });
  if (jetons.length === 0) return;

  const donnees = { categorie: categorie?.libelle || incident.categorie, statut: LIBELLES[incident.statut] };
  const { invalides = [] } = await envoyeur({ jetons, donnees });
  if (invalides.length > 0) await DeviceToken.deleteMany({ jeton: { $in: invalides } });
}

// Attend la fin des envois en cours (tests uniquement).
const attendreEnvois = () => Promise.all([...enCours]);

module.exports = { initialiser, definirEnvoyeur, notifierChangementStatut, attendreEnvois };
