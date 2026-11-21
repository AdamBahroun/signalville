package com.example.tuniins.api;

// Corps de POST /auth/register.
public class RegisterRequest {
    public String nom;
    public String email;
    public String motDePasse;

    // Crée le corps d'inscription.
    public RegisterRequest(String nom, String email, String motDePasse) {
        this.nom = nom;
        this.email = email;
        this.motDePasse = motDePasse;
    }
}
