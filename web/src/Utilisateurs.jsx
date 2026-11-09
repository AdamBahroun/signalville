import { useEffect, useState } from 'react';
import { listerUtilisateurs, bloquerUtilisateur } from './api.js';
import { formaterDate } from './format.js';

export default function Utilisateurs() {
  const [recherche, setRecherche] = useState('');
  const [rechercheAppliquee, setRechercheAppliquee] = useState('');
  const [filtre, setFiltre] = useState('');
  const [page, setPage] = useState(1);
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState('');
  const [rechargement, setRechargement] = useState(0);

  useEffect(() => {
    let annule = false;
    listerUtilisateurs({ q: rechercheAppliquee, bloque: filtre, page })
      .then((r) => {
        if (annule) return;
        setResultat(r);
        setErreur('');
      })
      .catch((err) => {
        if (!annule) setErreur(err.message);
      });
    return () => {
      annule = true;
    };
  }, [rechercheAppliquee, filtre, page, rechargement]);

  async function basculer(u) {
    const action = u.bloque ? 'débloquer' : 'bloquer';
    if (!window.confirm(`Voulez-vous ${action} ${u.nom} (${u.email}) ?`)) return;
    try {
      await bloquerUtilisateur(u.id, !u.bloque);
      setRechargement((n) => n + 1);
    } catch (err) {
      setErreur(err.message);
    }
  }

  const nbPages = resultat ? Math.max(1, Math.ceil(resultat.total / resultat.limite)) : 1;

  return (
    <div className="detail">
      <h2>Utilisateurs</h2>
      <form
        className="filtres sans-marge"
        onSubmit={(e) => {
          e.preventDefault();
          setRechercheAppliquee(recherche.trim());
          setPage(1);
        }}
      >
        <label>
          Nom ou email
          <input value={recherche} maxLength={60} onChange={(e) => setRecherche(e.target.value)} />
        </label>
        <label>
          Compte
          <select
            value={filtre}
            onChange={(e) => {
              setFiltre(e.target.value);
              setPage(1);
            }}
          >
            <option value="">Tous</option>
            <option value="false">Actifs</option>
            <option value="true">Bloqués</option>
          </select>
        </label>
        <button type="submit">Rechercher</button>
        <span className="compteur">{resultat ? `${resultat.total} citoyen(s)` : ''}</span>
      </form>

      {erreur && (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      )}

      <div className="tableau-conteneur">
        <table>
          <thead>
            <tr>
              <th>Nom</th>
              <th>Email</th>
              <th>Inscrit le</th>
              <th>Compte</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(resultat?.utilisateurs ?? []).map((u) => (
              <tr key={u.id}>
                <td>{u.nom}</td>
                <td>{u.email}</td>
                <td>{formaterDate(u.dateCreation)}</td>
                <td>{u.bloque ? <span className="badge gris">Bloqué</span> : 'Actif'}</td>
                <td>
                  <button className={u.bloque ? 'secondaire' : 'secondaire danger'} onClick={() => basculer(u)}>
                    {u.bloque ? 'Débloquer' : 'Bloquer'}
                  </button>
                </td>
              </tr>
            ))}
            {resultat && resultat.utilisateurs.length === 0 && (
              <tr>
                <td colSpan="5" className="vide">
                  Aucun citoyen pour ces critères.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        {resultat && nbPages > 1 && (
          <div className="pagination">
            <button className="secondaire" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              Précédent
            </button>
            <span>
              Page {page} sur {nbPages}
            </span>
            <button className="secondaire" disabled={page >= nbPages} onClick={() => setPage(page + 1)}>
              Suivant
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
