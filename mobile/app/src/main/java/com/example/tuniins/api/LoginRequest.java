package com.example.tuniins.api;

// Corps de POST /auth/login.
public class LoginRequest {
    public String email;
    public String motDePasse;

    // Crée le corps de connexion.
    public LoginRequest(String email, String motDePasse) {
        this.email = email;
        this.motDePasse = motDePasse;
    }
}
