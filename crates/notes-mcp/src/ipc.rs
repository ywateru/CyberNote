use crate::{
    schema,
    security::{Access, Config},
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};
use tokio::{
    io::{AsyncBufReadExt, AsyncWriteExt, BufReader},
    net::UnixStream,
    time::{Duration, timeout},
};
use uuid::Uuid;
use zeroize::Zeroizing;

pub fn error(code: &str, message: &str, retryable: bool) -> Value {
    json!({"code":code,"message":message,"retryable":retryable})
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct Request<'a> {
    version: u32,
    request_id: String,
    workspace_id: &'a str,
    client_id: &'a str,
    credential: &'a str,
    tool: &'a str,
    arguments: &'a Value,
}
#[derive(Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct Response {
    version: u32,
    request_id: String,
    result: Value,
    is_error: bool,
}

/// A hard bound including the newline. EOF without newline is not a complete frame.
pub async fn read_frame<R: tokio::io::AsyncRead + Unpin>(
    read: R,
) -> Result<Zeroizing<Vec<u8>>, Value> {
    let mut r = BufReader::new(read);
    let mut bytes = Zeroizing::new(Vec::new());
    loop {
        let chunk = r.fill_buf().await.map_err(|_| {
            error(
                "HOST_UNAVAILABLE",
                "Host connection interrupted; a write may have committed",
                false,
            )
        })?;
        if chunk.is_empty() {
            return Err(error(
                "HOST_UNAVAILABLE",
                "Incomplete host response; a write may have committed",
                false,
            ));
        }
        let end = chunk.iter().position(|b| *b == b'\n').map(|n| n + 1);
        let n = end.unwrap_or(chunk.len());
        if bytes.len() + n > schema::FRAME {
            return Err(error(
                "HOST_UNAVAILABLE",
                "Host frame exceeds transport limit; a write may have committed",
                false,
            ));
        }
        bytes.extend_from_slice(&chunk[..n]);
        r.consume(n);
        if end.is_some() {
            return Ok(bytes);
        }
    }
}
pub async fn call(c: &Config, tool: &str, args: &Value) -> Result<(Value, bool), Value> {
    let duration = Duration::from_secs(if schema::write(tool) { 20 } else { 5 });
    timeout(duration, exchange(c, tool, args))
        .await
        .unwrap_or_else(|_| {
            Err(error(
                "TIMEOUT",
                "Host deadline exceeded; query an obtained operationId or recover with the original idempotency key and parameters",
                false,
            ))
        })
}
async fn exchange(c: &Config, tool: &str, args: &Value) -> Result<(Value, bool), Value> {
    let unauthorized = || {
        error(
            "UNAUTHORIZED",
            "Private credential or endpoint validation failed",
            false,
        )
    };
    let access = Access::load(c).map_err(|reason| {
        if reason == "host socket unavailable" {
            error("HOST_UNAVAILABLE", "Workspace host unavailable", false)
        } else if reason == "host socket path too long" {
            error("HOST_UNAVAILABLE", "Host socket path exceeds platform byte limit; select a shorter private --runtime-dir", false)
        } else if reason == "workspace credential mismatch" {
            error("WORKSPACE_UNAVAILABLE", "Workspace credential binding mismatch", false)
        } else {
            unauthorized()
        }
    })?;
    let id = Uuid::new_v4();
    let request = Request {
        version: 1,
        request_id: id.to_string(),
        workspace_id: &c.workspace_id,
        client_id: access.client_id(),
        credential: access.credential(),
        tool,
        arguments: args,
    };
    let mut frame = Zeroizing::new(
        serde_json::to_vec(&request)
            .map_err(|_| error("SCHEMA_INVALID", "Request cannot be encoded", false))?,
    );
    frame.push(b'\n');
    if frame.len() > schema::FRAME {
        return Err(error(
            "CONTENT_TOO_LARGE",
            "Encoded IPC request exceeds 2 MiB",
            false,
        ));
    }
    let mut stream = UnixStream::connect(access.socket_path())
        .await
        .map_err(|_| error("HOST_UNAVAILABLE", "Workspace host unavailable", false))?;
    let peer = stream.peer_cred().map_err(|_| unauthorized())?;
    if peer.uid() != unsafe { libc::geteuid() } {
        return Err(unauthorized());
    }
    access.recheck(c).map_err(|_| unauthorized())?;
    stream.write_all(&frame).await.map_err(|_| {
        error(
            "HOST_UNAVAILABLE",
            "Host send failed; a write may have committed",
            false,
        )
    })?;
    drop(frame);
    let bytes = read_frame(&mut stream).await?;
    let invalid = || {
        error(
            "HOST_UNAVAILABLE",
            "Invalid host response; a write may have committed",
            false,
        )
    };
    let response: Response = serde_json::from_slice(&bytes).map_err(|_| invalid())?;
    if response.version != 1
        || Uuid::parse_str(&response.request_id).ok() != Some(id)
        || !response.result.is_object()
    {
        return Err(invalid());
    }
    access.recheck(c).map_err(|_| unauthorized())?;
    // Never forward an accidentally echoed raw credential, even inside a host error message.
    if contains_credential(&response.result, access.credential()) {
        return Err(invalid());
    }
    if tool == "notes_get_capabilities"
        && !response.is_error
        && response.result["workspaceId"] != c.workspace_id
    {
        return Err(invalid());
    }
    if !response.is_error {
        let target_matches = match tool {
            "notes_read" => {
                response.result["id"] == args["noteId"]
                    && response.result["format"]
                        == args.get("format").cloned().unwrap_or(json!("text"))
            }
            "notes_append" | "notes_update" => response.result["noteId"] == args["noteId"],
            "notes_get_operation" => response.result["operationId"] == args["operationId"],
            _ => true,
        };
        if !target_matches {
            return Err(invalid());
        }
    }
    if matches!(tool, "notes_list" | "notes_search" | "notes_list_folders")
        && serde_json::to_vec(&response.result)
            .map_err(|_| invalid())?
            .len()
            > 512 * 1024
    {
        return Err(error(
            "CONTENT_TOO_LARGE",
            "Host list response exceeds 512 KiB",
            false,
        ));
    }
    if !response.is_error && tool == "notes_read" {
        let content = &response.result["content"];
        if !schema::bounded_content(content)
            || (response.result["format"] == "text"
                && content.as_str().is_some_and(|s| s.len() > 32 * 1024))
            || (response.result["format"] == "document"
                && (response.result["truncated"] != false
                    || !response.result["nextContentCursor"].is_null()))
            || (response.result["truncated"] == true)
                == response.result["nextContentCursor"].is_null()
        {
            return Err(error(
                "CONTENT_TOO_LARGE",
                "Invalid or oversized host content page",
                false,
            ));
        }
    }
    Ok((response.result, response.is_error))
}

fn contains_credential(value: &Value, credential: &str) -> bool {
    let mut stack = vec![value];
    while let Some(value) = stack.pop() {
        match value {
            Value::String(s) if s.contains(credential) => return true,
            Value::Object(o) => {
                if o.keys().any(|k| k.contains(credential)) {
                    return true;
                }
                stack.extend(o.values());
            }
            Value::Array(a) => stack.extend(a),
            _ => {}
        }
    }
    false
}
