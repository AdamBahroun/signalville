const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Retourne la valeur si c'est une chaîne, sinon null.
// Vérifier le TYPE est important : sans cela, un client pourrait envoyer {"email": {"$gt": ""}}
// et provoquer une injection d'opérateur MongoDB.
const chaine = (v) => (typeof v === 'string' ? v : null);

// Valide le corps de POST /auth/register (nom, email, mot de passe).
function validerInscription(body) {
  const b = body && typeof body === 'object' ? body : {};
  const nom = chaine(b.nom)?.trim() ?? '';
  const email = chaine(b.email)?.trim().toLowerCase() ?? '';
  const motDePasse = chaine(b.motDePasse) ?? '';
  const details = {};

  if (nom.length < 2 || nom.length > 60) details.nom = 'Le nom doit contenir entre 2 et 60 caractères.';
  if (!EMAIL_RE.test(email) || email.length > 254) details.email = "L'adresse email est invalide.";
  if (motDePasse.length < 8) details.motDePasse = 'Le mot de passe doit contenir au moins 8 caractères.';
  // bcrypt ne tient compte que des 72 premiers octets : on refuse plus long plutôt que de tronquer en silence.
  else if (Buffer.byteLength(motDePasse, 'utf8') > 72) details.motDePasse = 'Le mot de passe est trop long (72 octets maximum).';

  if (Object.keys(details).length > 0) return { details };
  return { valeurs: { nom, email, motDePasse } };
}

// Valide le corps de POST /auth/login (email et mot de passe en chaînes).
function validerConnexion(body) {
  const b = body && typeof body === 'object' ? body : {};
  const email = chaine(b.email)?.trim().toLowerCase() ?? '';
  const motDePasse = chaine(b.motDePasse) ?? '';
  if (!email || !motDePasse) return { details: { general: 'Email et mot de passe sont obligatoires (chaînes de caractères).' } };
  return { valeurs: { email, motDePasse } };
}

const { STATUTS } = require('./services/statuts');
const { coordonneesValides } = require('./services/geo');

const OBJECT_ID_RE = /^[0-9a-f]{24}$/i;
// mongoose.isValidObjectId accepte aussi certaines chaînes de 12 caractères : on exige ici 24 caractères hexadécimaux.
const estIdObjet = (v) => typeof v === 'string' && OBJECT_ID_RE.test(v);
// Renvoie le corps s'il est un objet simple, sinon un objet vide.
const objet = (body) => (body && typeof body === 'object' && !Array.isArray(body) ? body : {});
// Vrai si v est un entier compris entre min et max.
const entierEntre = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;

// Les paramètres d'URL arrivent en chaînes : on les convertit en entier de façon stricte.
function entierDepuisTexte(v, defaut, min, max) {
  if (v === undefined || v === '') return { valeur: defaut };
  const t = chaine(v);
  if (t === null || !/^\d{1,6}$/.test(t)) return { erreur: true };
  const n = Number(t);
  return n >= min && n <= max ? { valeur: n } : { erreur: true };
}

// Valide les filtres de GET /admin/incidents (statut, catégorie, page, limite).
function validerFiltresIncidents(query) {
  const q = objet(query);
  const details = {};
  const statut = q.statut === undefined || q.statut === '' ? '' : chaine(q.statut);
  if (statut === null || (statut && statut !== 'ouverts' && !STATUTS.includes(statut))) details.statut = `Statut attendu : ${STATUTS.join(', ')} ou ouverts.`;
  const categorie = q.categorie === undefined || q.categorie === '' ? '' : chaine(q.categorie);
  if (categorie === null || categorie.length > 40) details.categorie = 'Catégorie invalide.';
  const page = entierDepuisTexte(q.page, 1, 1, 100000);
  if (page.erreur) details.page = 'La page doit être un entier positif.';
  const limite = entierDepuisTexte(q.limite, 50, 1, 200);
  if (limite.erreur) details.limite = 'La limite doit être un entier entre 1 et 200.';
  if (Object.keys(details).length > 0) return { details };
  return { valeurs: { statut, categorie, page: page.valeur, limite: limite.valeur } };
}

// Valide le corps de PATCH /admin/incidents/:id/status (statut et motif).
function validerChangementStatut(body) {
  const b = objet(body);
  const statut = chaine(b.statut);
  const motif = b.motif === undefined ? '' : chaine(b.motif)?.trim();
  const details = {};
  if (!statut || !STATUTS.includes(statut)) details.statut = `Statut attendu : ${STATUTS.join(', ')}.`;
  if (motif === null || motif === undefined || motif.length > 500) details.motif = 'Le motif doit être un texte de 500 caractères maximum.';
  if (Object.keys(details).length > 0) return { details };
  return { valeurs: { statut, motif } };
}

// Valide le corps du rejet d'un signalement (motif, blocage de l'auteur).
function validerRejet(body) {
  const b = objet(body);
  const motif = chaine(b.motif)?.trim() ?? '';
  const details = {};
  if (motif.length < 3 || motif.length > 500) details.motif = 'Le motif est obligatoire (3 à 500 caractères).';
  if (b.bloquerAuteur !== undefined && typeof b.bloquerAuteur !== 'boolean') details.bloquerAuteur = 'Booléen attendu.';
  if (Object.keys(details).length > 0) return { details };
  return { valeurs: { motif, bloquerAuteur: b.bloquerAuteur === true } };
}

// Valide la modification d'une catégorie (rayon RG2, poids RG4).
function validerCategorie(body) {
  const b = objet(body);
  const details = {};
  const valeurs = {};
  if (b.rayonMetres !== undefined) {
    if (entierEntre(b.rayonMetres, 1, 5000)) valeurs.rayonMetres = b.rayonMetres;
    else details.rayonMetres = 'Le rayon doit être un entier entre 1 et 5000 mètres.';
  }
  if (b.poids !== undefined) {
    if (entierEntre(b.poids, 0, 20)) valeurs.poids = b.poids;
    else details.poids = 'Le poids doit être un entier entre 0 et 20.';
  }
  if (Object.keys(details).length === 0 && Object.keys(valeurs).length === 0) details.general = 'Aucune valeur à modifier (rayonMetres ou poids).';
  if (Object.keys(details).length > 0) return { details };
  return { valeurs };
}

// Valide le corps du blocage d'un utilisateur (booléen).
function validerBlocage(body) {
  const b = objet(body);
  if (typeof b.bloque !== 'boolean') return { details: { bloque: 'Booléen attendu.' } };
  return { valeurs: { bloque: b.bloque } };
}

// Valide le corps de la fusion (identifiant de l'incident cible).
function validerFusion(body) {
  const b = objet(body);
  if (!estIdObjet(b.cibleId)) return { details: { cibleId: "Identifiant de l'incident cible invalide." } };
  return { valeurs: { cibleId: b.cibleId } };
}

// Valide les filtres de GET /admin/utilisateurs (blocage, recherche, page).
function validerFiltresUtilisateurs(query) {
  const q = objet(query);
  const details = {};
  const bloque = q.bloque === undefined || q.bloque === '' ? null : q.bloque === 'true' ? true : q.bloque === 'false' ? false : undefined;
  if (bloque === undefined) details.bloque = 'true ou false attendu.';
  const recherche = q.q === undefined ? '' : chaine(q.q)?.trim();
  if (recherche === null || recherche === undefined || recherche.length > 60) details.q = 'Recherche invalide (60 caractères maximum).';
  const page = entierDepuisTexte(q.page, 1, 1, 100000);
  if (page.erreur) details.page = 'La page doit être un entier positif.';
  const limite = entierDepuisTexte(q.limite, 50, 1, 200);
  if (limite.erreur) details.limite = 'La limite doit être un entier entre 1 et 200.';
  if (Object.keys(details).length > 0) return { details };
  return { valeurs: { bloque, recherche, page: page.valeur, limite: limite.valeur } };
}

// Dans un envoi multipart (signalement avec photo), tous les champs arrivent en texte : on convertit lat et lng, rien d'autre.
const NOMBRE_RE = /^-?\d{1,3}(\.\d{1,12})?$/;
// Convertit un texte numérique strict en nombre, sinon renvoie la valeur inchangée.
const nombreDepuisTexte = (v) => (typeof v === 'string' && NOMBRE_RE.test(v.trim()) ? Number(v) : v);
// Convertit lat et lng d'un envoi multipart (texte) en nombres.
function convertirChampsMultipart(body) {
  const b = objet(body);
  return { ...b, lat: nombreDepuisTexte(b.lat), lng: nombreDepuisTexte(b.lng) };
}

// F3 : incidents proches d'une position. lat et lng sont obligatoires, rayon en mètres (100 à 5000, 2000 par défaut).
function validerProximite(query) {
  const q = objet(query);
  const details = {};
  const lat = nombreDepuisTexte(q.lat);
  const lng = nombreDepuisTexte(q.lng);
  if (!coordonneesValides(lng, lat)) details.position = 'Position invalide : lat et lng sont obligatoires (nombres).';
  const rayon = entierDepuisTexte(q.rayon, 2000, 100, 5000);
  if (rayon.erreur) details.rayon = 'Le rayon doit être un entier entre 100 et 5000 mètres.';
  const categorie = q.categorie === undefined || q.categorie === '' ? '' : chaine(q.categorie);
  if (categorie === null || categorie.length > 40) details.categorie = 'Catégorie invalide.';
  if (Object.keys(details).length > 0) return { details };
  return { valeurs: { lat, lng, rayon: rayon.valeur, categorie } };
}

// Valide le corps de POST /reports (catégorie, description, position).
function validerSignalement(body) {
  const b = objet(body);
  const categorie = chaine(b.categorie)?.trim() ?? '';
  const description = chaine(b.description)?.trim() ?? '';
  const details = {};
  if (!categorie || categorie.length > 40) details.categorie = 'Catégorie obligatoire.';
  if (description.length < 3 || description.length > 500) details.description = 'La description doit contenir entre 3 et 500 caractères.';
  if (!coordonneesValides(b.lng, b.lat)) details.position = 'Position invalide : lat et lng doivent être des nombres.';
  if (Object.keys(details).length > 0) return { details };
  return { valeurs: { categorie, description, lat: b.lat, lng: b.lng } };
}

// RG10 : la requête « moi aussi » porte la position du téléphone (lat et lng numériques, dans les bornes).
function validerConfirmation(body) {
  const b = objet(body);
  if (!coordonneesValides(b.lng, b.lat)) {
    return { details: { position: 'Position du téléphone obligatoire : lat et lng doivent être des nombres valides (latitude de -90 à 90, longitude de -180 à 180).' } };
  }
  return { valeurs: { lat: b.lat, lng: b.lng } };
}

// S4.1 : jeton d'appareil Firebase envoyé par l'application (simple chaîne de longueur raisonnable).
function validerJetonAppareil(body) {
  const jeton = chaine(objet(body).jetonAppareil)?.trim() ?? '';
  if (jeton.length < 20 || jeton.length > 4096) return { details: { jetonAppareil: "Jeton d'appareil invalide (20 à 4096 caractères)." } };
  return { valeurs: { jetonAppareil: jeton } };
}

module.exports = {
  validerInscription,
  validerConnexion,
  estIdObjet,
  validerFiltresIncidents,
  validerChangementStatut,
  validerRejet,
  validerCategorie,
  validerBlocage,
  validerFusion,
  validerFiltresUtilisateurs,
  validerSignalement,
  validerProximite,
  validerConfirmation,
  validerJetonAppareil,
  convertirChampsMultipart,
};
