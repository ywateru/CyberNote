use super::cloud_sync::{crypto, model::*};
#[test]
fn encrypted_roundtrip_and_wrong_password() {
    let b = Bundle::empty(uuid::Uuid::new_v4().to_string());
    let a = crypto::encrypt(&b, "fixture-password").unwrap();
    let c = crypto::encrypt(&b, "fixture-password").unwrap();
    assert_ne!(a, c);
    assert_eq!(
        crypto::decrypt(&a, "fixture-password").unwrap().digest(),
        b.digest()
    );
    assert_eq!(
        crypto::decrypt(&a, "wrong-password").err().unwrap().code,
        "password"
    );
}
#[path = "engine_tests.rs"]
mod engine_tests;
#[path = "fixture.rs"]
mod fixture;
#[path = "protocol_tests.rs"]
mod protocol_tests;
#[path = "settings_regressions.rs"]
mod settings_regressions;
