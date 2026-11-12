# Third-party components

Third-party rights are preserved independently of the private project's license.

- Noto Sans CJK SC: `src-tauri/fonts/OFL.txt` and the adjacent font README preserve
  SIL OFL 1.1, original font metadata, source pin and attribution.
- CyberGrid coordinator: `services/coordinator/LICENSE` and
  `services/coordinator/notices/` preserve upstream and npm dependency notices.
- Local Tauri plugins retain their declared component licenses in Cargo manifests.
- Rust and frontend dependencies retain their upstream licenses; the lockfiles
  identify exact dependency versions. Further binary distribution must include
  the notices required by those dependencies; a source allowlist is not a claim
  that all downstream legal review is complete.
- New SDK/provider inputs require a pinned origin/revision, exact source hashes
  and license paths in `scripts/publish/manifest.json` before export. Prebuilt
  providers must use reviewed versioned download/checksum/license metadata;
  local caches and development executables are never an implicit input.
