package com.example.tuniins.outils;

import android.graphics.Color;
import java.text.ParseException;
import java.text.SimpleDateFormat;
import java.util.Date;
import java.util.Locale;
import java.util.TimeZone;

// Petites fonctions d'affichage : coordonnées, dates, couleur de statut, pluriel.
public final class FormatUtil {
    private FormatUtil() {}

    // L'API renvoie les dates en ISO 8601, en UTC, avec les millisecondes (2026-11-08T14:30:00.000Z).
    public static String date(String iso) {
        if (iso == null) return "";
        try {
            SimpleDateFormat entree = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            entree.setTimeZone(TimeZone.getTimeZone("UTC"));
            Date date = entree.parse(iso);
            return new SimpleDateFormat("dd/MM/yyyy HH:mm", Locale.FRANCE).format(date);
        } catch (ParseException e) {
            return iso;
        }
    }

    // Coordonnées envoyées à l'API : 6 décimales (environ 10 cm), point décimal, jamais de notation scientifique.
    public static String coordonnee(double valeur) {
        return String.format(Locale.US, "%.6f", valeur);
    }

    // Couleur du statut : orange nouveau, bleu pris en charge, vert résolu, rouge rejeté.
    public static int couleurStatut(String statut) {
        if ("pris_en_charge".equals(statut)) return Color.parseColor("#1565C0");
        if ("resolu".equals(statut)) return Color.parseColor("#2E7D32");
        if ("rejete".equals(statut)) return Color.parseColor("#C62828");
        return Color.parseColor("#EF6C00"); // nouveau
    }

    // Accorde un mot au singulier ou au pluriel selon le nombre.
    public static String pluriel(int nombre, String singulier, String pluriel) {
        return nombre + " " + (nombre > 1 ? pluriel : singulier);
    }
}
