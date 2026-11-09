import { useEffect, useState } from 'react';
import { statistiques } from './api.js';
import { STATUTS, LIBELLES_STATUT, COULEUR_STATUT } from './format.js';

function Barre({ valeur, maximum, couleur }) {
  const largeur = maximum > 0 ? Math.round((valeur / maximum) * 100) : 0;
  return (
    <span className="barre-fond">
      <span className="barre" style={{ width: `${largeur}%`, background: couleur }} />
    </span>
  );
}

export default function Statistiques() {
  const [stats, setStats] = useState(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    statistiques()
      .then(setStats)
      .catch((err) => setErreur(err.message));
  }, []);

  if (erreur) {
    return (
      <div className="detail">
        <p className="erreur" role="alert">
          {erreur}
        </p>
      </div>
    );
  }
  if (!stats) {
    return (
      <div className="detail">
        <p className="note">Chargement...</p>
      </div>
    );
  }

  const maxCategorie = Math.max(1, ...stats.parCategorie.map((c) => c.total));
  const maxStatut = Math.max(1, ...STATUTS.map((s) => stats.parStatut[s]));

  return (
    <div className="detail">
      <h2>Statistiques</h2>
      <div className="cartes-stats">
        <div className="carte-stat">
          <span className="valeur">{stats.totaux.incidents}</span>
          <span>incidents</span>
        </div>
        <div className="carte-stat">
          <span className="valeur">{stats.totaux.ouverts}</span>
          <span>incidents ouverts</span>
        </div>
        <div className="carte-stat">
          <span className="valeur">{stats.totaux.signalements}</span>
          <span>signalements valides</span>
        </div>
        <div className="carte-stat">
          <span className="valeur">{stats.delaiMoyenResolutionJours === null ? 'n/a' : `${String(stats.delaiMoyenResolutionJours).replace('.', ',')} j`}</span>
          <span>délai moyen de résolution{stats.nbResolus ? ` (${stats.nbResolus} résolu(s))` : ''}</span>
        </div>
      </div>

      <div className="detail-grille">
        <section className="bloc">
          <h3>Incidents par statut</h3>
          <table>
            <tbody>
              {STATUTS.map((s) => (
                <tr key={s}>
                  <td>{LIBELLES_STATUT[s]}</td>
                  <td className="cellule-barre">
                    <Barre valeur={stats.parStatut[s]} maximum={maxStatut} couleur={COULEUR_STATUT[s]} />
                  </td>
                  <td>{stats.parStatut[s]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="bloc">
          <h3>Incidents par catégorie</h3>
          <table>
            <thead>
              <tr>
                <th>Catégorie</th>
                <th></th>
                <th>Total</th>
                <th>Ouverts</th>
                <th>Résolus</th>
              </tr>
            </thead>
            <tbody>
              {stats.parCategorie.map((c) => (
                <tr key={c.categorie}>
                  <td>{c.libelle}</td>
                  <td className="cellule-barre">
                    <Barre valeur={c.total} maximum={maxCategorie} couleur="#1f5fbf" />
                  </td>
                  <td>{c.total}</td>
                  <td>{c.ouverts}</td>
                  <td>{c.resolus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  );
}
