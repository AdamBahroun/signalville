// Transforme un incident (document "lean" de la base) en objet prêt pour le site d'administration.
const { calculerScore, joursDepuis } = require('./score');
const { LIBELLES } = require('./statuts');

function presenterIncident(incident, categorie, maintenant = new Date()) {
  const poids = categorie ? categorie.poids : 1;
  const [lng, lat] = incident.positionCentrale.coordinates;
  return {
    id: String(incident._id),
    categorie: incident.categorie,
    libelle: categorie ? categorie.libelle : incident.categorie,
    position: { lat, lng },
    nbSignalements: incident.nbSignalements,
    nbUtilisateurs: incident.nbUtilisateurs,
    statut: incident.statut,
    libelleStatut: LIBELLES[incident.statut],
    score: calculerScore({ poids, nbUtilisateurs: incident.nbUtilisateurs, premierSignalement: incident.premierSignalement }, maintenant),
    ageJours: joursDepuis(incident.premierSignalement, maintenant),
    premierSignalement: incident.premierSignalement,
    dateMiseAJour: incident.dateMiseAJour,
  };
}

module.exports = { presenterIncident };
