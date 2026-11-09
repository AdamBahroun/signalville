// Libellés, couleurs et formats d'affichage. Les règles métier (transitions, score) restent dans l'API : le site ne les recopie pas.
export const STATUTS = ['nouveau', 'pris_en_charge', 'resolu', 'rejete'];

export const LIBELLES_STATUT = {
  nouveau: 'Nouveau',
  pris_en_charge: 'Pris en charge',
  resolu: 'Résolu',
  rejete: 'Rejeté',
};

export const COULEUR_STATUT = {
  nouveau: '#d9534f',
  pris_en_charge: '#f0ad4e',
  resolu: '#5cb85c',
  rejete: '#777777',
};

export const CENTRE_NABEUL = [36.4513, 10.7357];

export const formaterScore = (n) => Number(n).toFixed(1).replace('.', ',');

export function formaterDate(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'short' });
}

export const formaterJours = (n) => `${n} ${n > 1 ? 'jours' : 'jour'}`;

// Un lien vers une photo n'est affiché que s'il est en http(s) ou relatif : on n'injecte jamais un lien "javascript:".
export const lienSur = (url) => typeof url === 'string' && /^(https?:\/\/|\/)/.test(url);
