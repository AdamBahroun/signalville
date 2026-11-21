package com.example.tuniins.api;

// Corps de POST /me/device-token : le jeton Firebase de l'appareil.
public class JetonAppareilRequest {
    public final String jetonAppareil;

    // Crée le corps avec le jeton Firebase de l'appareil.
    public JetonAppareilRequest(String jetonAppareil) {
        this.jetonAppareil = jetonAppareil;
    }
}
