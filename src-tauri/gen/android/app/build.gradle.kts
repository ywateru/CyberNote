import java.util.Properties
import groovy.json.JsonSlurper
import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("rust")
}

val tauriProperties = Properties().apply {
    val propFile = file("tauri.properties")
    if (propFile.exists()) {
        propFile.inputStream().use { load(it) }
    }
}

// package.json is the application version source; Tauri/Cargo are checked beforeBuild.
val cyberNoteVersion = (JsonSlurper().parse(file("../../../../package.json")) as Map<*, *>)["version"] as String
val cyberNoteParts = cyberNoteVersion.split(".").map { it.toInt() }
val cyberNoteVersionCode = cyberNoteParts[0] * 1_000_000 + cyberNoteParts[1] * 1_000 + cyberNoteParts[2]
require(cyberNoteParts[1] < 1000 && cyberNoteParts[2] < 1000 && cyberNoteVersionCode > 0) { "Version cannot be encoded as an Android versionCode" }
require(tauriProperties.getProperty("tauri.android.versionName", cyberNoteVersion) == cyberNoteVersion) { "Tauri Android version differs from package.json" }

android {
    compileSdk = 36
    namespace = "com.local.notesclone"
    defaultConfig {
        manifestPlaceholders["usesCleartextTraffic"] = "false"
        applicationId = "com.local.notesclone"
        minSdk = 26
        targetSdk = 36
        versionCode = cyberNoteVersionCode
        versionName = cyberNoteVersion
    }
    // CyberBus is linked into the Rust library; no external provider executable.
    packaging.jniLibs.excludes.add("**/libcloudflared.so")
    buildTypes {
        getByName("debug") {
            manifestPlaceholders["usesCleartextTraffic"] = "true"
            isDebuggable = true
            isJniDebuggable = true
            isMinifyEnabled = false
            packaging {
                jniLibs.keepDebugSymbols.add("*/arm64-v8a/*.so")
                jniLibs.keepDebugSymbols.add("*/armeabi-v7a/*.so")
                jniLibs.keepDebugSymbols.add("*/x86/*.so")
                jniLibs.keepDebugSymbols.add("*/x86_64/*.so")
            }
        }
        getByName("release") {
            optimization {
               enable = true
            }
            proguardFiles(
                *fileTree(".") {
                  include("**/*.pro")
                  exclude("build/**")
                }.files.toTypedArray()
            )
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_1_8
        targetCompatibility = JavaVersion.VERSION_1_8
    }
    buildFeatures {
        buildConfig = true
    }
}

kotlin {
    compilerOptions {
        jvmTarget = JvmTarget.JVM_1_8
    }
}

rust {
    rootDirRel = "../../../"
}

dependencies {
    implementation("androidx.webkit:webkit:1.14.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("androidx.activity:activity-ktx:1.10.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.lifecycle:lifecycle-process:2.10.0")
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.1.4")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.5.0")
}

apply(from = file("tauri.build.gradle.kts"))
