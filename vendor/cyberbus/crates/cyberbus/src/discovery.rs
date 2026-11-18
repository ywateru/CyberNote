//! Shared, fair transient authentication scheduler. Streams used by business do not
//! occupy probe permits. Unrouted/unscheduled work is deferred, never offline evidence.
use crate::{
    pb,
    session::{self, Admission, Incoming, Keys},
};
use cyberbus_transport::{AddressPhase, CancellationToken, Transport};
use sha2::{Digest, Sha256};
use std::{
    collections::{BTreeMap, BTreeSet},
    net::{Ipv4Addr, SocketAddrV4},
    sync::Arc,
    time::Duration,
};
use tokio::{sync::mpsc, time::Instant};
pub(crate) mod probe_gate;
use probe_gate::ProbeGate;

pub(crate) async fn complete_probe(
    noise_verified: bool,
    progress: Arc<session::Progress>,
    stop: CancellationToken,
    owner: mpsc::Sender<Incoming>,
) -> (bool, bool) {
    // A local Up enqueue can be cancelled after cryptographic establishment.
    let noise_verified =
        noise_verified || progress.noise.load(std::sync::atomic::Ordering::Acquire);
    if noise_verified {
        let revoked = progress.revocation.get().cloned().unwrap_or_default();
        tokio::select! {
            _=stop.cancelled()=>{}, _=revoked.cancelled()=>{},
            _=owner.closed()=>{}, _=progress.owner_done.cancelled()=>{}
        }
    }
    // A delayed/missing declaration is not another remote failure for offline
    // evidence. Only the owner can establish completed metadata discovery.
    (
        progress.metadata.load(std::sync::atomic::Ordering::Acquire),
        !noise_verified,
    )
}

#[derive(Clone, Copy)]
struct ProbeWork {
    ip: Ipv4Addr,
    round: u64,
    address_generation: u64,
}

// One work record is taken by promotion or join, never both. Task ownership
// remains in the JoinSet even after its probe result has been settled here.
fn settle_probe(
    work: ProbeWork,
    verified: bool,
    count_failure: bool,
    capacity_retry: bool,
    address_generation: u64,
    cancelled: bool,
    generation: u64,
    active: &mut BTreeSet<Ipv4Addr>,
    due: &mut BTreeMap<Ipv4Addr, Instant>,
    batches: &mut [Batch],
) -> Incoming {
    active.remove(&work.ip);
    let delay = if verified && !capacity_retry {
        session::probe_delay(work.ip)
    } else {
        Duration::from_secs(8)
    };
    due.insert(work.ip, Instant::now() + delay);
    for b in batches {
        if work.address_generation != address_generation || cancelled {
            b.unknown = true;
            continue;
        }
        if b.candidates.contains(&work.ip) && b.attempted.contains(&work.ip) {
            if verified || count_failure {
                b.done.insert(work.ip);
            }
            if verified {
                b.verified.insert(work.ip);
            }
        }
    }
    Incoming::ProbeFinished {
        generation,
        address_generation: work.address_generation,
        ip: work.ip,
        round: work.round,
        verified,
        count_failure,
    }
}
pub(crate) struct Refresh {
    pub id: Vec<u8>,
    pub deadline: Instant,
}
pub(crate) enum Control {
    Refresh(Refresh),
    Probe(Ipv4Addr),
    Remember(Ipv4Addr, Vec<u8>),
    Capacity(bool),
}
struct Batch {
    query: Refresh,
    candidates: BTreeSet<Ipv4Addr>,
    attempted: BTreeSet<Ipv4Addr>,
    verified: BTreeSet<Ipv4Addr>,
    done: BTreeSet<Ipv4Addr>,
    unknown: bool,
}
impl Batch {
    fn finish(self) -> pb::RefreshDevicesResult {
        pb::RefreshDevicesResult {
            query_id: self.query.id,
            attempted: self.attempted.len() as u32,
            verified: self.verified.len() as u32,
            deferred: self.candidates.len().saturating_sub(self.done.len()) as u32,
            revision: 0,
            partial: self.unknown
                || self.done.len() != self.candidates.len()
                || self.candidates.is_empty(),
            error: None,
        }
    }
}
#[derive(Default)]
struct Sweep {
    cursor: u32,
    last: Option<Instant>,
    until: Option<Instant>,
    ips: BTreeSet<Ipv4Addr>,
    attempted: BTreeSet<Ipv4Addr>,
}
impl Sweep {
    fn start(&mut self, now: Instant, local: Ipv4Addr) {
        if self
            .last
            .is_some_and(|t| now.duration_since(t) < Duration::from_secs(300))
        {
            return;
        }
        self.last = Some(now);
        self.until = Some(now + Duration::from_secs(20));
        self.ips.clear();
        self.attempted.clear();
        while self.ips.len() < 256 {
            self.cursor = self.cursor % 4094 + 1;
            let ip = Ipv4Addr::from(u32::from(Ipv4Addr::new(10, 144, 0, 0)) + self.cursor);
            if ip != local {
                self.ips.insert(ip);
            }
        }
    }
    fn expire(&mut self, now: Instant) {
        if self.until.is_some_and(|d| now >= d) {
            self.ips.clear();
            self.until = None;
        }
    }
}
struct Known {
    id: Vec<u8>,
    peer_id: Option<u32>,
    at: Instant,
}
// A common IP sort order makes concurrent 16-probe waves converge on the same
// targets, overwhelming their 32 inbound permits. Keep one stable permutation
// per local network run and advance through it across route polls. The binding
// key is group-shared; only the local installation ID/boot identify this node.
struct ProbePlanner {
    seed: [u8; 32],
    cursor: usize,
}
impl ProbePlanner {
    fn new(local: &[u8], boot: &[u8; 16], generation: u64) -> Self {
        let mut hash = Sha256::new();
        hash.update(b"cyberbus/discovery/order/v1");
        hash.update(local);
        hash.update(boot);
        hash.update(generation.to_be_bytes());
        Self {
            seed: hash.finalize().into(),
            cursor: 0,
        }
    }
    fn order(&self, ips: &mut [Ipv4Addr]) {
        ips.sort_by_cached_key(|ip| {
            let mut hash = Sha256::new();
            hash.update(self.seed);
            hash.update(ip.octets());
            // IP is a deterministic tie-breaker, not the primary priority.
            (<[u8; 32]>::from(hash.finalize()), *ip)
        });
    }
    fn extend(&self, candidates: &mut Vec<Ipv4Addr>, additions: &BTreeSet<Ipv4Addr>) {
        let mut extra: Vec<_> = additions
            .iter()
            .filter(|ip| !candidates.contains(ip))
            .copied()
            .collect();
        self.order(&mut extra);
        candidates.extend(extra.into_iter().take(512 - candidates.len()));
    }
    fn candidates(
        &self,
        routed_or_known: &BTreeSet<Ipv4Addr>,
        supplemental: &BTreeSet<Ipv4Addr>,
    ) -> Vec<Ipv4Addr> {
        let mut candidates: Vec<_> = routed_or_known.iter().copied().collect();
        self.order(&mut candidates);
        if candidates.len() > 512 {
            let len = candidates.len();
            candidates.rotate_left(self.cursor % len);
            candidates.truncate(512);
        }
        // Preserve routed/authenticated priority over the supplemental sweep.
        self.extend(&mut candidates, supplemental);
        candidates
    }
    fn next(&mut self, candidates: &[Ipv4Addr]) -> Ipv4Addr {
        let ip = candidates[self.cursor % candidates.len()];
        self.cursor = (self.cursor + 1) % candidates.len();
        ip
    }
}
pub(crate) async fn run(
    transport: Arc<Transport>,
    mut listener: cyberbus_transport::Listener,
    keys: Arc<Keys>,
    admission: Arc<Admission>,
    incoming: mpsc::Sender<Incoming>,
    stop: CancellationToken,
    generation: u64,
    mut commands: mpsc::Receiver<Control>,
) {
    let mut outbound = tokio::task::JoinSet::new();
    let mut inbound = tokio::task::JoinSet::new();
    let mut outbound_gate = ProbeGate::<(ProbeWork, Arc<session::Progress>)>::new(16);
    let mut inbound_gate = ProbeGate::new(32);
    let mut due = BTreeMap::<Ipv4Addr, Instant>::new();
    let mut active = BTreeSet::new();
    let mut batches = Vec::<Batch>::new();
    let mut known = BTreeMap::<Ipv4Addr, Known>::new();
    let mut route_ids = BTreeMap::new();
    let mut sweep = Sweep::default();
    let mut tick = tokio::time::interval(Duration::from_millis(100));
    let jitter = session::noise_jitter_millis(500);
    let mut poll = Instant::now() + Duration::from_millis(jitter);
    let mut round = 0;
    let mut planner = ProbePlanner::new(&admission.local, &keys.boot, generation);
    let mut candidates = Vec::new();
    let mut status = transport.subscribe_status();
    let mut address_generation = transport.status().generation;
    let mut epoch = stop.child_token();
    let mut capacity_retry = false;
    let mut accept_drops = 0u64;
    let mut accept_report = Instant::now();
    loop {
        for (work, progress) in outbound_gate.promoted() {
            let result = settle_probe(
                work,
                progress.metadata.load(std::sync::atomic::Ordering::Acquire),
                false,
                capacity_retry,
                address_generation,
                epoch.is_cancelled(),
                generation,
                &mut active,
                &mut due,
                &mut batches,
            );
            let _ = incoming.send(result).await;
        }
        tokio::select! {
            _=stop.cancelled()=>break,
            changed=status.changed()=>{
                if changed.is_err(){break;}let s=status.borrow_and_update().clone();
                if s.phase!=AddressPhase::Ready{epoch.cancel();for b in &mut batches{b.unknown=true;}}
                if s.phase==AddressPhase::Ready&&(s.generation!=address_generation||epoch.is_cancelled()){
                    epoch.cancel();epoch=stop.child_token();address_generation=s.generation;listener.close();
                    match transport.listen(11000).await{Ok(l)=>listener=l,Err(_)=>{epoch.cancel();}}
                    due.clear();poll=Instant::now();
                }
            },
            accepted=listener.accept(&epoch),if !epoch.is_cancelled()=>match accepted{
                Ok((io,addr)) if inbound_gate.available()=>{let std::net::IpAddr::V4(ip)=addr.ip()else{continue};
                    let business = Default::default();
                    let task = inbound.spawn(session::handshake_tracked(io,ip,false,keys.clone(),admission.clone(),incoming.clone(),epoch.clone(),generation,address_generation,Arc::clone(&business),None,Arc::default()));
                    inbound_gate.insert(&task,business,());
                },
                Ok(_)=>{
                    accept_drops=accept_drops.saturating_add(1);
                    if accept_report.elapsed()>=Duration::from_secs(1) {
                        session::acquire::report(session::acquire::Stage::Accept,session::acquire::Class::ProbeFull,accept_report.elapsed(),accept_drops);
                        accept_report=Instant::now();accept_drops=0;
                    }
                },Err(_)=>{epoch.cancel();for b in &mut batches{b.unknown=true;}}
            },
            Some(command)=commands.recv()=>match command{
                Control::Capacity(value)=>{capacity_retry=value;if value{due.clear();}},
                Control::Remember(ip,id)=>{if known.len()<512||known.contains_key(&ip){known.insert(ip,Known{id,peer_id:route_ids.get(&ip).copied(),at:Instant::now()});}},
                Control::Probe(ip)=>{if !candidates.contains(&ip)&&candidates.len()<512{candidates.push(ip);}due.insert(ip,Instant::now());},
                Control::Refresh(query)=>{
                    sweep.start(Instant::now(),transport.status().ipv4);
                    planner.extend(&mut candidates,&sweep.ips);
                    let set:BTreeSet<_>=candidates.iter().copied().take(512).collect();
                    let attempted=set.intersection(&active).copied().collect();
                    batches.push(Batch{query,candidates:set,attempted,verified:BTreeSet::new(),done:BTreeSet::new(),unknown:epoch.is_cancelled()});
                    for ip in &candidates{due.insert(*ip,Instant::now());}poll=Instant::now();
                }
            },
            Some(result)=outbound.join_next_with_id()=>{
                let (id,verified,count_failure)=match result { Ok((id,(v,c)))=>(id,v,c),Err(e)=>(e.id(),false,false) };
                if let Some(((work,_progress),promoted))=outbound_gate.finished(id) {
                    let result=settle_probe(work,verified,count_failure&&!promoted,capacity_retry,address_generation,epoch.is_cancelled(),generation,&mut active,&mut due,&mut batches);
                    let _=incoming.send(result).await;
                }
            },
            Some(result)=inbound.join_next_with_id()=>{let id=match result{Ok((id,_))=>id,Err(e)=>e.id()};inbound_gate.finished(id);},
            _=tick.tick()=>{
                let now=Instant::now();sweep.expire(now);
                if now>=poll&&transport.status().phase==AddressPhase::Ready{
                    round+=1;poll=now+Duration::from_secs(2);
                    // A transient listener failure may not generate another status edge.
                    if epoch.is_cancelled(){listener.close();if let Ok(l)=transport.listen(11000).await{listener=l;epoch=stop.child_token();address_generation=transport.status().generation;}}
                    match transport.routes().await{
                        Ok(routes)=>{
                            route_ids=routes.iter().map(|r|(r.ipv4,r.peer_id)).collect();
                            known.retain(|ip,k|now.duration_since(k.at)<Duration::from_secs(600)&&!route_ids.get(ip).zip(k.peer_id).is_some_and(|(new,old)|*new!=old));
                            let view:BTreeSet<_>=route_ids.keys().copied().chain(known.keys().copied()).filter(|ip|*ip!=transport.status().ipv4).collect();
                            if view.is_empty(){sweep.start(now,transport.status().ipv4);}
                            candidates=planner.candidates(&view,&sweep.ips);
                            due.retain(|ip,_|candidates.contains(ip)||active.contains(ip));
                            for b in &mut batches{if b.candidates.is_empty(){b.candidates=candidates.iter().copied().collect();}}
                        },Err(_)=>for b in &mut batches{b.unknown=true;}
                    }
                }
                if !epoch.is_cancelled()&&!candidates.is_empty(){
                    let len=candidates.len();for _ in 0..len{
                        if !outbound_gate.available(){break;}
                        let ip=planner.next(&candidates);
                        if active.contains(&ip)||due.get(&ip).is_some_and(|d|*d>now){continue;}
                        if known.get(&ip).is_some_and(|k|admission.policy.lock().is_ok_and(|p|p.blocked.contains(&k.id))){continue;}
                        let supplemental=!known.contains_key(&ip)&&!route_ids.contains_key(&ip);
                        if supplemental&&(!sweep.ips.contains(&ip)||!sweep.attempted.insert(ip)){continue;}
                        active.insert(ip);for b in &mut batches{if b.candidates.contains(&ip){b.attempted.insert(ip);}}
                        let(t,k,a,tx,c)=(transport.clone(),keys.clone(),admission.clone(),incoming.clone(),epoch.clone());let r=round;let address_epoch=address_generation;
                        let business = session::BusinessFlag::default();
                        let flag = business.clone();
                        let progress = Arc::<session::Progress>::default();
                        let completion = progress.clone();
                        let task = outbound.spawn(async move{
                            let(verified,count_failure)=match t.connect(SocketAddrV4::new(ip,11000),Instant::now()+Duration::from_secs(3),&c).await{
                                Ok(io)=>{
                                    let owner=tx.clone();
                                    let verified=session::handshake_tracked(io,ip,true,k,a,tx,c.clone(),generation,address_epoch,flag,None,completion.clone()).await;
                                    complete_probe(verified,completion,c,owner).await
                                },
                                Err(e)=>(false,!matches!(e,cyberbus_transport::Error::NoRoute|cyberbus_transport::Error::AddressChanged|cyberbus_transport::Error::Closed|cyberbus_transport::Error::Cancelled)),
                            };(verified,count_failure)
                        });
                        outbound_gate.insert(&task,business,(ProbeWork{ip,round:r,address_generation:address_epoch},progress));
                    }
                }
                let mut index=0;while index<batches.len(){if now>=batches[index].query.deadline||(!batches[index].candidates.is_empty()&&batches[index].done.len()==batches[index].candidates.len()){
                    let mut b=batches.remove(index);b.unknown|=epoch.is_cancelled();let _=incoming.send(Incoming::RefreshFinished{generation,result:b.finish()}).await;
                }else{index+=1;}}
            }
        }
    }
    epoch.cancel();
    if accept_drops > 0 {
        session::acquire::report(
            session::acquire::Stage::Accept,
            session::acquire::Class::ProbeFull,
            accept_report.elapsed(),
            accept_drops,
        );
    }
    listener.close();
    outbound.abort_all();
    inbound.abort_all();
    while outbound.join_next().await.is_some() {}
    while inbound.join_next().await.is_some() {}
}
#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test(start_paused = true)]
    async fn incomplete_metadata_is_deferred_without_offline_failure_or_normal_backoff() {
        let ip = Ipv4Addr::new(10, 144, 0, 2);
        let work = ProbeWork {
            ip,
            round: 4,
            address_generation: 2,
        };
        let progress = Arc::<session::Progress>::default();
        let (owner, _inbox) = mpsc::channel(1);
        progress.owner_done.cancel();
        let (verified, count_failure) = complete_probe(
            true,
            progress.clone(),
            CancellationToken::new(),
            owner.clone(),
        )
        .await;
        assert_eq!((verified, count_failure), (false, false));
        let mut active = BTreeSet::from([ip]);
        let mut due = BTreeMap::new();
        let mut batches = vec![Batch {
            query: Refresh {
                id: vec![1; 16],
                deadline: Instant::now() + Duration::from_secs(30),
            },
            candidates: BTreeSet::from([ip]),
            attempted: BTreeSet::from([ip]),
            verified: BTreeSet::new(),
            done: BTreeSet::new(),
            unknown: false,
        }];
        let began = Instant::now();
        let event = settle_probe(
            work,
            verified,
            count_failure,
            false,
            2,
            false,
            1,
            &mut active,
            &mut due,
            &mut batches,
        );
        assert!(matches!(
            event,
            Incoming::ProbeFinished {
                verified: false,
                count_failure: false,
                ..
            }
        ));
        assert_eq!(due[&ip] - began, Duration::from_secs(8));
        let partial = batches.remove(0).finish();
        assert_eq!(
            (
                partial.attempted,
                partial.verified,
                partial.deferred,
                partial.partial
            ),
            (1, 0, 1, true)
        );

        // The same real completion path can produce verified only after the
        // owner's strict Metadata acceptance flag, with the unchanged delay.
        progress
            .metadata
            .store(true, std::sync::atomic::Ordering::Release);
        let completed = complete_probe(true, progress, CancellationToken::new(), owner).await;
        assert_eq!(completed, (true, false));
        settle_probe(
            work,
            completed.0,
            completed.1,
            false,
            2,
            false,
            1,
            &mut active,
            &mut due,
            &mut [],
        );
        assert_eq!(due[&ip] - began, session::probe_delay(ip));
    }

    #[tokio::test]
    async fn outbound_promotion_settles_refresh_once_and_late_exit_preserves_new_attempt() {
        use std::sync::atomic::Ordering;
        let ip = Ipv4Addr::new(10, 144, 0, 2);
        let work = ProbeWork {
            ip,
            round: 4,
            address_generation: 2,
        };
        let mut owners = tokio::task::JoinSet::new();
        let mut gate = ProbeGate::new(16);
        let flag = session::BusinessFlag::default();
        let owner = owners.spawn(std::future::pending::<()>());
        gate.insert(&owner, flag.clone(), work);
        let mut active = BTreeSet::from([ip]);
        let mut due = BTreeMap::new();
        let mut batches = vec![Batch {
            query: Refresh {
                id: vec![1; 16],
                deadline: Instant::now() + Duration::from_secs(10),
            },
            candidates: BTreeSet::from([ip]),
            attempted: BTreeSet::from([ip]),
            verified: BTreeSet::new(),
            done: BTreeSet::new(),
            unknown: false,
        }];
        flag.store(true, Ordering::Release);
        let promoted = gate.promoted();
        assert_eq!(promoted.len(), 1);
        let event = settle_probe(
            promoted[0],
            true,
            false,
            false,
            2,
            false,
            1,
            &mut active,
            &mut due,
            &mut batches,
        );
        assert!(matches!(
            event,
            Incoming::ProbeFinished {
                verified: true,
                count_failure: false,
                round: 4,
                ..
            }
        ));
        assert!(active.is_empty());
        assert!(due[&ip] > Instant::now() + Duration::from_secs(59));
        let result = batches.remove(0).finish();
        assert_eq!(
            (
                result.attempted,
                result.verified,
                result.deferred,
                result.partial
            ),
            (1, 1, 0, false)
        );
        assert!(gate.promoted().is_empty());
        // A forced new probe may reuse the IP while the promoted business task
        // is still alive. Its late exit must not remove/overwrite the new work.
        active.insert(ip);
        let new_due = Instant::now();
        due.insert(ip, new_due);
        owner.abort();
        let ended = owners.join_next_with_id().await.unwrap().unwrap_err();
        assert!(gate.finished(ended.id()).is_none());
        assert!(active.contains(&ip));
        assert_eq!(due[&ip], new_due);

        let mut late = vec![Batch {
            query: Refresh {
                id: vec![2; 16],
                deadline: Instant::now(),
            },
            candidates: BTreeSet::from([ip]),
            attempted: BTreeSet::from([ip]),
            verified: BTreeSet::new(),
            done: BTreeSet::new(),
            unknown: false,
        }];
        settle_probe(
            work,
            true,
            false,
            false,
            3,
            false,
            1,
            &mut active,
            &mut due,
            &mut late,
        );
        assert!(late[0].unknown);
        assert!(
            late[0].verified.is_empty(),
            "old address generation cannot validate a new refresh"
        );
    }

    fn fixture_planner(node: u64) -> ProbePlanner {
        // Deliberately identical boot/generation for all nodes: independent
        // installation IDs alone must disperse nodes sharing network material.
        let local = Sha256::digest(node.to_be_bytes());
        ProbePlanner::new(&local, &[7; 16], 1)
    }

    #[derive(Default)]
    struct OverlappingWaves {
        first_wave_peak: usize,
        peak: usize,
        attempted: usize,
        admitted: usize,
        min_admitted: usize,
    }

    fn overlapping_waves(distributed: bool) -> OverlappingWaves {
        // Scheduler/capacity model, not a transport or real N128 test. Every
        // source overlaps its next <=16 probes with other sources, and each
        // target admits <=32 in that wave. A full tour is eight waves; no extra
        // permits, retries, shorter deadlines or longer observation budget.
        let ips: BTreeSet<_> = (1..=128)
            .map(|i| Ipv4Addr::from(u32::from(Ipv4Addr::new(10, 144, 0, 0)) + i))
            .collect();
        let views: Vec<BTreeSet<_>> = ips
            .iter()
            .map(|local| ips.iter().filter(|ip| *ip != local).copied().collect())
            .collect();
        let mut planners: Vec<_> = (0..128).map(fixture_planner).collect();
        let mut attempted = vec![BTreeSet::new(); 128];
        let mut admitted = vec![BTreeSet::new(); 128];
        let mut stats = OverlappingWaves::default();
        for start in (0..127).step_by(16) {
            let mut inbound = BTreeMap::<Ipv4Addr, Vec<usize>>::new();
            for (node, planner) in planners.iter_mut().enumerate() {
                // Route polls rebuild the list but must not reset the cursor.
                let candidates = if distributed {
                    planner.candidates(&views[node], &BTreeSet::new())
                } else {
                    // Exact old homogeneous planner: IP sort, initial cursor 0.
                    views[node].iter().copied().collect()
                };
                for _ in 0..16.min(127 - start) {
                    let ip = planner.next(&candidates);
                    assert!(attempted[node].insert(ip), "tour repeated a target");
                    inbound.entry(ip).or_default().push(node);
                }
            }
            let peak = inbound.values().map(Vec::len).max().unwrap();
            if start == 0 {
                stats.first_wave_peak = peak;
            }
            stats.peak = stats.peak.max(peak);
            for (ip, sources) in inbound {
                for node in sources.into_iter().take(32) {
                    admitted[node].insert(ip);
                }
            }
        }
        stats.attempted = attempted.iter().map(BTreeSet::len).sum();
        stats.admitted = admitted.iter().map(BTreeSet::len).sum();
        stats.min_admitted = admitted.iter().map(BTreeSet::len).min().unwrap();
        stats
    }

    #[test]
    fn independent_planner_disperses_old_hotspots_and_progresses_with_same_limits() {
        let old = overlapping_waves(false);
        let new = overlapping_waves(true);
        assert_eq!(old.first_wave_peak, 127);
        assert!(old.peak > 32);
        assert_eq!(old.attempted, 128 * 127);
        assert_eq!(old.admitted, 4286);
        assert_eq!(new.first_wave_peak, 29);
        assert!(new.peak <= 32);
        assert_eq!(new.attempted, old.attempted);
        assert_eq!(new.admitted, 128 * 127);
        assert_eq!(new.min_admitted, 127);
        eprintln!(
            "overlapping-wave fixture only: old/new peak={}/{}, admitted={}/{} of {}",
            old.peak, new.peak, old.admitted, new.admitted, new.attempted
        );
    }

    #[test]
    fn planner_is_stable_per_run_independent_per_installation_and_fair_on_rebuild() {
        let view: BTreeSet<_> = (1..=255).map(|i| Ipv4Addr::new(10, 144, 0, i)).collect();
        let empty = BTreeSet::new();
        let mut planner = fixture_planner(0);
        let expected = planner.candidates(&view, &empty);
        assert_eq!(expected, fixture_planner(0).candidates(&view, &empty));
        assert_ne!(expected, fixture_planner(1).candidates(&view, &empty));
        let local = Sha256::digest(0u64.to_be_bytes());
        assert_ne!(
            expected,
            ProbePlanner::new(&local, &[8; 16], 1).candidates(&view, &empty)
        );
        assert_ne!(
            expected,
            ProbePlanner::new(&local, &[7; 16], 2).candidates(&view, &empty)
        );
        // Rebuilding on every selection is more frequent than route polls and
        // still visits every stable candidate exactly once per complete tour.
        for _ in 0..3 {
            let mut visited = BTreeSet::new();
            for _ in 0..view.len() {
                let rebuilt = planner.candidates(&view, &empty);
                assert!(visited.insert(planner.next(&rebuilt)));
            }
            assert_eq!(visited, view);
        }
    }

    #[test]
    fn planner_keeps_primary_priority_dedup_and_candidate_bounds() {
        let planner = fixture_planner(0);
        let all: BTreeSet<_> = (1..=1024)
            .map(|i| Ipv4Addr::from(u32::from(Ipv4Addr::new(10, 144, 0, 0)) + i))
            .collect();
        let primary: BTreeSet<_> = all.iter().take(127).copied().collect();
        let candidates = planner.candidates(&primary, &all);
        assert_eq!(candidates.len(), 512);
        assert_eq!(
            candidates.iter().copied().collect::<BTreeSet<_>>().len(),
            512
        );
        assert_eq!(
            candidates[..127].iter().copied().collect::<BTreeSet<_>>(),
            primary
        );
        assert_eq!(planner.candidates(&all, &primary).len(), 512);
        let mut extended = planner.candidates(&primary, &BTreeSet::new());
        planner.extend(&mut extended, &all);
        planner.extend(&mut extended, &all);
        assert_eq!(extended, candidates);
        assert!(planner
            .candidates(&BTreeSet::new(), &BTreeSet::new())
            .is_empty());
    }

    #[test]
    fn supplemental_sweep_has_count_time_rate_and_fair_cursor_bounds() {
        let now = Instant::now();
        let mut s = Sweep::default();
        s.start(now, Ipv4Addr::new(10, 144, 0, 1));
        let first = s.ips.clone();
        assert_eq!(first.len(), 256);
        s.start(now + Duration::from_secs(1), Ipv4Addr::new(10, 144, 0, 1));
        assert_eq!(s.ips, first);
        s.expire(now + Duration::from_secs(20));
        assert!(s.ips.is_empty());
        s.start(now + Duration::from_secs(300), Ipv4Addr::new(10, 144, 0, 1));
        assert!(s.ips.is_disjoint(&first));
        assert_eq!(s.ips.len(), 256);
    }
    #[test]
    fn refresh_counters_are_unique_bounded_and_unrouted_is_partial() {
        let ip = Ipv4Addr::new(10, 144, 0, 1);
        let b = Batch {
            query: Refresh {
                id: vec![1; 16],
                deadline: Instant::now(),
            },
            candidates: BTreeSet::from([ip]),
            attempted: BTreeSet::from([ip]),
            verified: BTreeSet::new(),
            done: BTreeSet::new(),
            unknown: false,
        };
        let r = b.finish();
        assert_eq!(r.attempted, 1);
        assert_eq!(r.verified, 0);
        assert_eq!(r.deferred, 1);
        assert!(r.partial);
    }
}
