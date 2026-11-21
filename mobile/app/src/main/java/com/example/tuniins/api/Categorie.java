package com.example.tuniins.api;

// Catégorie d'incident : nom technique et libellé affiché.
public class Categorie {
    public String nom;
    public String libelle;

    // Le Spinner affiche toString() : on veut le libellé, pas l'adresse mémoire de l'objet.
    @Override
    public String toString() {
        return libelle;
    }
}
