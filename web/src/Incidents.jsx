import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker, Popup, useMap } from 'react-leaflet';
import { listerIncidents, listerCategories } from './api.js';
import { STATUTS, LIBELLES_STATUT, COULEUR_STATUT, CENTRE_NABEUL, formaterScore, formaterJours } from './format.js';

// Recentre la carte sur l'incident sélectionné dans la liste.
function Recentrer({ incident }) {
  const carte = useMap();
  useEffect(() => {
    if (incident) carte.flyTo([incident.position.lat, incident.position.lng], 16);
  }, [incident, carte]);
  return null;
}

export default function Incidents({ onOuvrir }) {
  const [filtreStatut, setFiltreStatut] = useState('');
  const [filtreCategorie, setFiltreCategorie] = useState('');
  const [page, setPage] = useState(1);
  const [categories, setCategories] = useState([]);
  const [resultat, setResultat] = useState(null);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(true);
  const [selectionId, setSelectionId] = useState(null);

  useEffect(() => {
    listerCategories()
      .then((r) => setCategories(r.categories))
      .catch(() => {});
  }, []);

  useEffect(() => {
    let annule = false;
    setChargement(true);
    listerIncidents({ statut: filtreStatut, categorie: filtreCategorie, page })
      .then((r) => {
        if (annule) return;
        setResultat(r);
        setErreur('');
      })
      .catch((err) => {
        if (!annule) setErreur(err.message);
      })
      .finally(() => {
        if (!annule) setChargement(false);
      });
    return () => {
      annule = true;
    };
  }, [filtreStatut, filtreCategorie, page]);

  const incidents = resultat?.incidents ?? [];
  const selection = incidents.find((i) => i.id === selectionId) ?? null;
  const nbPages = resultat ? Math.max(1, Math.ceil(resultat.total / resultat.limite)) : 1;

  const changerFiltre = (setter) => (e) => {
    setter(e.target.value);
    setPage(1);
  };

  return (
    <>
      <section className="filtres">
        <label>
          Statut
          <select value={filtreStatut} onChange={changerFiltre(setFiltreStatut)}>
            <option value="">Tous</option>
            <option value="ouverts">Ouverts (nouveau ou pris en charge)</option>
            {STATUTS.map((s) => (
              <option key={s} value={s}>
                {LIBELLES_STATUT[s]}
              </option>
            ))}
          </select>
        </label>
        <label>
          Catégorie
          <select value={filtreCategorie} onChange={changerFiltre(setFiltreCategorie)}>
            <option value="">Toutes</option>
            {categories.map((c) => (
              <option key={c.nom} value={c.nom}>
                {c.libelle}
              </option>
            ))}
          </select>
        </label>
        <span className="compteur">{resultat ? `${resultat.total} incident(s), triés par priorité décroissante` : ''}</span>
      </section>

      {erreur && (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      )}

      <div className="contenu">
        <div className="tableau-conteneur">
          <table>
            <thead>
              <tr>
                <th>Priorité</th>
                <th>Catégorie</th>
                <th>Signalements</th>
                <th>Utilisateurs</th>
                <th>Ancienneté</th>
                <th>Statut</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((i) => (
                <tr key={i.id} className={i.id === selectionId ? 'selectionnee' : ''} onClick={() => setSelectionId(i.id)}>
                  <td>
                    <strong>{formaterScore(i.score)}</strong>
                  </td>
                  <td>{i.libelle}</td>
                  <td>{i.nbSignalements}</td>
                  <td>{i.nbUtilisateurs}</td>
                  <td>{formaterJours(i.ageJours)}</td>
                  <td>
                    <span className="pastille" style={{ background: COULEUR_STATUT[i.statut] }} />
                    {i.libelleStatut}
                  </td>
                  <td>
                    <button className="secondaire" onClick={() => onOuvrir(i.id)}>
                      Détail
                    </button>
                  </td>
                </tr>
              ))}
              {!chargement && incidents.length === 0 && (
                <tr>
                  <td colSpan="7" className="vide">
                    Aucun incident pour ces filtres. Pour générer des données : npm run donnees-demo dans le dossier api.
                  </td>
                </tr>
              )}
              {chargement && incidents.length === 0 && (
                <tr>
                  <td colSpan="7" className="vide">
                    Chargement...
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

        <MapContainer center={CENTRE_NABEUL} zoom={14} className="carte">
          <TileLayer attribution='&copy; contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <Recentrer incident={selection} />
          {incidents.map((i) => (
            <CircleMarker
              key={i.id}
              center={[i.position.lat, i.position.lng]}
              radius={i.id === selectionId ? 14 : 6 + Math.min(i.score / 5, 8)}
              pathOptions={{ color: '#222', weight: i.id === selectionId ? 3 : 1, fillColor: COULEUR_STATUT[i.statut], fillOpacity: 0.85 }}
              eventHandlers={{ click: () => setSelectionId(i.id) }}
            >
              <Popup>
                <strong>{i.libelle}</strong>
                <br />
                Score : {formaterScore(i.score)} · {i.libelleStatut}
                <br />
                <button className="secondaire" onClick={() => onOuvrir(i.id)}>
                  Ouvrir le détail
                </button>
              </Popup>
            </CircleMarker>
          ))}
        </MapContainer>
      </div>
    </>
  );
}
