//! Delayed, sticky admission of shared anonymous relay endpoints.
use crate::{Error, RouteCandidate};
use std::time::Duration;
use tokio::time::Instant;

/// Absent by default. URLs must be distributed to all participants by the host.
#[derive(Clone, Debug)]
pub struct CloudflareFallback {
    pub peers: Vec<String>,
    /// Continuous absence of remote virtual routes before adding connectors.
    pub after: Duration,
}
impl CloudflareFallback {
    pub fn validate(&self) -> Result<(), Error> {
        if self.peers.is_empty()
            || self.peers.len() > 4
            || !(Duration::from_secs(1)..=Duration::from_secs(300)).contains(&self.after)
            || self.peers.iter().any(|p| anonymous_endpoint(p).is_none())
        {
            return Err(Error::InvalidConfig("invalid Cloudflare fallback policy"));
        }
        Ok(())
    }
}

pub(crate) fn anonymous_endpoint(value: &str) -> Option<url::Url> {
    let u: url::Url = value.parse().ok()?;
    let label = u.host_str()?.strip_suffix(".trycloudflare.com")?;
    (u.scheme() == "wss"
        && !label.is_empty()
        && label
            .bytes()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-')
        && u.port_or_known_default() == Some(443)
        && u.username().is_empty()
        && u.password().is_none()
        && !value.contains('@')
        && u.query().is_none()
        && u.fragment().is_none()
        && u.path() == "/")
        .then_some(u)
}

pub(crate) struct Activation {
    missing_since: Instant,
    pub active: bool,
}
impl Activation {
    pub fn new(now: Instant) -> Self {
        Self {
            missing_since: now,
            active: false,
        }
    }
    pub fn due(
        &mut self,
        now: Instant,
        local: u32,
        routes: &[RouteCandidate],
        after: Duration,
    ) -> bool {
        if self.active {
            return false;
        }
        if routes.iter().any(|r| r.peer_id != local) {
            self.missing_since = now;
            return false;
        }
        now.duration_since(self.missing_since) >= after
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn validates_anonymous_wss_only() {
        assert!(anonymous_endpoint("wss://some-test.trycloudflare.com:443/").is_some());
        for p in [
            "ws://some-test.trycloudflare.com/",
            "wss://trycloudflare.com/",
            "wss://a.trycloudflare.com.evil/",
            "wss://a.trycloudflare.com:444/",
            "wss://user@a.trycloudflare.com/",
            "wss://a.trycloudflare.com/?token=x",
            "wss://a.trycloudflare.com/#x",
            "wss://a.trycloudflare.com/path",
        ] {
            assert!(anonymous_endpoint(p).is_none(), "{p}");
        }
    }
    #[test]
    fn remote_route_resets_delay_and_activation_is_sticky() {
        let now = Instant::now();
        let after = Duration::from_secs(10);
        let mut state = Activation::new(now);
        assert!(!state.due(now + Duration::from_secs(9), 1, &[], after));
        let route = RouteCandidate {
            peer_id: 2,
            ipv4: "10.144.0.2".parse().unwrap(),
            next_hop_peer_id: 2,
            cost: 1,
        };
        assert!(!state.due(now + after, 1, &[route], after));
        assert!(!state.due(now + Duration::from_secs(19), 1, &[], after));
        assert!(state.due(now + Duration::from_secs(20), 1, &[], after));
        state.active = true;
        assert!(!state.due(now + Duration::from_secs(100), 1, &[], after));
    }
}
