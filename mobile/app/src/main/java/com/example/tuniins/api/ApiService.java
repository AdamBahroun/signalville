package com.example.tuniins.api;

import okhttp3.MultipartBody;
import okhttp3.RequestBody;
import retrofit2.Call;
import retrofit2.http.Body;
import retrofit2.http.GET;
import retrofit2.http.Multipart;
import retrofit2.http.POST;
import retrofit2.http.Part;
import retrofit2.http.Path;
import retrofit2.http.Query;

public interface ApiService {
    @POST("auth/register")
    Call<InscriptionResponse> inscrire(@Body RegisterRequest corps);

    @POST("auth/login")
    Call<LoginResponse> connecter(@Body LoginRequest corps);

    @GET("categories")
    Call<CategoriesResponse> categories();

    // Envoi multipart : les champs texte sont des RequestBody (un String passerait par Gson et arriverait entre guillemets).
    // La photo est facultative : un @Part null est tout simplement omis par Retrofit.
    @Multipart
    @POST("reports")
    Call<SignalementResponse> creerSignalement(
            @Part("categorie") RequestBody categorie,
            @Part("description") RequestBody description,
            @Part("lat") RequestBody lat,
            @Part("lng") RequestBody lng,
            @Part MultipartBody.Part photo);

    // lat et lng en texte : l'API n'accepte que 12 décimales au plus, un double Java peut en produire davantage.
    @GET("incidents")
    Call<IncidentsResponse> incidentsProches(@Query("lat") String lat, @Query("lng") String lng, @Query("rayon") int rayon);

    @POST("incidents/{id}/confirm")
    Call<ConfirmationResponse> confirmer(@Path("id") String idIncident);

    @GET("me/reports")
    Call<MesSignalementsResponse> mesSignalements();
}
