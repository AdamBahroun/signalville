package com.example.tuniins.api;

import java.util.List;

public class IncidentSuivi {
    public String id;
    public String statut;
    public String libelleStatut;
    public int nbSignalements;
    public int nbPersonnes;
    public List<Changement> historique;
}
