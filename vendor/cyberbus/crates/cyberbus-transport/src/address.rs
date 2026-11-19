use crate::{Error, RouteCandidate};
use sha2::{Digest, Sha256};
use std::net::Ipv4Addr;

/// An IPv4 pool; only the network and broadcast of the *whole* pool are reserved.
#[derive(Clone, Copy, Debug)]
pub struct AddressPool {
    network: u32,
    prefix: u8,
}
impl Default for AddressPool {
    fn default() -> Self {
        Self::new(Ipv4Addr::new(10, 144, 0, 0), 20).unwrap()
    }
}
impl AddressPool {
    pub fn new(network: Ipv4Addr, prefix: u8) -> Result<Self, Error> {
        if !(8..=30).contains(&prefix) {
            return Err(Error::InvalidConfig(
                "address prefix must be /8 through /30",
            ));
        }
        let mask = u32::MAX << (32 - prefix);
        let n = u32::from(network);
        if n & mask != n || !network.is_private() {
            return Err(Error::InvalidConfig(
                "pool must be an aligned private IPv4 CIDR",
            ));
        }
        let end = Ipv4Addr::from(n | !mask);
        if !end.is_private() {
            return Err(Error::InvalidConfig("whole pool must be private"));
        }
        Ok(Self { network: n, prefix })
    }
    pub fn prefix(self) -> u8 {
        self.prefix
    }
    pub fn contains(self, ip: Ipv4Addr) -> bool {
        let n = u32::from(ip);
        n > self.network && n < self.network + (1 << (32 - self.prefix)) - 1
    }
    pub fn usable(self) -> u32 {
        (1 << (32 - self.prefix)) - 2
    }
    pub fn candidate(
        self,
        network_name: &str,
        installation_id: &[u8; 32],
        offset: u32,
    ) -> Ipv4Addr {
        let mut h = Sha256::new();
        h.update(b"cyberbus/address/v1");
        h.update((network_name.len() as u64).to_be_bytes());
        h.update(network_name.as_bytes());
        h.update(self.network.to_be_bytes());
        h.update([self.prefix]);
        h.update(installation_id);
        let digest = h.finalize();
        let base = u64::from_be_bytes(digest[..8].try_into().unwrap());
        Ipv4Addr::from(
            self.network
                + 1
                + ((base % u64::from(self.usable()) + u64::from(offset)) % u64::from(self.usable()))
                    as u32,
        )
    }
}
/// Return every conflicting claimant; never collapse a duplicate IP into one route.
pub fn conflicts(local: Ipv4Addr, local_peer_id: u32, routes: &[RouteCandidate]) -> Vec<u32> {
    let mut ids: Vec<_> = routes
        .iter()
        .filter(|r| r.ipv4 == local && r.peer_id != local_peer_id)
        .map(|r| r.peer_id)
        .collect();
    ids.sort_unstable();
    ids.dedup();
    ids
}
