package com.example.tuniins.api;

import com.google.gson.Gson;
import retrofit2.Response;

public class ErreurUtil {
    public static String message(Response<?> reponse) {
        try {
            ErreurApi e = new Gson().fromJson(reponse.errorBody().string(), ErreurApi.class);
            if (e != null && e.details != null && !e.details.isEmpty()) return e.details.values().iterator().next();
            if (e != null && e.erreur != null) return e.erreur;
        } catch (Exception ignore) {
            // corps absent ou illisible : message générique ci-dessous
        }
        return "Erreur " + reponse.code();
    }
}
