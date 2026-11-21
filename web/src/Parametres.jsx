import { useEffect, useState } from 'react';
import { listerCategories, modifierCategorie } from './api.js';

// Une ligne du tableau : rayon de regroupement (RG2) et poids (RG4) modifiables.
function LigneCategorie({ categorie, onEnregistre, onErreur }) {
  const [rayon, setRayon] = useState(String(categorie.rayonMetres)); // rayon saisi (mètres)
  const [poids, setPoids] = useState(String(categorie.poids)); // poids saisi
  const [enCours, setEnCours] = useState(false); // vrai pendant l'appel à l'API
  // Vrai tant que les valeurs saisies sont celles déjà enregistrées.
  const inchange = rayon === String(categorie.rayonMetres) && poids === String(categorie.poids);

  // Envoie la modification de la catégorie à l'API.
  async function enregistrer() {
    setEnCours(true);
    onErreur('');
    try {
      const r = await modifierCategorie(categorie.nom, { rayonMetres: Number(rayon), poids: Number(poids) });
      onEnregistre(r.categorie);
    } catch (err) {
      onErreur(err.message);
    } finally {
      setEnCours(false);
    }
  }

  return (
    <tr>
      <td>{categorie.libelle}</td>
      <td>
        <input type="number" min="1" max="5000" step="1" value={rayon} onChange={(e) => setRayon(e.target.value)} className="court" />
      </td>
      <td>
        <input type="number" min="0" max="20" step="1" value={poids} onChange={(e) => setPoids(e.target.value)} className="court" />
      </td>
      <td>
        <button onClick={enregistrer} disabled={inchange || enCours}>
          Enregistrer
        </button>
      </td>
    </tr>
  );
}

// Onglet « Paramètres » : réglage du rayon et du poids de chaque catégorie.
export default function Parametres() {
  const [categories, setCategories] = useState(null); // catégories chargées depuis l'API
  const [erreur, setErreur] = useState(''); // message d'erreur affiché
  const [message, setMessage] = useState(''); // message de succès affiché

  // Charge les catégories au premier affichage.
  useEffect(() => {
    listerCategories()
      .then((r) => setCategories(r.categories))
      .catch((err) => setErreur(err.message));
  }, []);

  // Remplace dans la liste la catégorie qui vient d'être modifiée.
  const remplacer = (maj) => {
    setCategories((liste) => liste.map((c) => (c.nom === maj.nom ? maj : c)));
    setMessage(`Catégorie « ${maj.libelle} » enregistrée.`);
  };

  return (
    <div className="detail">
      <h2>Paramètres des catégories</h2>
      <p className="note">
        Le rayon de regroupement (en mètres) ne s'applique qu'aux signalements futurs : les incidents existants ne sont pas regroupés de nouveau. Le poids modifie immédiatement le score de tous les incidents de la catégorie.
      </p>
      {erreur && (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      )}
      {message && <p className="succes">{message}</p>}
      <div className="tableau-conteneur">
        <table>
          <thead>
            <tr>
              <th>Catégorie</th>
              <th>Rayon (m)</th>
              <th>Poids</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {(categories ?? []).map((c) => (
              <LigneCategorie key={c.id} categorie={c} onEnregistre={remplacer} onErreur={setErreur} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
