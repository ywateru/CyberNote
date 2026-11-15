pluginManagement {
    repositories { google(); mavenCentral(); gradlePluginPortal() }
    plugins {
        id("com.android.library") version "9.3.1"
        id("com.android.application") version "9.3.1"
        id("org.jetbrains.kotlin.android") version "2.2.10"
    }
}
dependencyResolutionManagement { repositories { google(); mavenCentral() } }
rootProject.name = "notes-scan-standalone"
// In a Tauri app this directory is included as a library; this file is for isolated module checks.
include(":tauri-android")
project(":tauri-android").projectDir = file(providers.gradleProperty("tauriAndroidPath").orNull
    ?: error("Pass -PtauriAndroidPath=/path/to/tauri/mobile/android for isolated compilation"))
include(":harness")
