//! Finite native-only diagnostic boundary. SDK auth events, profiles, endpoints,
//! identifiers and upstream error strings are deliberately excluded.
pub(crate) async fn snapshot(runtime: &super::Runtime) -> Result<serde_json::Value, &'static str> {
    if !diagnostics_enabled() {
        return Err("DIAGNOSTICS_DISABLED");
    }
    let d = runtime
        .cyberbus_diagnostic()
        .await
        .map_err(|_| "UNAVAILABLE")?;
    // Keep this projection flat. A single json! invocation over the complete
    // diagnostic exceeds rustc's default macro recursion limit in E2E builds.
    let mut out = serde_json::Map::new();
    out.insert("schemaVersion".into(), d.schema_version.into());
    out.insert("transport".into(), "cyberbus".into());
    out.insert("diagnosticsAvailable".into(), true.into());
    out.insert("transportRunning".into(), d.transport_running.into());
    out.insert("transportPhase".into(), d.transport_phase.into());
    out.insert("transportGeneration".into(), d.transport_generation.into());
    out.insert("localIpv4Present".into(), d.local_ipv4_present.into());
    out.insert("routeCount".into(), d.route_count.into());
    out.insert("remoteRouteCount".into(), d.remote_route_count.into());
    out.insert("indirectRouteCount".into(), d.indirect_route_count.into());
    out.insert("deviceCount".into(), d.device_count.into());
    out.insert("onlineDeviceCount".into(), d.online_device_count.into());
    out.insert(
        "devicesWithVirtualIpv4".into(),
        d.devices_with_virtual_ipv4.into(),
    );
    out.insert("directoryRevision".into(), d.directory_revision.into());
    out.insert("livePeerCount".into(), d.live_peer_count.into());
    out.insert("liveProbeCount".into(), d.live_probe_count.into());
    out.insert("activeRefreshCount".into(), d.active_refresh_count.into());
    out.insert(
        "activeProfileQueryCount".into(),
        d.active_profile_query_count.into(),
    );
    out.insert("metadataReceived".into(), d.metadata_received.into());
    out.insert("metadataValid".into(), d.metadata_valid.into());
    out.insert("noiseVerified".into(), d.noise_verified.into());
    out.insert("probeSuccess".into(), d.probe_success.into());
    out.insert("probeFailure".into(), d.probe_failure.into());
    out.insert("routeFetchSuccess".into(), d.route_fetch_success.into());
    out.insert("routeFetchFailure".into(), d.route_fetch_failure.into());
    out.insert("networkUnready".into(), d.network_unready.into());
    out.insert("sessionsEstablished".into(), d.sessions_established.into());
    out.insert("sessionsInbound".into(), d.sessions_inbound.into());
    out.insert("sessionsOutbound".into(), d.sessions_outbound.into());
    out.insert(
        "probeSessionsEstablished".into(),
        d.probe_sessions_established.into(),
    );
    out.insert(
        "businessSessionsEstablished".into(),
        d.business_sessions_established.into(),
    );
    out.insert("upPublished".into(), d.up_published.into());
    out.insert("upInstalled".into(), d.up_installed.into());
    out.insert("metadataQueued".into(), d.metadata_queued.into());
    out.insert("metadataQueueFailed".into(), d.metadata_queue_failed.into());
    out.insert("writerFramesSent".into(), d.writer_frames_sent.into());
    out.insert("writerMetadataSent".into(), d.writer_metadata_sent.into());
    out.insert("writerSendFailed".into(), d.writer_send_failed.into());
    out.insert("writerProbeExpired".into(), d.writer_probe_expired.into());
    out.insert("framesReceived".into(), d.frames_received.into());
    out.insert(
        "metadataFramesReceived".into(),
        d.metadata_frames_received.into(),
    );
    out.insert("readerErrors".into(), d.reader_errors.into());
    out.insert("readerClosed".into(), d.reader_closed.into());
    out.insert("readerIo".into(), d.reader_io.into());
    out.insert("readerProtocol".into(), d.reader_protocol.into());
    out.insert(
        "readerAuthentication".into(),
        d.reader_authentication.into(),
    );
    out.insert("readerLimit".into(), d.reader_limit.into());
    out.insert("readerTimeout".into(), d.reader_timeout.into());
    out.insert("readerAborted".into(), d.reader_aborted.into());
    out.insert("readerForcedAbort".into(), d.reader_forced_abort.into());
    out.insert("readerPrefixTimeout".into(), d.reader_prefix_timeout.into());
    out.insert("readerNoFrameExits".into(), d.reader_no_frame_exits.into());
    out.insert("readerCloseFrames".into(), d.reader_close_frames.into());
    out.insert(
        "readerAdmissionClosed".into(),
        d.reader_admission_closed.into(),
    );
    out.insert("readerChannelClosed".into(), d.reader_channel_closed.into());
    out.insert("writerClosed".into(), d.writer_closed.into());
    out.insert("writerIo".into(), d.writer_io.into());
    out.insert("writerProtocol".into(), d.writer_protocol.into());
    out.insert(
        "writerAuthentication".into(),
        d.writer_authentication.into(),
    );
    out.insert("writerLimit".into(), d.writer_limit.into());
    out.insert("writerTimeout".into(), d.writer_timeout.into());
    out.insert(
        "writerShutdownFailed".into(),
        d.writer_shutdown_failed.into(),
    );
    out.insert("writerExitCancel".into(), d.writer_exit_cancel.into());
    out.insert("writerExitStop".into(), d.writer_exit_stop.into());
    out.insert(
        "writerExitQueueClosed".into(),
        d.writer_exit_queue_closed.into(),
    );
    out.insert(
        "writerExitProbeExpired".into(),
        d.writer_exit_probe_expired.into(),
    );
    out.insert(
        "writerExitPrefixTimeout".into(),
        d.writer_exit_prefix_timeout.into(),
    );
    out.insert(
        "writerExitAdmissionClosed".into(),
        d.writer_exit_admission_closed.into(),
    );
    out.insert(
        "writerExitSendFailed".into(),
        d.writer_exit_send_failed.into(),
    );
    out.insert(
        "writerCloseAttempted".into(),
        d.writer_close_attempted.into(),
    );
    out.insert("writerCloseSent".into(), d.writer_close_sent.into());
    out.insert("writerCloseFailed".into(), d.writer_close_failed.into());
    out.insert("localPrefixReady".into(), d.local_prefix_ready.into());
    out.insert("localPrefixSent".into(), d.local_prefix_sent.into());
    Ok(out.into())
}

fn diagnostics_enabled() -> bool {
    if !cfg!(debug_assertions) {
        return false;
    }
    // Android debug QA has no portable way to receive a process environment
    // variable from the launcher. The command remains trusted-window-only and
    // release builds compile the switch to false. Desktop keeps the existing
    // explicit dual opt-in.
    cfg!(target_os = "android")
        || (super::super::sync::network::diagnostics_enabled()
            && std::env::var("CYBERNOTE_ACCOUNT_SDK_DIAGNOSTICS").as_deref() == Ok("1"))
}

#[cfg(test)]
mod tests {
    #[test]
    fn diagnostics_require_a_debug_build() {
        if !cfg!(debug_assertions) {
            assert!(!super::diagnostics_enabled());
        }
    }
}
