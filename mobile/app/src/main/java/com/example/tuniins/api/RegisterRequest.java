package com.example.tuniins.api;

public class RegisterRequest {
    public String nom;
    public String email;
    public String motDePasse;

    public RegisterRequest(String nom, String email, String motDePasse) {
        this.nom = nom;
        this.email = email;
        this.motDePasse = motDePasse;
    }
}
