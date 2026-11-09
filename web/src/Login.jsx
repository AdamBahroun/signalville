import { useState } from 'react';
import { connecter, verifierAcces } from './api.js';

export default function Login({ onConnecte }) {
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [erreur, setErreur] = useState('');
  const [enCours, setEnCours] = useState(false);

  async function soumettre(e) {
    e.preventDefault();
    setErreur('');
    setEnCours(true);
    try {
      const { jeton, utilisateur } = await connecter(email.trim(), motDePasse);
      // Le site est réservé aux administrateurs : on vérifie côté API (200 = administrateur, 403 = citoyen).
      const code = await verifierAcces(jeton);
      if (code === 403) throw new Error("Cet espace est réservé aux administrateurs municipaux (l'API a répondu 403).");
      if (code !== 200) throw new Error('Accès refusé par le serveur.');
      onConnecte({ jeton, utilisateur });
    } catch (err) {
      setErreur(err.message);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <main className="carte-connexion">
      <h1>TuniIns</h1>
      <p className="sous-titre">Espace d'administration</p>
      <form onSubmit={soumettre}>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoFocus autoComplete="username" />
        </label>
        <label>
          Mot de passe
          <input type="password" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} required autoComplete="current-password" />
        </label>
        {erreur && (
          <p className="erreur" role="alert">
            {erreur}
          </p>
        )}
        <button type="submit" disabled={enCours}>
          {enCours ? 'Connexion...' : 'Se connecter'}
        </button>
      </form>
    </main>
  );
}
