package com.example.tuniins.api;

import java.util.List;

// Incident vu par son auteur : statut courant et historique.
public class IncidentSuivi {
    public String id;
    public String statut;
    public String libelleStatut;
    public int nbSignalements;
    public int nbPersonnes;
    public List<Changement> historique;
}
