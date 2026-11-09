plugins {
    alias(libs.plugins.android.application)
}

android {
    namespace = "com.example.tuniins"
    compileSdk {
        version = release(37)
    }

    defaultConfig {
        applicationId = "com.example.tuniins"
        minSdk = 24
        targetSdk = 37
        versionCode = 1
        versionName = "1.0"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
    }

    buildTypes {
        release {
            optimization {
                enable = true
                packageScope = setOf("androidx.**", "kotlin.**", "kotlinx.**")
            }
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
    }
    buildFeatures {
        viewBinding = true
    }
}

dependencies {
    implementation(libs.activity.ktx)
    implementation(libs.appcompat)
    implementation(libs.constraintlayout)
    implementation(libs.material)
    implementation(libs.navigation.fragment)
    implementation(libs.navigation.ui)
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("org.osmdroid:osmdroid-android:6.1.20") // carte OpenStreetMap
    implementation("androidx.recyclerview:recyclerview:1.4.0") // liste « Mes signalements »
    testImplementation(libs.junit)
    androidTestImplementation(libs.espresso.core)
    androidTestImplementation(libs.ext.junit)
}

tasks.register<Exec>("adbReverse") {
    val androidHome = System.getenv("ANDROID_HOME") ?: System.getenv("ANDROID_SDK_ROOT") ?: "${System.getProperty("user.home")}/AppData/Local/Android/Sdk"
    val adbExecutable = File(androidHome, "platform-tools/adb").absolutePath
    commandLine(adbExecutable, "reverse", "tcp:3000", "tcp:3000")
    isIgnoreExitValue = true
}

tasks.named("preBuild") {
    dependsOn("adbReverse")
}