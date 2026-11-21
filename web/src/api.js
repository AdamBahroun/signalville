// Appels à l'API TuniIns (via le proxy Vite : /api/... devient http://localhost:3000/...).
const CLE_SESSION = 'tuniins.session';

// Le jeton est gardé dans sessionStorage : il disparaît à la fermeture de l'onglet.
export const lireSession = () => {
  try {
    return JSON.parse(sessionStorage.getItem(CLE_SESSION));
  } catch {
    return null;
  }
};
export const ecrireSession = (session) => sessionStorage.setItem(CLE_SESSION, JSON.stringify(session));
export const effacerSession = () => sessionStorage.removeItem(CLE_SESSION);

// Appelée quand l'API répond 401 (jeton expiré, compte bloqué) : l'application revient à l'écran de connexion.
let surSessionExpiree = () => {};
export const definirSurSessionExpiree = (fonction) => {
  surSessionExpiree = fonction;
};

// Appelle l'API (via le proxy /api) avec un message clair si elle est injoignable.
async function appeler(chemin, options = {}) {
  try {
    return await fetch(`/api${chemin}`, options);
  } catch {
    throw new Error('API injoignable : vérifie que « npm run dev » tourne dans le dossier api.');
  }
}

// Requête authentifiée : jeton de session, JSON, et erreurs transformées en messages.
async function requete(methode, chemin, corps) {
  const session = lireSession();
  const entetes = { Authorization: `Bearer ${session?.jeton ?? ''}` };
  if (corps !== undefined) entetes['Content-Type'] = 'application/json';
  const r = await appeler(chemin, { method: methode, headers: entetes, body: corps === undefined ? undefined : JSON.stringify(corps) });
  const donnees = await r.json().catch(() => ({}));
  if (r.status === 401) {
    surSessionExpiree();
    throw new Error('Session expirée, reconnecte-toi.');
  }
  if (!r.ok) {
    const details = donnees.details ? ` ${Object.values(donnees.details).join(' ')}` : '';
    throw new Error(`${donnees.erreur || 'Erreur du serveur.'}${details}`);
  }
  return donnees;
}

// Construit la chaîne de requête en ignorant les valeurs vides.
const parametres = (objet) => {
  const p = new URLSearchParams();
  for (const [cle, valeur] of Object.entries(objet)) {
    if (valeur !== '' && valeur !== undefined && valeur !== null) p.set(cle, String(valeur));
  }
  const texte = p.toString();
  return texte ? `?${texte}` : '';
};

export async function connecter(email, motDePasse) {
  const r = await appeler('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, motDePasse }),
  });
  const donnees = await r.json().catch(() => ({}));
  if (r.status === 401) throw new Error('Email ou mot de passe incorrect.');
  if (!r.ok) throw new Error(donnees.erreur || 'Erreur du serveur.');
  return donnees; // { jeton, role, utilisateur }
}

// Retourne le code HTTP de /admin/ping : 200 = administrateur, 403 = connecté mais pas administrateur, 401 = jeton refusé.
export async function verifierAcces(jeton) {
  const r = await appeler('/admin/ping', { headers: { Authorization: `Bearer ${jeton}` } });
  return r.status;
}

export const listerIncidents = (filtres = {}) => requete('GET', `/admin/incidents${parametres(filtres)}`);
export const detailIncident = (id) => requete('GET', `/admin/incidents/${id}`);
export const changerStatut = (id, statut, motif) => requete('PATCH', `/admin/incidents/${id}/status`, { statut, motif });
export const fusionnerIncident = (id, cibleId) => requete('POST', `/admin/incidents/${id}/fusion`, { cibleId });
export const rejeterSignalement = (id, motif, bloquerAuteur) => requete('POST', `/admin/signalements/${id}/rejet`, { motif, bloquerAuteur });
export const carteChaleur = () => requete('GET', '/admin/heatmap');
export const statistiques = () => requete('GET', '/admin/stats');
export const listerUtilisateurs = (filtres = {}) => requete('GET', `/admin/utilisateurs${parametres(filtres)}`);
export const bloquerUtilisateur = (id, bloque) => requete('PATCH', `/admin/utilisateurs/${id}/blocage`, { bloque });
export const listerCategories = () => requete('GET', '/admin/categories');
export const modifierCategorie = (nom, valeurs) => requete('PATCH', `/admin/categories/${nom}`, valeurs);
