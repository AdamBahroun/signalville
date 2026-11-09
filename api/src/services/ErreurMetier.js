// Erreur prévue par les règles de gestion : porte le code HTTP à renvoyer au client.
class ErreurMetier extends Error {
  constructor(statut, message) {
    super(message);
    this.statut = statut;
  }
}

module.exports = ErreurMetier;
