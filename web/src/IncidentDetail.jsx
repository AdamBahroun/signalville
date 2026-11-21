import { useCallback, useEffect, useState } from 'react';
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet';
import { detailIncident, changerStatut, fusionnerIncident, rejeterSignalement, listerIncidents } from './api.js';
import { COULEUR_STATUT, formaterScore, formaterDate, formaterJours, lienSur } from './format.js';

// Formulaire de changement de statut : transitions autorisées et motif (RG7, RG8).
function FormulaireStatut({ incident, transitions, onFait, onErreur }) {
  const [vers, setVers] = useState(transitions[0]?.statut ?? ''); // statut cible choisi
  const [motif, setMotif] = useState(''); // motif saisi (RG7)
  const [enCours, setEnCours] = useState(false); // vrai pendant l'appel à l'API

  // Réinitialise le choix et le motif quand le statut de l'incident change.
  useEffect(() => {
    setVers(transitions[0]?.statut ?? '');
    setMotif('');
  }, [incident.statut]); // eslint-disable-line react-hooks/exhaustive-deps

  if (transitions.length === 0) {
    return <p className="note">Aucun changement possible : un incident rejeté est définitif.</p>;
  }
  const choix = transitions.find((t) => t.statut === vers);

  // Envoie le changement de statut à l'API puis recharge le détail.
  async function valider(e) {
    e.preventDefault();
    setEnCours(true);
    onErreur('');
    try {
      await changerStatut(incident.id, vers, motif.trim());
      setMotif('');
      await onFait('Statut mis à jour.');
    } catch (err) {
      onErreur(err.message);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <form className="formulaire-ligne" onSubmit={valider}>
      <label>
        Nouveau statut
        <select value={vers} onChange={(e) => setVers(e.target.value)}>
          {transitions.map((t) => (
            <option key={t.statut} value={t.statut}>
              {t.libelle}
            </option>
          ))}
        </select>
      </label>
      <label className="large">
        Motif {choix?.motifObligatoire ? '(obligatoire)' : '(facultatif)'}
        <input value={motif} maxLength={500} onChange={(e) => setMotif(e.target.value)} required={choix?.motifObligatoire} />
      </label>
      <button type="submit" disabled={enCours}>
        Valider
      </button>
    </form>
  );
}

// Un signalement de l'incident, avec le formulaire de rejet (modération F14).
function LigneSignalement({ s, onFait, onErreur }) {
  const [ouvert, setOuvert] = useState(false); // formulaire déplié ou non
  const [motif, setMotif] = useState(''); // motif saisi (RG7)
  const [bloquer, setBloquer] = useState(false); // case « bloquer l'auteur »
  const [enCours, setEnCours] = useState(false); // vrai pendant l'appel à l'API

  // Rejette le signalement avec son motif, et bloque l'auteur si la case est cochée.
  async function rejeter(e) {
    e.preventDefault();
    setEnCours(true);
    onErreur('');
    try {
      const r = await rejeterSignalement(s.id, motif.trim(), bloquer);
      await onFait(r.auteurBloque ? 'Signalement rejeté et auteur bloqué.' : 'Signalement rejeté.');
    } catch (err) {
      onErreur(err.message);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <>
      <tr className={s.rejete ? 'rejetee' : ''}>
        <td>{s.auteur ? s.auteur.nom : 'Compte supprimé'}</td>
        <td>{formaterDate(s.date)}</td>
        <td>{s.description}</td>
        <td>{lienSur(s.photoUrl) ? <a href={s.photoUrl} target="_blank" rel="noreferrer">Voir</a> : 'Aucune'}</td>
        <td>
          {s.rejete ? (
            <span className="badge gris" title={s.motifRejet}>
              Rejeté
            </span>
          ) : (
            <button className="secondaire danger" onClick={() => setOuvert(!ouvert)}>
              Rejeter
            </button>
          )}
        </td>
      </tr>
      {ouvert && !s.rejete && (
        <tr>
          <td colSpan="5">
            <form className="formulaire-ligne" onSubmit={rejeter}>
              <label className="large">
                Motif du rejet (obligatoire)
                <input value={motif} minLength={3} maxLength={500} onChange={(e) => setMotif(e.target.value)} required autoFocus />
              </label>
              {s.auteur && !s.auteur.bloque && (
                <label className="case">
                  <input type="checkbox" checked={bloquer} onChange={(e) => setBloquer(e.target.checked)} />
                  Bloquer aussi l'auteur ({s.auteur.email})
                </label>
              )}
              <button type="submit" className="danger" disabled={enCours}>
                Confirmer le rejet
              </button>
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

// Fusion de cet incident dans un doublon proche de même catégorie (F16).
function Fusion({ incident, onFusionne, onErreur }) {
  const [ouvert, setOuvert] = useState(false); // formulaire déplié ou non
  const [candidats, setCandidats] = useState([]); // incidents candidats à la fusion
  const [cible, setCible] = useState(''); // incident cible de la fusion

  // À l'ouverture du formulaire, charge les incidents candidats à la fusion.
  useEffect(() => {
    if (!ouvert) return;
    listerIncidents({ statut: 'ouverts', categorie: incident.categorie, limite: 200 })
      .then((r) => setCandidats(r.incidents.filter((i) => i.id !== incident.id)))
      .catch((err) => onErreur(err.message));
  }, [ouvert, incident.id, incident.categorie]); // eslint-disable-line react-hooks/exhaustive-deps

  // Fusionne l'incident dans la cible choisie puis ouvre l'incident résultant.
  async function fusionner() {
    if (!cible) return;
    if (!window.confirm('Fusionner cet incident dans l\'incident choisi ? Cette action est définitive.')) return;
    onErreur('');
    try {
      await fusionnerIncident(incident.id, cible);
      onFusionne(cible);
    } catch (err) {
      onErreur(err.message);
    }
  }

  if (!ouvert) {
    return (
      <button className="secondaire" onClick={() => setOuvert(true)}>
        Fusionner avec un autre incident
      </button>
    );
  }
  return (
    <div className="formulaire-ligne">
      <label className="large">
        Incident à conserver (même catégorie, ouvert)
        <select value={cible} onChange={(e) => setCible(e.target.value)}>
          <option value="">Choisir...</option>
          {candidats.map((c) => (
            <option key={c.id} value={c.id}>
              {c.libelleStatut} : {c.nbSignalements} signalement(s), {formaterJours(c.ageJours)} ({c.position.lat.toFixed(4)}, {c.position.lng.toFixed(4)})
            </option>
          ))}
        </select>
      </label>
      <button onClick={fusionner} disabled={!cible}>
        Fusionner
      </button>
      <button className="secondaire" onClick={() => setOuvert(false)}>
        Annuler
      </button>
    </div>
  );
}

// Page détail d'un incident : signalements, carte, historique et actions de l'administrateur.
export default function IncidentDetail({ id, onRetour, onOuvrir }) {
  const [donnees, setDonnees] = useState(null); // détail chargé depuis l'API
  const [erreur, setErreur] = useState(''); // message d'erreur affiché
  const [message, setMessage] = useState(''); // message de succès affiché

  // Charge le détail de l'incident, ou affiche le message d'erreur.
  const charger = useCallback(async () => {
    try {
      setDonnees(await detailIncident(id));
      setErreur('');
    } catch (err) {
      setErreur(err.message);
    }
  }, [id]);

  // Recharge le détail à chaque changement d'incident.
  useEffect(() => {
    setDonnees(null);
    setMessage('');
    charger();
  }, [charger]);

  // Affiche un message de succès puis recharge le détail.
  const apresAction = async (texte) => {
    setMessage(texte);
    await charger();
  };

  if (!donnees) {
    return (
      <div className="detail">
        <button className="secondaire" onClick={onRetour}>
          Retour à la liste
        </button>
        {erreur ? (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        ) : (
          <p className="note">Chargement...</p>
        )}
      </div>
    );
  }

  const { incident, signalements, transitionsPossibles, nbConfirmations } = donnees;
  const ouvert = incident.statut === 'nouveau' || incident.statut === 'pris_en_charge';

  return (
    <div className="detail">
      <div className="detail-entete">
        <button className="secondaire" onClick={onRetour}>
          Retour à la liste
        </button>
        <h2>Incident : {incident.libelle}</h2>
        <span className="badge" style={{ background: COULEUR_STATUT[incident.statut] }}>
          {incident.libelleStatut}
        </span>
      </div>

      <p className="resume">
        Score : <strong>{formaterScore(incident.score)}</strong> · Signalements : <strong>{incident.nbSignalements}</strong> · Utilisateurs distincts :{' '}
        <strong>{incident.nbUtilisateurs}</strong> (dont {nbConfirmations} confirmation(s)) · Premier signalement : {formaterDate(incident.premierSignalement)} ({formaterJours(incident.ageJours)})
      </p>

      {erreur && (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      )}
      {message && <p className="succes">{message}</p>}

      <div className="detail-grille">
        <section className="bloc">
          <h3>Position</h3>
          <MapContainer key={incident.id} center={[incident.position.lat, incident.position.lng]} zoom={17} className="carte-detail">
            <TileLayer attribution='&copy; contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
            <CircleMarker center={[incident.position.lat, incident.position.lng]} radius={12} pathOptions={{ color: '#222', weight: 2, fillColor: COULEUR_STATUT[incident.statut], fillOpacity: 0.35 }} />
            {signalements.map((s) => (
              <CircleMarker key={s.id} center={[s.position.lat, s.position.lng]} radius={5} pathOptions={{ color: '#222', weight: 1, fillColor: s.rejete ? '#999' : '#1f5fbf', fillOpacity: 0.9 }} />
            ))}
          </MapContainer>
          <p className="note">Grand cercle : position centrale de l'incident. Points bleus : signalements. Points gris : signalements rejetés.</p>
        </section>

        <section className="bloc">
          <h3>Changer le statut</h3>
          <FormulaireStatut incident={incident} transitions={transitionsPossibles} onFait={apresAction} onErreur={setErreur} />

          <h3>Historique</h3>
          <ul className="historique">
            {[...incident.historique].reverse().map((h, k) => (
              <li key={k}>
                <strong>{h.libelleStatut}</strong> le {formaterDate(h.date)} par {h.agent ? h.agent.nom : 'le système'}
                {h.motif ? ` : ${h.motif}` : ''}
              </li>
            ))}
          </ul>

          {ouvert && (
            <>
              <h3>Doublon</h3>
              <Fusion incident={incident} onFusionne={onOuvrir} onErreur={setErreur} />
            </>
          )}
        </section>
      </div>

      <section className="bloc">
        <h3>Signalements rattachés</h3>
        <div className="tableau-conteneur">
          <table>
            <thead>
              <tr>
                <th>Auteur</th>
                <th>Date</th>
                <th>Description</th>
                <th>Photo</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {signalements.map((s) => (
                <LigneSignalement key={s.id} s={s} onFait={apresAction} onErreur={setErreur} />
              ))}
            </tbody>
          </table>
        </div>
        <p className="note">L'identité des auteurs n'est visible que dans cet espace : elle n'est jamais montrée aux autres citoyens.</p>
      </section>
    </div>
  );
}
