#[tokio::test(flavor = "current_thread")]
async fn creation_tagged_grant_release_and_incarnation() {
    notes_media_core_tests::platform_creation_tagged_grant_release_and_incarnation().await;
}
#[tokio::test(flavor = "current_thread")]
async fn prepare_sync_and_window_close_cancel_stalled_no_range() {
    notes_media_core_tests::platform_prepare_sync_and_window_close_cancel_stalled_no_range().await;
}
#[tokio::test(flavor = "current_thread")]
async fn metadata_keeps_unrelated_and_cancels_replaced_source() {
    notes_media_core_tests::platform_metadata_keeps_unrelated_and_cancels_replaced_source().await;
}
#[tokio::test(flavor = "current_thread")]
async fn cache_snapshot_clear_preserves_original_and_rejects_old_token() {
    notes_media_core_tests::platform_cache_snapshot_clear_preserves_original_and_rejects_old_token(
    )
    .await;
}
#[tokio::test(flavor = "current_thread")]
async fn stopped_and_invalid_start_are_explicit_errors() {
    notes_media_core_tests::platform_stopped_and_invalid_start_are_explicit_errors().await;
}
#[tokio::test(flavor = "current_thread")]
async fn zero_lease_soft_and_actual_sync_delete_reclaim_cache() {
    notes_media_core_tests::platform_zero_lease_soft_and_actual_sync_delete_reclaim_cache().await;
}
#[tokio::test(flavor = "current_thread")]
async fn overlapping_prepare_requires_each_own_terminal() {
    notes_media_core_tests::platform_overlapping_prepare_requires_each_own_terminal().await;
}
