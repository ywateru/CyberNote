/// Build-provided full publication identity; unknown/old builds remain conservative.
pub(crate) fn current_version() -> &'static str {
    option_env!("CYBERNOTE_RELEASE_VERSION")
        .filter(|v| !v.is_empty())
        .unwrap_or(env!("CARGO_PKG_VERSION"))
}
pub(crate) fn validate_install_version(candidate: &str, live_core: &str) -> Result<(), String> {
    let installed = Version::parse(current_version())?;
    if Version::parse(live_core)?.core != installed.core || Version::parse(candidate)? <= installed
    {
        return Err("downgrade_or_running_version_mismatch".into());
    }
    Ok(())
}
use std::cmp::Ordering;

/// SemVer 2 precedence; build metadata never affects upgrade ordering.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Version {
    pub core: [u64; 3],
    pre: Vec<String>,
}
impl Version {
    pub fn parse(input: &str) -> Result<Self, String> {
        let input = input.strip_prefix('v').unwrap_or(input);
        let (left, build) = input
            .split_once('+')
            .map_or((input, None), |(a, b)| (a, Some(b)));
        if let Some(build) = build {
            identifiers(build, false)?;
        }
        let (core, pre) = left
            .split_once('-')
            .map_or((left, None), |(a, b)| (a, Some(b)));
        let parts: Vec<_> = core.split('.').collect();
        if parts.len() != 3 {
            return Err("invalid_version".into());
        }
        let mut numbers = [0; 3];
        for (i, part) in parts.iter().enumerate() {
            if part.is_empty()
                || !part.bytes().all(|b| b.is_ascii_digit())
                || (part.len() > 1 && part.starts_with('0'))
            {
                return Err("invalid_version".into());
            }
            numbers[i] = part.parse().map_err(|_| "invalid_version")?;
        }
        Ok(Self {
            core: numbers,
            pre: pre
                .map(|p| identifiers(p, true))
                .transpose()?
                .unwrap_or_default(),
        })
    }
    pub fn prerelease(&self) -> bool {
        !self.pre.is_empty()
    }
    pub fn package_version(&self) -> String {
        format!("{}.{}.{}", self.core[0], self.core[1], self.core[2])
    }
}
fn identifiers(s: &str, pre: bool) -> Result<Vec<String>, String> {
    s.split('.')
        .map(|s| {
            if s.is_empty()
                || !s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-')
                || (pre
                    && s.len() > 1
                    && s.starts_with('0')
                    && s.bytes().all(|b| b.is_ascii_digit()))
            {
                Err("invalid_version".into())
            } else {
                Ok(s.to_string())
            }
        })
        .collect()
}
impl Ord for Version {
    fn cmp(&self, other: &Self) -> Ordering {
        let core = self.core.cmp(&other.core);
        if core != Ordering::Equal {
            return core;
        }
        match (self.pre.is_empty(), other.pre.is_empty()) {
            (true, false) => return Ordering::Greater,
            (false, true) => return Ordering::Less,
            _ => (),
        }
        for (a, b) in self.pre.iter().zip(&other.pre) {
            let numeric = |s: &str| s.bytes().all(|b| b.is_ascii_digit());
            let order = match (numeric(a), numeric(b)) {
                (true, true) => a.len().cmp(&b.len()).then_with(|| a.cmp(b)),
                (true, false) => Ordering::Less,
                (false, true) => Ordering::Greater,
                _ => a.cmp(b),
            };
            if order != Ordering::Equal {
                return order;
            }
        }
        self.pre.len().cmp(&other.pre.len())
    }
}
impl PartialOrd for Version {
    fn partial_cmp(&self, other: &Self) -> Option<Ordering> {
        Some(self.cmp(other))
    }
}
