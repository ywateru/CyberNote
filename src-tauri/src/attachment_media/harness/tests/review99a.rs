#[tokio::test(flavor = "current_thread")]
async fn corrupt_idat_cache_must_regenerate() {
    notes_media_core_tests::corrupt_idat_cache_must_regenerate().await;
}

#[tokio::test(flavor = "current_thread")]
async fn restarted_corrupt_idat_cache_must_regenerate() {
    notes_media_core_tests::restarted_corrupt_idat_cache_must_regenerate().await;
}
