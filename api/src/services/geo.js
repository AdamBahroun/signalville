// Outils géographiques purs. Les coordonnées GeoJSON sont toujours [longitude, latitude].
const RAYON_TERRE_M = 6371008.8;
const rad = (deg) => (deg * Math.PI) / 180;

// Distance en mètres entre deux points (formule de haversine).
function distanceMetres([lng1, lat1], [lng2, lat2]) {
  const dLat = rad(lat2 - lat1);
  const dLng = rad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * RAYON_TERRE_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

// Centre d'un groupe de points : moyenne simple, suffisante à l'échelle d'une commune.
function centre(points) {
  if (points.length === 0) return null;
  const somme = points.reduce((s, [lng, lat]) => [s[0] + lng, s[1] + lat], [0, 0]);
  return [somme[0] / points.length, somme[1] / points.length];
}

const coordonneesValides = (lng, lat) =>
  typeof lng === 'number' && typeof lat === 'number' && Number.isFinite(lng) && Number.isFinite(lat) && lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90;

module.exports = { distanceMetres, centre, coordonneesValides };
