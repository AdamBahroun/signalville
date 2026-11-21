// Photos des signalements (F2) : réception avec Multer, contrôle du vrai type du fichier, enregistrement sous un nom aléatoire.
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const multer = require('multer');
const ErreurMetier = require('./ErreurMetier');

const DOSSIER = path.join(__dirname, '..', '..', 'uploads');
const TAILLE_MAX = 5 * 1024 * 1024; // 5 Mo

// Multer garde le fichier en mémoire : rien n'est écrit sur le disque tant que les règles RG6 et RG9 n'ont pas été vérifiées.
const recevoir = multer({ storage: multer.memoryStorage(), limits: { fileSize: TAILLE_MAX, files: 1, fields: 10 } }).single('photo');

// Le type annoncé par le client (Content-Type) est falsifiable : on lit les premiers octets du fichier pour connaître son vrai format.
function detecterFormat(tampon) {
  if (tampon.length >= 3 && tampon[0] === 0xff && tampon[1] === 0xd8 && tampon[2] === 0xff) return { ext: 'jpg', type: 'image/jpeg' };
  if (tampon.length >= 8 && tampon.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return { ext: 'png', type: 'image/png' };
  return null;
}

// Middleware : traite le multipart seulement si la requête en est un (les appels JSON passent sans changement).
function recevoirPhotoFacultative(req, res, next) {
  if (!req.is('multipart/form-data')) return next();
  recevoir(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') return next(new ErreurMetier(413, 'La photo dépasse 5 Mo.'));
    if (err instanceof multer.MulterError) return next(new ErreurMetier(400, 'Envoi de la photo invalide : un seul fichier, dans le champ "photo".'));
    next(err);
  });
}

// Vérifie le fichier reçu (s'il y en a un) sans rien écrire. Retourne null s'il n'y a pas de photo.
function verifierPhoto(file) {
  if (!file) return null;
  const format = detecterFormat(file.buffer);
  if (!format) throw new ErreurMetier(400, 'La photo doit être une image JPEG ou PNG.');
  return { tampon: file.buffer, ...format };
}

// Écrit la photo sous un nom aléatoire (le nom envoyé par le client n'est jamais utilisé : pas de chemin piégé, pas de collision).
async function enregistrerPhoto(photo) {
  await fs.promises.mkdir(DOSSIER, { recursive: true });
  const nom = `${crypto.randomBytes(16).toString('hex')}.${photo.ext}`;
  await fs.promises.writeFile(path.join(DOSSIER, nom), photo.tampon, { flag: 'wx' });
  return `/uploads/${nom}`;
}

// Supprime un fichier photo du disque (sans erreur s'il n'existe pas).
async function supprimerPhoto(url) {
  if (!url) return;
  await fs.promises.rm(path.join(DOSSIER, path.basename(url)), { force: true });
}

module.exports = { DOSSIER, TAILLE_MAX, recevoirPhotoFacultative, verifierPhoto, enregistrerPhoto, supprimerPhoto, detecterFormat };
