#[tokio::test(flavor = "current_thread")]
async fn two_note_quiet_prepare_and_window_isolation() {
    notes_media_core_tests::independent_two_note_quiet_prepare_and_window_isolation().await;
}
