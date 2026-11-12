// Measurement-only inclusion in the copied MediaCore module. Read the actual
// lease map; never expire/reconcile/revoke or alter authorization/lifetimes.
impl MediaCore {
    pub(crate) fn measurement_active_leases(&self) -> Result<usize> {
        Ok(self.leases.lock().map_err(|_| cancelled())?.len())
    }
}
