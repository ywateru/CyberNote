//! Bounded authenticated CyberBus bootstrap plus the existing Noise/Store cycle.
use super::{
    directory,
    enrollment::{Gate, VerifiedWorkspace},
    private::Binding,
    types::{Error, Result, SyncStage},
    worker,
};
use crate::sync::{
    adapter,
    identity::{IdentityStore, PairingInvite},
    network::{ReplicationPolicy, SyncService},
};
use notes_cyberbus::{Bus, MappingLease, Service};
use serde::{Deserialize, Serialize};
use std::{sync::Arc, time::Duration};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
    task::JoinSet,
};
use tokio_util::sync::CancellationToken;
async fn blocking_request<T, F, R>(
    stop: &CancellationToken,
    admission_stop: &CancellationToken,
    action: F,
    retire: R,
) -> Result<T>
where
    T: Send + 'static,
    F: FnOnce() -> Result<T> + Send + 'static,
    R: Fn() -> Result<()> + Send + Sync + 'static,
{
    if stop.is_cancelled() {
        return Err(Error::Cancelled);
    }
    let action_stop = stop.clone();
    let mut task = tokio::task::spawn_blocking(move || {
        if action_stop.is_cancelled() {
            return Err(Error::Cancelled);
        }
        action()
    });
    let retire = Arc::new(retire);
    let mut retirement_error = None;
    let result = tokio::select! {
        biased;
        _=stop.cancelled()=>{
            admission_stop.cancel();
            // Aborting a queued task prevents admission; a running task still
            // requires its policy fence, disconnect, and observed termination.
            task.abort();
            let cancel = retire.clone();
            match tokio::task::spawn_blocking(move || cancel()).await {
                Ok(Ok(())) => {},
                Ok(Err(error)) => { retirement_error.get_or_insert(error); },
                Err(_) => { retirement_error.get_or_insert(Error::Sync); },
            }
            if task.await.is_err() { retirement_error.get_or_insert(Error::Sync); }
            Err(Error::Cancelled)
        },
        result=&mut task=>result.unwrap_or(Err(Error::Sync)),
    };
    if result.is_err() {
        admission_stop.cancel();
    }
    loop {
        let retire = retire.clone();
        match tokio::task::spawn_blocking(move || retire()).await {
            Ok(Ok(())) => break,
            Ok(Err(error)) => {
                admission_stop.cancel();
                retirement_error.get_or_insert(error);
            }
            Err(_) => {
                admission_stop.cancel();
                retirement_error.get_or_insert(Error::Sync);
            }
        }
        // A retiring task retains Busy and the cancellation fence until the
        // network join observer confirms exit; no retry of the transfer itself.
        tokio::time::sleep(Duration::from_millis(25)).await;
    }
    if stop.is_cancelled() {
        Err(Error::Cancelled)
    } else if let Some(error) = retirement_error {
        Err(error)
    } else {
        result
    }
}

#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Request {
    nonce: String,
    protocol_device_id: String,
    noise_public_key: String,
}
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
struct Response {
    nonce: String,
    protocol_device_id: String,
    noise_public_key: String,
    invitation: String,
}
async fn write<T: Serialize>(stream: &mut (impl AsyncWriteExt + Unpin), value: &T) -> Result<()> {
    let bytes = serde_json::to_vec(value).map_err(|_| Error::InvalidProof)?;
    if bytes.len() > 16384 {
        return Err(Error::InvalidProof);
    }
    stream
        .write_u32(bytes.len() as u32)
        .await
        .map_err(|_| Error::Network)?;
    stream.write_all(&bytes).await.map_err(|_| Error::Network)?;
    Ok(())
}
async fn read<T: serde::de::DeserializeOwned>(
    stream: &mut (impl AsyncReadExt + Unpin),
) -> Result<T> {
    let n = stream.read_u32().await.map_err(|_| Error::Network)? as usize;
    if n == 0 || n > 16384 {
        return Err(Error::InvalidProof);
    }
    let mut bytes = vec![0; n];
    stream
        .read_exact(&mut bytes)
        .await
        .map_err(|_| Error::Network)?;
    serde_json::from_slice(&bytes).map_err(|_| Error::InvalidProof)
}
async fn request_io<T, F>(stop: &CancellationToken, future: F) -> Result<T>
where
    F: std::future::Future<Output = Result<T>>,
{
    tokio::select! {
        biased;
        _=stop.cancelled()=>Err(Error::Cancelled),
        result=tokio::time::timeout(Duration::from_secs(25),future)=>result.map_err(|_|Error::Deadline)?,
    }
}
struct Bootstrap {
    bus: Bus,
    binding: Binding,
    identity: Arc<IdentityStore>,
    gate: Arc<Gate>,
    generation: u64,
}
impl Bootstrap {
    async fn serve(&self, mut stream: TcpStream) -> Result<()> {
        let context =
            notes_cyberbus::read_bootstrap_context(&mut stream, Duration::from_secs(5)).await?;
        self.bus.claim_bootstrap_context(&context)?;
        let request: Request = read(&mut stream).await?;
        if !super::private::registry_id(&request.nonce)
            || request.protocol_device_id == self.binding.device_id
            || !worker::peer_bound(
                &self.bus,
                &self.binding,
                self.generation,
                &context.peer,
                &request.protocol_device_id,
                &request.noise_public_key,
            )
        {
            return Err(Error::InvalidProof);
        }
        self.gate.admit(
            context.peer,
            &request.protocol_device_id,
            &request.noise_public_key,
        )?;
        self.gate
            .authorize(&request.protocol_device_id, &request.noise_public_key)?;
        let invite = self.identity.invite_enrolled(
            &self.binding.workspace_id,
            "ws://127.0.0.1:1/",
            &request.protocol_device_id,
            &request.noise_public_key,
        )?;
        if invite.host_key != self.binding.noise_public_key || !self.gate.is_current() {
            return Err(Error::InvalidProof);
        }
        write(
            &mut stream,
            &Response {
                nonce: request.nonce,
                protocol_device_id: self.binding.device_id.clone(),
                noise_public_key: self.binding.noise_public_key.clone(),
                invitation: invite.token()?,
            },
        )
        .await
    }
}
pub(super) async fn run_content(
    runtime: Arc<adapter::Runtime>,
    binding: Binding,
    bus: Bus,
    gate: Arc<Gate>,
    stop: CancellationToken,
    control: Arc<worker::Control>,
    epoch: u64,
    requests: Arc<tokio::sync::Mutex<tokio::sync::mpsc::Receiver<worker::DeviceRequest>>>,
) -> Result<()> {
    let identity = runtime.account_identity_for(&binding.device_id)?;
    let verified = VerifiedWorkspace::from_binding(&binding)?;
    let activate = runtime.clone();
    let noise = identity.clone();
    let policy = gate.clone();
    let service = Arc::new(
        tokio::task::spawn_blocking(move || activate.activate_account(&verified, noise, policy))
            .await
            .map_err(|_| Error::Sync)??,
    );
    let result = run_service(
        &service, identity, &binding, &bus, &gate, &stop, &control, epoch, requests,
    )
    .await;
    // Seal the Store backend and both endpoint admissions before retiring tasks.
    gate.close();
    runtime.pause_account();
    let bootstrap = bus
        .unregister_endpoint(Service::Bootstrap)
        .await
        .map_err(Error::from);
    let sync = bus
        .unregister_endpoint(Service::Sync)
        .await
        .map_err(Error::from);
    let retired = tokio::task::spawn_blocking(move || {
        let mut service = Arc::try_unwrap(service).map_err(|_| Error::Sync)?;
        service.shutdown().map_err(Error::from)
    })
    .await
    .map_err(|_| Error::Sync)?;
    result.and(bootstrap).and(sync).and(retired)
}
async fn run_service(
    service: &Arc<SyncService>,
    identity: Arc<IdentityStore>,
    binding: &Binding,
    bus: &Bus,
    gate: &Arc<Gate>,
    stop: &CancellationToken,
    control: &worker::Control,
    epoch: u64,
    requests: Arc<tokio::sync::Mutex<tokio::sync::mpsc::Receiver<worker::DeviceRequest>>>,
) -> Result<()> {
    let sync = service.start_listener("127.0.0.1:0".parse().map_err(|_| Error::Configuration)?)?;
    let listener = TcpListener::bind("127.0.0.1:0").await?;
    bus.register_endpoint(Service::Bootstrap, listener.local_addr()?)
        .await?;
    bus.register_endpoint(Service::Sync, sync).await?;
    let bootstrap = Arc::new(Bootstrap {
        bus: bus.clone(),
        binding: binding.clone(),
        identity: identity.clone(),
        gate: gate.clone(),
        generation: bus.snapshot().generation,
    });
    let server_stop = stop.child_token();
    let handler_stop = server_stop.clone();
    let handler = bootstrap.clone();
    let server = tokio::spawn(async move {
        let mut tasks = JoinSet::new();
        loop {
            tokio::select! {
                biased;
                _=handler_stop.cancelled()=>break,
                Some(_)=tasks.join_next(),if !tasks.is_empty()=>{},
                accepted=listener.accept()=>{
                    let Ok((stream,_))=accepted else {break};
                    if tasks.len()>=4 {drop(stream);continue;}
                    let handler=handler.clone();tasks.spawn(async move {tokio::time::timeout(Duration::from_secs(20),handler.serve(stream)).await});
                }
            }
        }
        tasks.abort_all();
        while tasks.join_next().await.is_some() {}
    });
    control.mark_ready(epoch);
    let mut requests = requests.lock().await;
    let result = loop {
        let request = tokio::select! {_=stop.cancelled()=>break Ok(()),r=requests.recv()=>match r {Some(r)=>r,None=>break Ok(())}};
        if request.epoch != epoch || !control.current(epoch) || request.done.is_closed() {
            request.complete(Err(Error::Cancelled));
            continue;
        }
        let request_stop = stop.child_token();
        let outcome = worker::execute_request(
            &request.cancellation,
            &request_stop,
            Box::pin(transfer_target(
                service,
                &identity,
                binding,
                bus,
                gate,
                &request.target,
                request.direction,
                &request_stop,
                &request.cancellation,
            )),
        )
        .await;
        request.complete(outcome);
    };
    gate.close();
    server_stop.cancel();
    server.await.map_err(|_| Error::Sync)?;
    // Queued requests for this epoch must receive retirement, not be replayed.
    while let Ok(request) = requests.try_recv() {
        request.complete(Err(Error::Cancelled));
    }
    result
}
async fn transfer_target(
    service: &Arc<SyncService>,
    identity: &IdentityStore,
    binding: &Binding,
    bus: &Bus,
    gate: &Gate,
    target: &directory::Row,
    direction: super::types::TransferDirection,
    stop: &CancellationToken,
    cancellation: &worker::RequestCancellation,
) -> Result<()> {
    let mut mappings: Vec<MappingLease> = vec![];
    let generation = bus.snapshot().generation;
    let result=async {
        let (peer,device,key)=target.target("")?;
        if !worker::peer_bound(bus,binding,generation,&peer,device,key){return Err(Error::InvalidProof);}
        let id={
        let prepare=async {
            let bootstrap=bus.map(peer,Service::Bootstrap).await?;let address=bootstrap.local_addr();mappings.push(bootstrap);
            let sync=bus.map(peer,Service::Sync).await?;let sync_address=sync.local_addr();mappings.push(sync);
            let mut stream=request_io(stop,async {TcpStream::connect(address).await.map_err(|_|Error::Network)}).await?;
            let nonce=uuid::Uuid::new_v4().to_string();
            request_io(stop,write(&mut stream,&Request{nonce:nonce.clone(),protocol_device_id:binding.device_id.clone(),noise_public_key:binding.noise_public_key.clone()})).await?;
            let response:Response=request_io(stop,read(&mut stream)).await?;
            if response.nonce!=nonce || response.protocol_device_id!=device || response.noise_public_key!=key
                || !worker::peer_bound(bus,binding,generation,&peer,device,key) {return Err(Error::InvalidProof);}
            let mut invite=PairingInvite::decode(&response.invitation)?;
            if invite.workspace_id!=binding.workspace_id || invite.host_key!=key {return Err(Error::InvalidProof);}
            gate.admit(peer,device,key)?;gate.route(device,format!("ws://{sync_address}/"));gate.authorize(device,key)?;
            if !gate.is_current() || stop.is_cancelled(){return Err(Error::Cancelled);}
            cancellation.report_stage(crate::sync::network::ProgressStage::Pairing);
            if let Some(id)=identity.peer_for_device(device)? {
                let pinned=identity.credential(&id)?;
                if pinned.host_key!=key{return Err(Error::InvalidProof);}
                if pinned.phase==crate::sync::identity::PairingPhase::Prepared {
                    let active=service.clone();let selected=id.clone();let retire=service.clone();
                    blocking_request(stop,&cancellation.admission_stop,move ||active.recover_pairing(&selected).map_err(|e|Error::SyncAt(SyncStage::RecoverPairing,e)),move ||retire.disconnect(&id).map_err(|e|Error::SyncAt(SyncStage::Retirement,e))).await?;
                }
            } else {
                invite.endpoint=format!("ws://{sync_address}/");let token=invite.token()?;let id=invite.invitation_id;
                let active=service.clone();let retire=service.clone();
                blocking_request(stop,&cancellation.admission_stop,move ||active.pair(&token).map_err(|e|Error::SyncAt(SyncStage::Pair,e)),move ||retire.disconnect(&id).map_err(|e|Error::SyncAt(SyncStage::Retirement,e))).await?;
            }
            identity.peer_for_device(device)?.ok_or(Error::InvalidProof)
        };
        tokio::pin!(prepare);
        tokio::select! {_=stop.cancelled()=>{let _=prepare.await;return Err(Error::Cancelled);},r=&mut prepare=>r?}
        };
        // The mapping accepts exactly one socket. Pair/recovery has already
        // retired its connection; give the finite cycle a fresh bound lease.
        let sync=bus.map(peer,Service::Sync).await?;
        gate.route(device,format!("ws://{}/",sync.local_addr()));
        mappings.push(sync);
        let direction=match direction {super::types::TransferDirection::Push=>crate::sync::network::TransferDirection::Push,super::types::TransferDirection::Pull=>crate::sync::network::TransferDirection::Pull,super::types::TransferDirection::Both=>crate::sync::network::TransferDirection::Both};
        let active=service.clone();let selected=id.clone();let retire=service.clone();let progress=cancellation.progress_observer();
        blocking_request(stop,&cancellation.admission_stop,move ||active.transfer_once_with_progress(&selected,direction,progress).map_err(|e|Error::SyncAt(SyncStage::Transfer,e)),move ||retire.disconnect(&id).map_err(|e|Error::SyncAt(SyncStage::Retirement,e))).await
    }.await;
    // close joins each SDK tunnel task after Noise/backend retirement. Transport
    // cancellation cannot manufacture a successful durable sync receipt.
    let mut close_error = None;
    for mapping in mappings {
        if let Err(e) = mapping.close().await {
            if !matches!(e, notes_cyberbus::Error::Cancelled) {
                close_error.get_or_insert(Error::from(e));
            }
        }
    }
    result.and(close_error.map_or(Ok(()), Err))
}
#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::identity::SyncError;
    #[tokio::test]
    async fn classified_retirement_error_keeps_priority_and_cancellation_still_wins() {
        for cancelled in [false, true] {
            let stop = CancellationToken::new();
            let action_stop = stop.clone();
            let admission = CancellationToken::new();
            let retired = Arc::new(std::sync::atomic::AtomicUsize::new(0));
            let calls = retired.clone();
            let result: Result<()> = blocking_request(
                &stop,
                &admission,
                move || {
                    if cancelled {
                        action_stop.cancel();
                    }
                    Err(Error::SyncAt(SyncStage::Transfer, SyncError::Transport))
                },
                move || {
                    if calls.fetch_add(1, std::sync::atomic::Ordering::SeqCst) == 0 {
                        Err(Error::SyncAt(SyncStage::Retirement, SyncError::Timeout))
                    } else {
                        Ok(())
                    }
                },
            )
            .await;
            assert!(retired.load(std::sync::atomic::Ordering::SeqCst) >= 2);
            assert!(admission.is_cancelled());
            assert_eq!(
                result,
                Err(if cancelled {
                    Error::Cancelled
                } else {
                    Error::SyncAt(SyncStage::Retirement, SyncError::Timeout)
                })
            );
        }
    }
    #[tokio::test]
    async fn blocking_panic_still_fences_admission_and_confirms_retirement() {
        let stop = CancellationToken::new();
        let admission = CancellationToken::new();
        let calls = Arc::new(std::sync::atomic::AtomicUsize::new(0));
        let retired = calls.clone();
        let result: Result<()> = blocking_request(
            &stop,
            &admission,
            || panic!("synthetic blocking action failure"),
            move || {
                retired.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
                Ok(())
            },
        )
        .await;
        assert_eq!(result, Err(Error::Sync));
        assert!(admission.is_cancelled());
        assert_eq!(calls.load(std::sync::atomic::Ordering::SeqCst), 1);
    }
    #[tokio::test]
    async fn unconfirmed_retirement_is_not_success_and_keeps_admission_fenced() {
        tokio::time::timeout(Duration::from_secs(3), async {
            let stop = CancellationToken::new();
            let admission = CancellationToken::new();
            let release = Arc::new(std::sync::atomic::AtomicUsize::new(0));
            let entered = Arc::new(tokio::sync::Notify::new());
            let task_entered = entered.clone();
            let task_release = release.clone();
            let task_admission = admission.clone();
            let task = tokio::spawn(async move {
                blocking_request(
                    &stop,
                    &task_admission,
                    || Ok(()),
                    move || {
                        task_entered.notify_one();
                        if task_release.load(std::sync::atomic::Ordering::SeqCst) == 0 {
                            Err(Error::Sync)
                        } else {
                            Ok(())
                        }
                    },
                )
                .await
            });
            entered.notified().await;
            admission.cancelled().await;
            assert!(!task.is_finished());
            release.store(1, std::sync::atomic::Ordering::SeqCst);
            assert_eq!(
                task.await.unwrap(),
                Err(Error::Sync),
                "retirement error cannot become durable success"
            );
        })
        .await
        .unwrap();
    }
}
