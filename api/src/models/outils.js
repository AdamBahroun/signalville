// Sortie JSON propre pour tous les modèles : un champ "id" au lieu de "_id", pas de "__v".
function appliquerToJSON(schema) {
  schema.set('toJSON', {
    transform: (_doc, ret) => {
      ret.id = ret._id.toString();
      delete ret._id;
      delete ret.__v;
      return ret;
    },
  });
}

module.exports = { appliquerToJSON };
