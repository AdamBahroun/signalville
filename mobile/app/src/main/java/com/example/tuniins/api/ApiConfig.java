package com.example.tuniins.api;

public class ApiConfig {
    // 127.0.0.1:3000 avec redirection ADB via USB (`adb reverse tcp:3000 tcp:3000`).
    // Sur l'émulateur Android : utilise "http://10.0.2.2:3000/"
    public static final String BASE_URL = "http://127.0.0.1:3000/";
}
