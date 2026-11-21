package com.example.tuniins.api;

// Réponse de POST /incidents/:id/confirm : nouveaux compteurs de l'incident.
public class ConfirmationResponse {
    public String incidentId;
    public int nbSignalements;
    public int nbPersonnes;
    public boolean dejaConfirme;
}
