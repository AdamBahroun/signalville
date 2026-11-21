package com.example.tuniins.api;

// Réponse de POST /reports : incident créé ou rejoint (RG2).
public class SignalementResponse {
    public String reportId;
    public String incidentId;
    public boolean nouvelIncident;
    public String photoUrl;
}
