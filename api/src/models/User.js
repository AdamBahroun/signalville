const mongoose = require('mongoose');

// Compte utilisateur : citoyen (application mobile) ou agent (site d'administration).
const userSchema = new mongoose.Schema(
  {
    nom: { type: String, required: true, trim: true, maxlength: 60 },
    // L'unicité est garantie par l'index MongoDB, pas seulement par un test dans le code.
    email: { type: String, required: true, unique: true, lowercase: true, trim: true, maxlength: 254 },
    // select: false => le hachage n'est jamais chargé sauf demande explicite (.select('+motDePasseHache')).
    motDePasseHache: { type: String, required: true, select: false },
    role: { type: String, enum: ['citoyen', 'agent'], default: 'citoyen' },
    bloque: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: 'dateCreation', updatedAt: false } }
);

// Tout ce qui sort de l'API passe par ici : jamais de hachage, un champ "id" propre.
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    ret.id = ret._id.toString();
    delete ret._id;
    delete ret.__v;
    delete ret.motDePasseHache;
    return ret;
  },
});

module.exports = mongoose.model('User', userSchema);
