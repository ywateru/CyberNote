# CyberBus git dependency provenance and distribution boundary

Source: https://github.com/osd-pub/CyberBus.git
Commit: 359465e83bd74b571a963f3d1fdc238f50169919

The application adapter `crates/notes-cyberbus` uses Cargo git dependencies for
`cyberbus` and `cyberbus-auth`, with the same exact revision, including macOS
`platform-keyring`. Cargo resolves embedded EasyTier path dependencies from that
same git checkout; there is no dependency on a developer's sibling directory.
The SDK needs Rust 1.95 or later and host protoc for EasyTier code generation.
Cargo.lock is the resolved source/checksum inventory; keep it with source.

Retained original texts from this revision:

- root LICENSE-MIT and LICENSE-APACHE;
- packaging/licenses/LGPL-3.0.txt and GPL-3.0.txt;
- vendor/easytier/LICENSE (retained as EasyTier-LICENSE);
- vendor/easytier/README.cyberbus.md (retained as EasyTier-NOTICE.md).

CyberBus's workspace declares MIT OR Apache-2.0; cyberbus-transport declares
LGPL-3.0-or-later, and embedded EasyTier and its local modifications use LGPL.
Some SDK manifests omit license inheritance. The combined application must not
be described as exclusively MIT/Apache. These files do not change SDK licenses
or supply a project-wide license grant.

Source exports fetch the fixed git revision through Cargo. The old
vendor/cybergrid-sdk and services/coordinator may remain as historical source;
they are not production account dependencies. No cloudflared helper is bundled
or downloaded by this integration. SDK optional cloudflared experiment/features
must stay disabled in the application dependency graph.

Before distributing a statically linked native application, provide exact
corresponding SDK/EasyTier/dependency sources (including modifications), dependency
licenses and relinkable application objects or corresponding application sources
and build instructions. A git URL and license sidecar alone are insufficient.
Preserve users' ability to debug modifications to the LGPL component, and provide
app-specific signing/reinstallation instructions where required. The upstream
packaging/RELINK.md describes SDK archives; this application links Rust crates
directly and requires its own complete relinking materials. No complete LGPL
source/object closure or legal acceptance is asserted by these platform tests.
