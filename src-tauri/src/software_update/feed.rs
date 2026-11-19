use super::version::Version;
use serde::{Deserialize, Serialize};

pub const FEED: &str = "https://api.github.com/repos/ywateru/CyberNote/releases";
pub const IDENTITY: &str = "com.local.notesclone";
pub const MAX_PACKAGE: u64 = 1024 * 1024 * 1024;
#[derive(Clone, Debug, Deserialize)]
pub struct Asset {
    pub name: String,
    pub size: u64,
    pub browser_download_url: String,
}
#[derive(Clone, Debug, Deserialize)]
pub struct GithubRelease {
    pub tag_name: String,
    #[serde(default)]
    pub body: Option<String>,
    pub draft: bool,
    pub prerelease: bool,
    pub assets: Vec<Asset>,
}
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Release {
    pub version: String,
    pub notes: String,
    pub url: String,
    pub package: String,
    pub size: u64,
    pub platform: String,
    pub architecture: String,
    #[serde(skip)]
    pub assets: Vec<Asset>,
}
#[derive(Clone, Debug)]
pub struct Target {
    pub platform: String,
    pub architecture: String,
}
impl Target {
    pub fn current() -> Self {
        Self {
            platform: match std::env::consts::OS {
                "macos" => "macos",
                "android" => "android",
                x => x,
            }
            .into(),
            architecture: match std::env::consts::ARCH {
                "aarch64" => "arm64",
                x => x,
            }
            .into(),
        }
    }
    fn stem(&self) -> String {
        format!("CyberNote-{}-{}", self.platform, self.architecture)
    }
    pub fn package(&self) -> Result<String, String> {
        if self.architecture != "arm64" {
            return Err("unsupported_platform".into());
        }
        match self.platform.as_str() {
            "macos" => Ok(format!("{}.zip", self.stem())),
            "android" => Ok(format!("{}-unsigned.apk", self.stem())),
            _ => Err("unsupported_platform".into()),
        }
    }
    pub fn receipt(&self) -> String {
        format!("{}.json", self.stem())
    }
    pub fn sums(&self) -> String {
        format!("{}.sha256", self.stem())
    }
}
/// Select newest eligible release first, then require its exact platform asset.
/// Never silently offer an older build when the newest release is incomplete.
pub fn select(
    releases: Vec<GithubRelease>,
    current: &str,
    preview: bool,
    target: &Target,
) -> Result<Option<Release>, String> {
    let current = Version::parse(current)?;
    let mut eligible = Vec::new();
    for r in releases {
        if r.draft {
            continue;
        }
        let Ok(v) = Version::parse(&r.tag_name) else {
            continue;
        };
        if v <= current || (!preview && (r.prerelease || v.prerelease())) {
            continue;
        }
        eligible.push((v, r));
    }
    eligible.sort_by(|a, b| b.0.cmp(&a.0));
    let Some((_, r)) = eligible.into_iter().next() else {
        return Ok(None);
    };
    let package = target.package()?;
    let asset = unique(&r.assets, &package)?;
    if asset.size == 0 || asset.size > MAX_PACKAGE {
        return Err("invalid_package_size".into());
    }
    unique(&r.assets, &target.sums())?;
    unique(&r.assets, &target.receipt())?;
    // Tags are reconstructed from validated SemVer, never an arbitrary URL from the feed.
    let version = r
        .tag_name
        .strip_prefix('v')
        .unwrap_or(&r.tag_name)
        .to_string();
    Ok(Some(Release {
        version,
        notes: r.body.unwrap_or_default(),
        url: format!(
            "https://github.com/ywateru/CyberNote/releases/tag/{}",
            r.tag_name
        ),
        package,
        size: asset.size,
        platform: target.platform.clone(),
        architecture: target.architecture.clone(),
        assets: r.assets,
    }))
}
pub fn unique<'a>(assets: &'a [Asset], name: &str) -> Result<&'a Asset, String> {
    let found: Vec<_> = assets.iter().filter(|a| a.name == name).collect();
    match found.as_slice() {
        [a] => Ok(a),
        [] => Err(format!("missing_asset: {name}")),
        _ => Err("ambiguous_asset".into()),
    }
}
pub fn checksum(text: &str, name: &str) -> Result<String, String> {
    let mut hashes = Vec::new();
    for line in text.lines() {
        let parts: Vec<_> = line.split_whitespace().collect();
        if parts.len() == 2 && parts[1].trim_start_matches('*') == name {
            if parts[0].len() != 64 || !parts[0].bytes().all(|c| c.is_ascii_hexdigit()) {
                return Err("invalid_checksum".into());
            }
            hashes.push(parts[0].to_ascii_lowercase());
        }
    }
    if hashes.len() != 1 {
        Err("missing_or_ambiguous_checksum".into())
    } else {
        Ok(hashes.remove(0))
    }
}
#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Receipt {
    pub schema: u32,
    pub platform: String,
    pub architecture: String,
    pub package: String,
    pub package_sha256: String,
    pub native_binary_sha256: String,
    pub build_info: serde_json::Value,
    #[serde(default, deserialize_with = "optional_release_identity")]
    pub release_version: Option<String>,
}
fn optional_release_identity<'de, D: serde::Deserializer<'de>>(
    deserializer: D,
) -> Result<Option<String>, D::Error> {
    String::deserialize(deserializer).map(Some)
}
fn matches_release_identity(value: &str, candidate: &str) -> bool {
    Version::parse(value).is_ok()
        && value.strip_prefix('v').unwrap_or(value)
            == candidate.strip_prefix('v').unwrap_or(candidate)
}
impl Receipt {
    pub fn validate(&self, r: &Release, hash: &str) -> Result<(), String> {
        let version = Version::parse(&r.version)?.package_version();
        if self
            .release_version
            .as_ref()
            .is_some_and(|v| !matches_release_identity(v, &r.version))
            || self.build_info.get("releaseVersion").is_some_and(|v| {
                v.as_str()
                    .is_none_or(|s| !matches_release_identity(s, &r.version))
            })
        {
            return Err("package_release_identity_mismatch".into());
        }
        if self.schema != 1
            || self.platform != r.platform
            || self.architecture != r.architecture
            || self.package != r.package
            || self.package_sha256 != hash
            || self.build_info["version"] != version
            || self.build_info["mode"] != "production"
            || self.native_binary_sha256.len() != 64
            || !self
                .native_binary_sha256
                .bytes()
                .all(|b| b.is_ascii_hexdigit())
        {
            return Err("package_identity_mismatch".into());
        }
        Ok(())
    }
}
