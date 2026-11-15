#[tokio::test(flavor = "current_thread")]
async fn chinese_latin_tspan_and_vector_styles() {
    notes_media_core_tests::svg104_visible_chinese_latin_tspan_and_vector_styles().await;
}
#[tokio::test(flavor = "current_thread")]
async fn missing_external_complexity() {
    notes_media_core_tests::svg104_rejects_missing_external_and_complexity_without_cache().await;
}
#[tokio::test(flavor = "current_thread")]
async fn real_http_cache_replacement_revocation() {
    notes_media_core_tests::svg104_text_real_http_cache_replacement_and_revocation().await;
}
#[tokio::test(flavor = "current_thread")]
async fn frozen_50_hash_and_text() {
    notes_media_core_tests::svg104_frozen_50_readonly_hash_and_visible_text().await;
}
