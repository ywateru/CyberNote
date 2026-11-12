# Third-party components

Third-party rights are preserved independently of the private project's license.

- Noto Sans CJK SC: `src-tauri/fonts/OFL.txt` and the adjacent font README preserve
  SIL OFL 1.1, original font metadata, source pin and attribution.
- CyberGrid coordinator: `services/coordinator/LICENSE` and
  `services/coordinator/notices/` preserve upstream and npm dependency notices.
- CyberGrid Rust SDK and providers: `vendor/cybergrid-sdk/LICENSE`, its root
  `THIRD_PARTY_NOTICES.md` and `licenses/`, plus `provider-assets/` notices retain
  the fixed upstream SDK and provider terms independently.
- Native account integration: `scripts/publish/notices/rust/` retains the
  original notices for oauth2 5.0.0 (MIT OR Apache-2.0), openidconnect 4.1.0
  (MIT), tauri-plugin-opener 2.7.3 and tauri-plugin-deep-link 2.6.3
  (Apache-2.0 OR MIT). `NOTICE.provenance.json` records crates.io archive
  checksums matched to Cargo.lock, original archive paths and retained hashes.
- Local Tauri plugins retain their declared component licenses in Cargo manifests.
- Rust and frontend dependencies retain their upstream licenses; the lockfiles
  identify exact dependency versions. Further binary distribution must include
  the notices required by those dependencies; a source allowlist is not a claim
  that all downstream legal review is complete.
- New foreign SDK inputs require a pinned origin/revision, exact source hashes
  and retained license paths in `scripts/publish/manifest.json` before export.
  Project-authored crates instead declare their exact first-party roots and
  reserved project-rights source; that declaration grants no third-party license.
  Prebuilt providers require exact runtime-asset path/hash/size and pinned HTTPS
  source/license metadata matching the retained provider manifest. The package
  notice sidecar includes explicitly declared dependency notices regardless of
  filename. Local caches and development executables are never implicit inputs.
