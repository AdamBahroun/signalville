package com.example.tuniins.api;

// Réponse de POST /auth/login : jeton d'accès et utilisateur.
public class LoginResponse {
    public String jeton;
    public String role;
    public Utilisateur utilisateur;
}
