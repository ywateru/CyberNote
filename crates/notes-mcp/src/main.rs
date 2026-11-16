#[cfg(unix)]
#[tokio::main]
async fn main() {
    use rmcp::{
        ServiceExt,
        transport::{async_rw::AsyncRwTransport, stdio_pipes},
    };
    let args: Vec<_> = std::env::args().skip(1).collect();
    if args == ["--help"] {
        eprintln!(
            "cybernote-mcp --workspace-id <id> --credential-ref <uuid> [--runtime-dir <absolute-private-directory>]"
        );
        return;
    }
    let config = match notes_mcp::security::Config::parse(args) {
        Ok(c) => c,
        Err(message) => {
            eprintln!("cybernote-mcp: {message}");
            std::process::exit(2)
        }
    };
    let (input, output) = stdio_pipes();
    let transport =
        AsyncRwTransport::new_server(input, output).with_max_line_length(notes_mcp::schema::FRAME);
    match notes_mcp::Adapter::new(config).serve(transport).await {
        Ok(service) => {
            if service.waiting().await.is_err() {
                eprintln!("cybernote-mcp: MCP session ended");
                std::process::exit(1)
            }
        }
        Err(_) => {
            eprintln!("cybernote-mcp: MCP initialization failed");
            std::process::exit(1)
        }
    }
}
#[cfg(not(unix))]
fn main() {
    eprintln!("cybernote-mcp requires Unix");
    std::process::exit(2);
}
