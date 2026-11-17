//! Bounded MCP stdio client. No shell, inherited stdin, stderr capture or retries.
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::{path::Path, process::Stdio, time::Duration};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    process::{Child, ChildStdin, ChildStdout, Command},
};

pub const MAX_FRAME: usize = 2 * 1024 * 1024;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Tool {
    pub name: String,
    pub description: Option<String>,
    pub input_schema: Value,
    pub output_schema: Option<Value>,
}
#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
pub enum Failure {
    Input,
    Unavailable,
    Protocol,
    Timeout,
    Cancelled,
    Authority,
    Busy,
}
pub type Result<T> = std::result::Result<T, Failure>;

pub struct Process {
    child: Child,
    input: ChildStdin,
    output: BufReader<ChildStdout>,
    next_id: u64,
    pid: u32,
}
impl Process {
    pub fn spawn(binary: &Path, args: &[String]) -> Result<Self> {
        if !binary.is_absolute() || binary.as_os_str().len() > 4096 {
            return Err(Failure::Input);
        }
        let mut command = Command::new(binary);
        command
            .args(args)
            .env_clear()
            .env("LANG", "en_US.UTF-8")
            .current_dir("/")
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::null())
            .kill_on_drop(true);
        // A separate process group also bounds descendants of the selected executable.
        command.process_group(0);
        let mut child = command.spawn().map_err(|_| Failure::Unavailable)?;
        let pid = child.id().ok_or(Failure::Unavailable)?;
        let input = child.stdin.take().ok_or(Failure::Unavailable)?;
        let output = BufReader::new(child.stdout.take().ok_or(Failure::Unavailable)?);
        Ok(Self {
            child,
            input,
            output,
            next_id: 0,
            pid,
        })
    }
    async fn send(&mut self, value: Value) -> Result<()> {
        let mut bytes = serde_json::to_vec(&value).map_err(|_| Failure::Input)?;
        if bytes.len() > MAX_FRAME {
            return Err(Failure::Input);
        }
        bytes.push(b'\n');
        self.input
            .write_all(&bytes)
            .await
            .map_err(|_| Failure::Unavailable)?;
        self.input.flush().await.map_err(|_| Failure::Unavailable)
    }
    async fn frame(&mut self) -> Result<Value> {
        let mut line = Vec::new();
        loop {
            let buffer = self
                .output
                .fill_buf()
                .await
                .map_err(|_| Failure::Unavailable)?;
            if buffer.is_empty() {
                return Err(Failure::Unavailable);
            }
            let count = buffer
                .iter()
                .position(|b| *b == b'\n')
                .map_or(buffer.len(), |n| n + 1);
            if line.len() + count > MAX_FRAME + 1 {
                return Err(Failure::Protocol);
            }
            let done = buffer[count - 1] == b'\n';
            line.extend_from_slice(&buffer[..count]);
            self.output.consume(count);
            if done {
                return serde_json::from_slice(&line).map_err(|_| Failure::Protocol);
            }
        }
    }
    pub async fn request(
        &mut self,
        method: &str,
        params: Value,
        deadline: Duration,
    ) -> Result<Value> {
        tokio::time::timeout(deadline, async {
            self.next_id += 1;
            let id = self.next_id;
            self.send(json!({"jsonrpc":"2.0", "id":id, "method":method, "params":params}))
                .await?;
            // Bounded notifications; no sampling/elicitation or server requests accepted.
            for _ in 0..32 {
                let value = self.frame().await?;
                if value.get("jsonrpc").and_then(Value::as_str) != Some("2.0") {
                    return Err(Failure::Protocol);
                }
                if value.get("id").is_none()
                    && value.get("method").and_then(Value::as_str).is_some()
                {
                    continue;
                }
                if value.get("id").and_then(Value::as_u64) != Some(id)
                    || value.get("method").is_some()
                {
                    return Err(Failure::Protocol);
                }
                if value.get("error").is_some() {
                    return Err(Failure::Protocol);
                }
                return value.get("result").cloned().ok_or(Failure::Protocol);
            }
            Err(Failure::Protocol)
        })
        .await
        .map_err(|_| Failure::Timeout)?
    }
    pub async fn initialize(&mut self) -> Result<Vec<Tool>> {
        let result = self.request("initialize", json!({"protocolVersion":"2025-11-25", "capabilities":{}, "clientInfo":{"name":"cybernote-mcp-tester", "version":"1"}}), Duration::from_secs(5)).await?;
        if result["protocolVersion"] != "2025-11-25" || !result["capabilities"]["tools"].is_object()
        {
            return Err(Failure::Protocol);
        }
        self.send(json!({"jsonrpc":"2.0", "method":"notifications/initialized"}))
            .await?;
        let result = self
            .request("tools/list", json!({}), Duration::from_secs(5))
            .await?;
        if result.get("nextCursor").is_some_and(|v| !v.is_null()) {
            return Err(Failure::Protocol);
        }
        let tools: Vec<Tool> =
            serde_json::from_value(result["tools"].clone()).map_err(|_| Failure::Protocol)?;
        let expected = [
            "notes_get_capabilities",
            "notes_list_folders",
            "notes_list",
            "notes_search",
            "notes_read",
            "notes_create",
            "notes_append",
            "notes_update",
            "notes_get_operation",
        ];
        if tools.len() != expected.len()
            || expected
                .iter()
                .any(|name| tools.iter().filter(|t| t.name == *name).count() != 1)
            || tools.iter().any(|t| {
                !t.input_schema.is_object()
                    || !t.output_schema.as_ref().is_some_and(Value::is_object)
            })
        {
            return Err(Failure::Protocol);
        }
        Ok(tools)
    }
    pub async fn close(&mut self) {
        self.kill_group();
        let _ = self.child.start_kill();
        let _ = self.child.wait().await;
        self.pid = 0;
    }
    fn kill_group(&self) {
        // pid belongs to the unreaped child; never targets the app's process group.
        if self.pid != 0 {
            unsafe {
                libc::kill(-(self.pid as i32), libc::SIGKILL);
            }
        }
    }
}
impl Drop for Process {
    fn drop(&mut self) {
        self.kill_group(); /* Child::drop also kills and reaps through Tokio. */
    }
}
