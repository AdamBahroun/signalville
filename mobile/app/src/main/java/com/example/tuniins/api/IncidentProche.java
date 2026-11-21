package com.example.tuniins.api;

// Incident ouvert affiché sur la carte, sans score ni auteur.
public class IncidentProche {
    public String id;
    public String categorie;
    public String libelle;
    public Position position;
    public int distanceMetres;
    public int nbSignalements;
    public int nbPersonnes;
    public String statut;
    public String libelleStatut;
    public String premierSignalement;
    public boolean monSignalement;
    public boolean dejaConfirme;
}
