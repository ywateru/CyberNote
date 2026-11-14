# First staging-fix owned App collector

Source: `29c878108b2ea421b5e4fccd71547206071fdbfa`. The reviewed collector ran once against the existing owned live02 A/B with the independently approved mac-29c87810 package.

Result: **FAIL before push submission**, `pushSubmitted=false`. Both clients first reported restored profile/enabled state with empty device lists. B then reported `account_directory_unavailable` during restore. Both SDK diagnostic rings contain only `coordination-ready`; there were no map or transfer records and no operation terminal because no operation was submitted. This run does not exercise or reject the staging publication fix.

The directory API maps request errors, non-success HTTP statuses (except unsupported-route statuses), response decoding/validation and response size failures to this same finite code. No HTTP status or exact register/list failure location was observed; no narrower cause is claimed. The collector preserved the error and stopped. No retry or fresh full runner followed.

A and B both exited naturally with code 0; process and pipe close confirmed, no forced signals. Cleanup completed. Source remained clean at the exact frozen revision and the original live02 first-result hash was unchanged. The original output and owned libraries are retained; no grant/Noise copies or default-library access occurred. This report contains only the collector's finite safe projection, no raw logs, URLs, IDs, credentials or note payload.

Main and the package artifact were not modified. This docs-only archive stays on the author branch pending parent review.
