#[tokio::test(flavor = "current_thread")]
async fn media_http_ranges_head_and_exact_no_range() {
    notes_media_core_tests::media_http_ranges_head_and_exact_no_range().await;
}

#[tokio::test(flavor = "current_thread")]
async fn media_http_rejects_host_origin_method_and_unknown_capability() {
    notes_media_core_tests::media_http_rejects_host_origin_method_and_unknown_capability().await;
}

#[tokio::test(flavor = "current_thread")]
async fn media_http_slow_consumers_backpressure_release_and_disconnect() {
    notes_media_core_tests::media_http_slow_consumers_backpressure_release_and_disconnect().await;
}

#[tokio::test(flavor = "current_thread")]
async fn media_http_parallel_ranges_do_not_share_seek_offsets() {
    notes_media_core_tests::media_http_parallel_ranges_do_not_share_seek_offsets().await;
}

#[tokio::test(flavor = "current_thread")]
async fn media_session_tokens_windows_prepare_delete_and_replacement() {
    notes_media_core_tests::media_session_tokens_windows_prepare_delete_and_replacement().await;
}

#[tokio::test(flavor = "current_thread")]
async fn media_prepare_hook_interrupts_a_stalled_real_stream() {
    notes_media_core_tests::media_prepare_hook_interrupts_a_stalled_real_stream().await;
}

#[tokio::test(flavor = "current_thread")]
async fn media_lease_idle_expiry_and_shutdown() {
    notes_media_core_tests::media_lease_idle_expiry_and_shutdown().await;
}

#[test]
fn media_store_rejects_symlinks_sizes_reserved_records_and_locked_owner() {
    notes_media_core_tests::media_store_rejects_symlinks_sizes_reserved_records_and_locked_owner();
}

#[tokio::test(flavor = "current_thread")]
async fn media_thumbnails_are_small_persistent_and_deduplicated() {
    notes_media_core_tests::media_thumbnails_are_small_persistent_and_deduplicated().await;
}

#[tokio::test(flavor = "current_thread")]
async fn media_raster_formats_and_restricted_svg_have_explicit_results() {
    notes_media_core_tests::media_raster_formats_and_restricted_svg_have_explicit_results().await;
}

#[tokio::test(flavor = "current_thread")]
async fn media_cache_quota_source_invalidation_and_cleanup() {
    notes_media_core_tests::media_cache_quota_source_invalidation_and_cleanup().await;
}

#[tokio::test(flavor = "current_thread")]
async fn media_thumbnail_revocation_during_generation_never_publishes() {
    notes_media_core_tests::media_thumbnail_revocation_during_generation_never_publishes().await;
}

#[tokio::test(flavor = "current_thread")]
async fn media_actual_file_read_is_discarded_when_session_revokes_before_publish() {
    notes_media_core_tests::media_actual_file_read_is_discarded_when_session_revokes_before_publish().await;
}
#[tokio::test(flavor = "current_thread")]
async fn media_cache_rejects_late_symlink_swap_and_bounded_output_leaves_no_temp() {
    notes_media_core_tests::media_cache_rejects_late_symlink_swap_and_bounded_output_leaves_no_temp().await;
}
#[tokio::test(flavor = "current_thread")]
async fn media_head_rejects_missing_cached_source_without_reading_payload() {
    notes_media_core_tests::media_head_rejects_missing_cached_source_without_reading_payload()
        .await;
}
#[tokio::test(flavor = "current_thread")]
async fn media_cached_png_truncation_recovers_without_bypassing_source_authority() {
    notes_media_core_tests::media_cached_png_truncation_recovers_without_bypassing_source_authority().await;
}
