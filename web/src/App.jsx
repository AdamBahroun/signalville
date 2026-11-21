import { useCallback, useEffect, useState } from 'react';
import Login from './Login.jsx';
import Incidents from './Incidents.jsx';
import IncidentDetail from './IncidentDetail.jsx';
import CarteChaleur from './CarteChaleur.jsx';
import Statistiques from './Statistiques.jsx';
import Utilisateurs from './Utilisateurs.jsx';
import Parametres from './Parametres.jsx';
import { lireSession, ecrireSession, effacerSession, definirSurSessionExpiree, verifierAcces } from './api.js';

const ONGLETS = [
  { cle: 'incidents', libelle: 'Incidents' },
  { cle: 'chaleur', libelle: 'Carte de chaleur' },
  { cle: 'stats', libelle: 'Statistiques' },
  { cle: 'utilisateurs', libelle: 'Utilisateurs' },
  { cle: 'parametres', libelle: 'Paramètres' },
];

// Racine du site : connexion, onglets de l'administration et détail d'un incident.
export default function App() {
  const [session, setSession] = useState(lireSession); // session de l'administrateur (jeton, nom), null si déconnecté
  const [onglet, setOnglet] = useState('incidents'); // onglet affiché
  const [incidentOuvert, setIncidentOuvert] = useState(null); // identifiant de l'incident affiché en détail

  // Ferme la session et revient à l'écran de connexion.
  const deconnecter = useCallback(() => {
    effacerSession();
    setSession(null);
    setIncidentOuvert(null);
    setOnglet('incidents');
  }, []);

  // Enregistre la session après une connexion réussie.
  const ouvrirSession = (s) => {
    ecrireSession(s);
    setSession(s);
  };

  // Jeton expiré ou compte bloqué : n'importe quel appel qui reçoit 401 renvoie vers la connexion.
  useEffect(() => {
    definirSurSessionExpiree(deconnecter);
  }, [deconnecter]);

  // Au chargement d'une session existante, on vérifie qu'elle donne toujours accès à l'administration.
  useEffect(() => {
    if (!session) return;
    verifierAcces(session.jeton)
      .then((code) => {
        if (code === 401 || code === 403) deconnecter();
      })
      .catch(() => {});
  }, [session, deconnecter]);

  if (!session) return <Login onConnecte={ouvrirSession} />;

  // Change d'onglet et ferme le détail d'incident ouvert.
  const choisirOnglet = (cle) => {
    setOnglet(cle);
    setIncidentOuvert(null);
  };

  return (
    <div className="page">
      <header className="entete">
        <strong>TuniIns : administration</strong>
        <span>
          {session.utilisateur.nom}
          <button className="secondaire" onClick={deconnecter}>
            Déconnexion
          </button>
        </span>
      </header>
      <nav className="onglets">
        {ONGLETS.map((o) => (
          <button key={o.cle} className={o.cle === onglet ? 'onglet actif' : 'onglet'} onClick={() => choisirOnglet(o.cle)}>
            {o.libelle}
          </button>
        ))}
      </nav>
      <main className="zone">
        {onglet === 'incidents' && !incidentOuvert && <Incidents onOuvrir={setIncidentOuvert} />}
        {onglet === 'incidents' && incidentOuvert && <IncidentDetail id={incidentOuvert} onRetour={() => setIncidentOuvert(null)} onOuvrir={setIncidentOuvert} />}
        {onglet === 'chaleur' && <CarteChaleur />}
        {onglet === 'stats' && <Statistiques />}
        {onglet === 'utilisateurs' && <Utilisateurs />}
        {onglet === 'parametres' && <Parametres />}
      </main>
    </div>
  );
}
