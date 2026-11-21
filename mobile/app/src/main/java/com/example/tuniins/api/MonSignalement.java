package com.example.tuniins.api;

// Un de mes signalements, avec son incident, sa photo et l'historique.
public class MonSignalement {
    public String id;
    public String categorie;
    public String libelle;
    public String description;
    public String photoUrl;
    public String date;
    public Position position;
    public boolean rejete;
    public String motifRejet;
    public IncidentSuivi incident; // peut être null
}
