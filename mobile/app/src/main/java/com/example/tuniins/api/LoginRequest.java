package com.example.tuniins.api;

public class LoginRequest {
    public String email;
    public String motDePasse;

    public LoginRequest(String email, String motDePasse) {
        this.email = email;
        this.motDePasse = motDePasse;
    }
}
