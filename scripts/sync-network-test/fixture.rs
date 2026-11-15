//! Deliberately opaque filesystem fixture for NETWORK tests, not a Store implementation.
use crate::{
    identity::{Result, SyncError},
    network::{BlobRef, InventoryPage, Receipt, SyncBackend},
};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use std::{
    fs::{self, File},
    io::{Read, Seek, SeekFrom, Write},
    path::{Path, PathBuf},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
};
use uuid::Uuid;
pub struct Fixture {
    pub root: PathBuf,
    device: String,
    workspace: Mutex<String>,
    pub fail_adopt: AtomicBool,
    lock: Mutex<()>,
}
fn io<T>(r: std::io::Result<T>) -> Result<T> {
    r.map_err(|_| SyncError::Backend)
}
pub fn hash(b: &[u8]) -> String {
    format!("{:x}", Sha256::digest(b))
}
pub fn atomic(path: &Path, b: &[u8]) -> Result<()> {
    let temp = path.with_extension(format!("{}.tmp", Uuid::new_v4()));
    let mut f = io(File::create(&temp))?;
    io(f.write_all(b))?;
    io(f.sync_all())?;
    io(fs::rename(&temp, path))?;
    io(io(File::open(path.parent().unwrap()))?.sync_all())?;
    Ok(())
}
impl Fixture {
    pub fn open(root: &Path, workspace: &str) -> Result<Self> {
        io(fs::create_dir_all(root.join("versions")))?;
        io(fs::create_dir_all(root.join("blobs")))?;
        let devicefile = root.join("device");
        let device = if devicefile.exists() {
            io(fs::read_to_string(&devicefile))?
        } else {
            let d = Uuid::new_v4().to_string();
            atomic(&devicefile, d.as_bytes())?;
            d
        };
        let workspacefile = root.join("workspace");
        let workspace = if workspacefile.exists() {
            io(fs::read_to_string(&workspacefile))?
        } else {
            atomic(&workspacefile, workspace.as_bytes())?;
            workspace.into()
        };
        Ok(Self {
            root: root.into(),
            device,
            workspace: Mutex::new(workspace),
            fail_adopt: AtomicBool::new(false),
            lock: Mutex::new(()),
        })
    }
    pub fn insert(&self, text: &str, blob: Option<&[u8]>) -> Result<String> {
        let mut refs = vec![];
        if let Some(b) = blob {
            let r = BlobRef {
                sha256: hash(b),
                size: b.len() as u64,
            };
            atomic(&self.root.join("blobs").join(&r.sha256), b)?;
            refs.push(r);
        }
        let mut v = json!({"workspaceId":self.workspace_id()?,"payload":text,"blobs":refs});
        let d = hash(&serde_json::to_vec(&v).unwrap());
        v["digest"] = json!(d);
        self.receive_head(v)?;
        Ok(d)
    }
    pub fn digests(&self) -> Result<Vec<String>> {
        let mut ids = vec![];
        for e in io(fs::read_dir(self.root.join("versions")))? {
            let e = io(e)?;
            let id = e.file_name().to_string_lossy().into_owned();
            if id.len() == 64 {
                ids.push(id);
            }
        }
        ids.sort();
        Ok(ids)
    }
}
impl SyncBackend for Fixture {
    fn workspace_id(&self) -> Result<String> {
        Ok(self.workspace.lock().unwrap().clone())
    }
    fn device_id(&self) -> Result<String> {
        Ok(self.device.clone())
    }
    fn prepare_pairing(&self, workspace: &str) -> Result<()> {
        Uuid::parse_str(workspace).map_err(|_| SyncError::WorkspaceMismatch)?;
        Ok(())
    }
    fn adopt_workspace(&self, workspace: &str) -> Result<()> {
        if self.fail_adopt.load(Ordering::SeqCst) {
            return Err(SyncError::Backend);
        }
        atomic(&self.root.join("workspace"), workspace.as_bytes())?;
        *self.workspace.lock().unwrap() = workspace.into();
        Ok(())
    }
    fn flush(&self) -> Result<()> {
        Ok(())
    }
    fn inventory(&self, after: Option<&str>, limit: usize) -> Result<InventoryPage> {
        let ids = self.digests()?;
        let remaining: Vec<_> = ids
            .into_iter()
            .filter(|d| after.is_none_or(|a| d.as_str() > a))
            .collect();
        let next = if remaining.len() > limit {
            remaining.get(limit - 1).cloned()
        } else {
            None
        };
        Ok(InventoryPage {
            digests: remaining.into_iter().take(limit).collect(),
            next,
        })
    }
    fn version(&self, id: &str) -> Result<Value> {
        serde_json::from_slice(&io(fs::read(self.root.join("versions").join(id)))?)
            .map_err(|_| SyncError::Backend)
    }
    fn required_blobs(&self, v: &Value) -> Result<Vec<BlobRef>> {
        serde_json::from_value(v.get("blobs").cloned().ok_or(SyncError::Protocol)?)
            .map_err(|_| SyncError::Protocol)
    }
    fn has_blob(&self, b: &BlobRef) -> Result<bool> {
        let p = self.root.join("blobs").join(&b.sha256);
        if !p.exists() {
            return Ok(false);
        }
        let data = io(fs::read(p))?;
        Ok(data.len() as u64 == b.size && hash(&data) == b.sha256)
    }
    fn read_blob_chunk(&self, b: &BlobRef, offset: u64, max: usize) -> Result<Vec<u8>> {
        let mut f = io(File::open(self.root.join("blobs").join(&b.sha256)))?;
        io(f.seek(SeekFrom::Start(offset)))?;
        let mut out = vec![0; max.min((b.size - offset) as usize)];
        io(f.read_exact(&mut out))?;
        Ok(out)
    }
    fn store_blob(&self, b: &BlobRef, source: &Path) -> Result<()> {
        let data = io(fs::read(source))?;
        if data.len() as u64 != b.size || hash(&data) != b.sha256 {
            return Err(SyncError::Protocol);
        }
        atomic(&self.root.join("blobs").join(&b.sha256), &data)
    }
    fn receive_head(&self, v: Value) -> Result<Receipt> {
        let _g = self.lock.lock().unwrap();
        if v["workspaceId"].as_str() != Some(&self.workspace_id()?) {
            return Err(SyncError::WorkspaceMismatch);
        }
        let d = v["digest"].as_str().ok_or(SyncError::Protocol)?.to_owned();
        let mut copy = v.clone();
        copy.as_object_mut()
            .ok_or(SyncError::Protocol)?
            .remove("digest");
        if hash(&serde_json::to_vec(&copy).unwrap()) != d {
            return Err(SyncError::Protocol);
        }
        for b in self.required_blobs(&v)? {
            if !self.has_blob(&b)? {
                return Err(SyncError::Protocol);
            }
        }
        atomic(
            &self.root.join("versions").join(&d),
            &serde_json::to_vec(&v).unwrap(),
        )?;
        Ok(Receipt {
            durable: true,
            applied: false,
        })
    }
}
