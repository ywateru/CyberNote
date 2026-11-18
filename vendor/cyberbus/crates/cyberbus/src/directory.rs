//! Authentication evidence is separate from streams, route visibility and public snapshots.
use std::{
    collections::{BTreeMap, BTreeSet},
    time::Duration,
};
use tokio::time::Instant;
#[derive(Clone)]
pub(crate) struct Health {
    pub last: Instant,
    pub failures: u32,
    first_round: Option<u64>,
    multiple_rounds: bool,
    pub offline: Option<Instant>,
}
impl Health {
    fn new(now: Instant) -> Self {
        Self {
            last: now,
            failures: 0,
            first_round: None,
            multiple_rounds: false,
            offline: None,
        }
    }
    pub fn success(&mut self, now: Instant) {
        *self = Self::new(now);
    }
    pub fn fail(&mut self, round: u64) {
        self.failures = self.failures.saturating_add(1);
        if self.first_round.is_some_and(|r| r != round) {
            self.multiple_rounds = true;
        }
        self.first_round.get_or_insert(round);
    }
    pub fn should_offline(&self, now: Instant) -> bool {
        self.offline.is_none()
            && now.duration_since(self.last) >= Duration::from_secs(180)
            && self.failures >= 3
            && self.multiple_rounds
    }
}
#[derive(Default)]
pub(crate) struct Evidence {
    pub health: BTreeMap<Vec<u8>, Health>,
    pub candidates: BTreeMap<Vec<u8>, Instant>,
    pub quarantined: BTreeSet<Vec<u8>>,
}
impl Evidence {
    pub fn success(&mut self, id: &[u8], now: Instant) {
        self.health
            .entry(id.to_vec())
            .or_insert_with(|| Health::new(now))
            .success(now);
    }
    pub fn candidate(&mut self, id: &[u8], now: Instant) -> Result<(), ()> {
        self.candidates
            .retain(|_, t| now.duration_since(*t) < Duration::from_secs(30));
        if self.candidates.len() >= 512 && !self.candidates.contains_key(id) {
            return Err(());
        }
        self.candidates.insert(id.to_vec(), now);
        Ok(())
    }
    pub fn admitted(
        &self,
        local: &[u8],
        online: impl Iterator<Item = Vec<u8>>,
    ) -> BTreeSet<Vec<u8>> {
        let mut ids: BTreeSet<_> = self
            .candidates
            .keys()
            .cloned()
            .chain(online)
            .filter(|id| !self.quarantined.contains(id))
            .collect();
        ids.insert(local.to_vec());
        ids.into_iter().take(256).collect()
    }
}
#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn failures_require_age_three_attempts_and_two_rounds() {
        let now = Instant::now();
        let mut h = Health::new(now);
        h.fail(1);
        h.fail(1);
        h.fail(1);
        assert!(!h.should_offline(now + Duration::from_secs(181)));
        h.fail(2);
        assert!(!h.should_offline(now + Duration::from_secs(179)));
        assert!(h.should_offline(now + Duration::from_secs(180)));
        h.success(now + Duration::from_secs(181));
        assert!(!h.should_offline(now + Duration::from_secs(999)));
    }
    #[test]
    fn capacity_is_sorted_and_identity_only_controls_expire() {
        let now = Instant::now();
        let mut e = Evidence::default();
        for n in (0..512u16).rev() {
            e.candidate(&n.to_be_bytes(), now).unwrap();
        }
        assert!(e.candidate(&[9; 32], now).is_err());
        let a = e.admitted(&511u16.to_be_bytes(), std::iter::empty());
        assert_eq!(a.len(), 256);
        assert!(!a.contains(511u16.to_be_bytes().as_slice()));
        e.candidate(&[9; 32], now + Duration::from_secs(30))
            .unwrap();
        assert_eq!(e.candidates.len(), 1);
    }
}

pub(crate) fn changed_fields(
    old: Option<&crate::pb::DeviceSnapshot>,
    new: &crate::pb::DeviceSnapshot,
) -> Vec<String> {
    let Some(old) = old else {
        return vec!["presence".into()];
    };
    let mut paths = Vec::new();
    macro_rules! field {
        ($path:literal,$a:expr,$b:expr) => {
            if $a != $b {
                paths.push($path.to_owned());
            }
        };
    }
    field!(
        "profile.device_name",
        old.profile.as_ref().map(|p| &p.device_name),
        new.profile.as_ref().map(|p| &p.device_name)
    );
    field!(
        "profile.public_config",
        old.profile.as_ref().map(|p| &p.public_config),
        new.profile.as_ref().map(|p| &p.public_config)
    );
    field!(
        "profile.config_revision",
        old.profile.as_ref().map(|p| p.config_revision),
        new.profile.as_ref().map(|p| p.config_revision)
    );
    field!(
        "profile.config_semantic_version",
        old.profile.as_ref().map(|p| &p.config_semantic_version),
        new.profile.as_ref().map(|p| &p.config_semantic_version)
    );
    field!(
        "profile.capabilities",
        old.profile.as_ref().map(|p| &p.capabilities),
        new.profile.as_ref().map(|p| &p.capabilities)
    );
    field!("boot_id", &old.boot_id, &new.boot_id);
    field!("presence", old.presence, new.presence);
    field!(
        "last_authenticated_at",
        old.last_authenticated_at,
        new.last_authenticated_at
    );
    field!("virtual_ipv4", &old.virtual_ipv4, &new.virtual_ipv4);
    paths
}
