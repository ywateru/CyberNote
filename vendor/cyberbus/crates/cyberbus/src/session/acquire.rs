//! Closed diagnostic vocabulary; never format an error, address, identity or payload.
use std::{io::Write, time::Duration};
pub(crate) enum Stage {
    Connect,
    Noise,
    UpEnqueue,
    UpReady,
    PostReady,
    Accept,
}
pub(crate) enum Class {
    Cancelled,
    Closed,
    Deadline,
    AddressChanged,
    NoRoute,
    Conflict,
    Configuration,
    Io,
    Backend,
    Protocol,
    Authentication,
    Limit,
    Rejected,
    Missing,
    ProbeFull,
}
impl Stage {
    fn name(&self) -> &'static str {
        match self {
            Self::Connect => "connect",
            Self::Noise => "noise",
            Self::UpEnqueue => "up_enqueue",
            Self::UpReady => "up_ready",
            Self::PostReady => "post_ready",
            Self::Accept => "accept",
        }
    }
}
impl Class {
    fn name(&self) -> &'static str {
        match self {
            Self::Cancelled => "cancelled",
            Self::Closed => "closed",
            Self::Deadline => "deadline",
            Self::AddressChanged => "address_changed",
            Self::NoRoute => "no_route",
            Self::Conflict => "conflict",
            Self::Configuration => "configuration",
            Self::Io => "io",
            Self::Backend => "backend",
            Self::Protocol => "protocol",
            Self::Authentication => "authentication",
            Self::Limit => "limit",
            Self::Rejected => "rejected",
            Self::Missing => "missing",
            Self::ProbeFull => "probe_full",
        }
    }
    pub(crate) fn transport(e: &cyberbus_transport::Error) -> Self {
        use cyberbus_transport::Error as E;
        match e {
            E::Cancelled => Self::Cancelled,
            E::Closed => Self::Closed,
            E::Deadline => Self::Deadline,
            E::AddressChanged => Self::AddressChanged,
            E::NoRoute => Self::NoRoute,
            E::Conflict => Self::Conflict,
            E::InvalidConfig(_) => Self::Configuration,
            E::Io(_) => Self::Io,
            E::Backend(_) => Self::Backend,
        }
    }
    pub(crate) fn noise(e: &cyberbus_protocol::Error) -> Self {
        use cyberbus_protocol::Error as E;
        match e {
            E::Io(_) => Self::Io,
            E::Decode(_) | E::Invalid(_) => Self::Protocol,
            E::Limit(_) => Self::Limit,
            E::Noise(_) => Self::Authentication,
            E::Timeout => Self::Deadline,
            E::Closed => Self::Closed,
        }
    }
}
fn line(stage: Stage, class: Class, elapsed: Duration, count: u64) -> String {
    format!(
        "CYBERBUS_ACQUIRE stage={} class={} elapsed_ms={} count={count}",
        stage.name(),
        class.name(),
        elapsed.as_millis()
    )
}
pub(crate) fn report(stage: Stage, class: Class, elapsed: Duration, count: u64) {
    let _ = writeln!(
        std::io::stderr().lock(),
        "{}",
        line(stage, class, elapsed, count)
    );
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test(start_paused = true)]
    async fn real_noise_deadline_and_closed_up_are_distinct_acquisition_failure_stages() {
        use crate::session::{self, Admission, BusinessReady, Keys};
        use std::sync::Arc;
        use tokio::sync::{mpsc, oneshot};
        use zeroize::Zeroizing;
        let keys = Arc::new(Keys {
            private: Zeroizing::new([1; 32]),
            psk: Zeroizing::new([9; 32]),
            binding: [8; 32],
            boot: [1; 16],
        });
        let admission = Arc::new(Admission {
            open: true.into(),
            policy: Default::default(),
            local: vec![0; 32],
            output_budget: Default::default(),
        });
        let (io, _held_remote) = tokio::io::duplex(128 * 1024);
        let (incoming, mut inbox) = mpsc::channel(8);
        let (reply, ready) = oneshot::channel();
        let began = tokio::time::Instant::now();
        assert!(
            !session::handshake(
                Box::new(io),
                "10.144.0.2".parse().unwrap(),
                true,
                keys.clone(),
                admission.clone(),
                incoming,
                Default::default(),
                1,
                0,
                true,
                Some(BusinessReady {
                    deadline: tokio::time::Instant::now() + Duration::from_secs(2),
                    expected: vec![2; 32],
                    reply
                })
            )
            .await
        );
        assert_eq!(began.elapsed(), Duration::from_secs(2));
        assert!(ready.await.is_err());
        assert!(
            inbox.try_recv().is_err(),
            "timed-out Noise cannot publish Up"
        );

        let (io, remote) = tokio::io::duplex(128 * 1024);
        let peer = tokio::spawn(async move {
            cyberbus_protocol::noise::accept(
                remote,
                cyberbus_protocol::noise::NoiseConfig::new(
                    [42; 32], [9; 32], [8; 32], "1", [8; 16],
                ),
                |_| Ok(()),
            )
            .await
            .unwrap()
        });
        let (incoming, inbox) = mpsc::channel(8);
        drop(inbox);
        let (reply, ready) = oneshot::channel();
        assert!(
            !session::handshake(
                Box::new(io),
                "10.144.0.2".parse().unwrap(),
                true,
                keys,
                admission,
                incoming,
                Default::default(),
                1,
                0,
                true,
                Some(BusinessReady {
                    deadline: tokio::time::Instant::now() + Duration::from_secs(2),
                    expected: vec![2; 32],
                    reply
                })
            )
            .await
        );
        let _peer = peer.await.unwrap();
        assert!(ready.await.is_err());
    }

    #[test]
    fn typed_failure_diagnostics_never_format_remote_details() {
        let secret = "unsafe://fixture?credential=marker";
        let transport = cyberbus_transport::Error::Backend(secret.into());
        let protocol = cyberbus_protocol::Error::Invalid(secret.into());
        for (stage, class) in [
            (Stage::Connect, Class::transport(&transport)),
            (Stage::Noise, Class::noise(&protocol)),
        ] {
            let record = line(stage, class, Duration::from_millis(2000), 1);
            assert!(!record.contains("unsafe"));
            assert!(!record.contains("marker"));
            assert_eq!(record.split_whitespace().count(), 5);
            assert!(record.ends_with("elapsed_ms=2000 count=1"));
        }
        assert!(line(
            Stage::Connect,
            Class::transport(&cyberbus_transport::Error::Deadline),
            Duration::ZERO,
            1
        )
        .contains("class=deadline"));
    }
}
