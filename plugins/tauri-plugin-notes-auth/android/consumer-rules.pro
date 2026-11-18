# Host-only Kotlin entry points are looked up by the existing Tauri native bridge.
-keep class com.local.notesauth.** { *; }

# Called only by the native Rust SecureStore owner through JNI, never renderer IPC.
-keep class com.local.notesauth.CyberBusSecureStore { public *; }
