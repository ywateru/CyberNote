#[tokio::test(flavor = "current_thread")]
async fn purpose_metrics_use_real_tcp_bytes() {
    notes_media_core_tests::media_metrics_separate_real_original_and_thumbnail_tcp_bytes().await;
}
#[tokio::test(flavor = "current_thread")]
async fn provider_bounds_cache_and_late_revocation() {
    notes_media_core_tests::media_provider_handoff_validates_bounds_cache_and_late_revocation()
        .await;
}
#[cfg(all(target_os = "macos", feature = "native-provider-probe"))]
#[tokio::test(flavor = "current_thread")]
async fn actual_mac_video_fd_to_cache_to_http() {
    notes_media_core_tests::media_real_mac_fd_video_provider_cache_and_tcp().await;
}
