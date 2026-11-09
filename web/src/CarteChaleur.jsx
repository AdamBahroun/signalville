import { useEffect, useState } from 'react';
import L from 'leaflet';
import { MapContainer, TileLayer, useMap } from 'react-leaflet';
import { carteChaleur } from './api.js';
import { CENTRE_NABEUL } from './format.js';

// Couche de chaleur : le plugin leaflet.heat attend un objet L global, on le fournit puis on charge le plugin.
function CoucheChaleur({ points }) {
  const carte = useMap();
  useEffect(() => {
    let annule = false;
    let couche = null;
    (async () => {
      window.L = L;
      await import('leaflet.heat');
      if (annule || points.length === 0) return;
      const maximum = Math.max(1, ...points.map((p) => p.poids));
      couche = L.heatLayer(
        points.map((p) => [p.lat, p.lng, p.poids]),
        { radius: 30, blur: 25, maxZoom: 16, max: maximum }
      ).addTo(carte);
    })();
    return () => {
      annule = true;
      if (couche) carte.removeLayer(couche);
    };
  }, [points, carte]);
  return null;
}

export default function CarteChaleur() {
  const [points, setPoints] = useState(null);
  const [erreur, setErreur] = useState('');

  useEffect(() => {
    carteChaleur()
      .then((r) => setPoints(r.points))
      .catch((err) => setErreur(err.message));
  }, []);

  return (
    <div className="detail">
      <h2>Carte de chaleur des incidents ouverts</h2>
      <p className="note">Chaque incident ouvert pèse autant que son nombre de signalements. Les incidents résolus ou rejetés ne sont pas affichés.</p>
      {erreur && (
        <p className="erreur" role="alert">
          {erreur}
        </p>
      )}
      {points && points.length === 0 && <p className="note">Aucun incident ouvert à afficher.</p>}
      <MapContainer center={CENTRE_NABEUL} zoom={14} className="carte-pleine">
        <TileLayer attribution='&copy; contributeurs <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://tile.openstreetmap.org/{z}/{x}/{y}.png" />
        {points && <CoucheChaleur points={points} />}
      </MapContainer>
    </div>
  );
}
