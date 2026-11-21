// Crée (ou promeut) un compte agent municipal. Il n'existe aucune route publique pour cela, volontairement.
// Utilisation :
//   npm run creer-agent -- --nom "Agent Test" --email agent@exemple.tn --motdepasse "<mot de passe>"
// Le mot de passe peut aussi venir de la variable d'environnement AGENT_MOT_DE_PASSE.
const { parseArgs } = require('node:util');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const config = require('../src/config');
const User = require('../src/models/User');

// Crée ou promeut un compte agent à partir des arguments de la ligne de commande.
async function main() {
  const { values } = parseArgs({
    options: { nom: { type: 'string' }, email: { type: 'string' }, motdepasse: { type: 'string' } },
  });
  const nom = values.nom || 'Agent municipal';
  const email = (values.email || '').trim().toLowerCase();
  const motDePasse = values.motdepasse || process.env.AGENT_MOT_DE_PASSE || '';

  if (!email || motDePasse.length < 8) {
    console.error('Usage : npm run creer-agent -- --nom "Agent Test" --email agent@exemple.tn --motdepasse "<8 caractères minimum>"');
    process.exit(1);
  }

  await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 5000 });
  await User.init();
  const motDePasseHache = await bcrypt.hash(motDePasse, config.bcryptRounds);

  const existant = await User.findOne({ email });
  if (existant) {
    existant.role = 'agent';
    existant.bloque = false;
    existant.motDePasseHache = motDePasseHache;
    await existant.save();
    console.log(`Compte existant promu agent : ${email}`);
  } else {
    await User.create({ nom, email, motDePasseHache, role: 'agent' });
    console.log(`Agent créé : ${email}`);
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(`Échec : ${err.message}`);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
