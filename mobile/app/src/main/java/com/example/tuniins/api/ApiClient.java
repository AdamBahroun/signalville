package com.example.tuniins.api;

import android.content.Context;
import java.util.concurrent.TimeUnit;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.logging.HttpLoggingInterceptor;
import retrofit2.Retrofit;
import retrofit2.converter.gson.GsonConverterFactory;

// Client Retrofit unique de l'application, avec le jeton de session ajouté à chaque requête.
public class ApiClient {
    private static ApiService service;

    // Renvoie l'instance partagée de l'API (créée au premier appel).
    public static synchronized ApiService get(Context contexte) {
        if (service == null) {
            final Context app = contexte.getApplicationContext();

            HttpLoggingInterceptor journal = new HttpLoggingInterceptor();
            journal.setLevel(HttpLoggingInterceptor.Level.BASIC);

            OkHttpClient client = new OkHttpClient.Builder()
                    .addInterceptor(chain -> {
                        Request.Builder requete = chain.request().newBuilder();
                        String jeton = new SessionManager(app).getJeton();
                        if (jeton != null) requete.header("Authorization", "Bearer " + jeton);
                        return chain.proceed(requete.build());
                    })
                    .addInterceptor(journal)
                    .connectTimeout(10, TimeUnit.SECONDS)
                    .readTimeout(30, TimeUnit.SECONDS)
                    .writeTimeout(30, TimeUnit.SECONDS)
                    .build();

            service = new Retrofit.Builder()
                    .baseUrl(ApiConfig.BASE_URL)
                    .client(client)
                    .addConverterFactory(GsonConverterFactory.create())
                    .build()
                    .create(ApiService.class);
        }
        return service;
    }
}
