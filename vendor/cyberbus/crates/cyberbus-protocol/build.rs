fn main() -> Result<(), Box<dyn std::error::Error>> {
    let root = std::path::PathBuf::from("../../proto");
    let files = [
        "cyberbus/easytier/v1/sdk.proto",
        "cyberbus/example/v1/echo.proto",
    ];
    let mut config = prost_build::Config::new();
    config.protoc_executable(protoc_bin_vendored::protoc_bin_path()?);
    config.enable_type_names();
    config.file_descriptor_set_path(
        std::path::PathBuf::from(std::env::var("OUT_DIR")?).join("cyberbus.bin"),
    );
    config.compile_protos(
        &files.map(|file| root.join(file)),
        &[root.clone(), protoc_bin_vendored::include_path()?],
    )?;
    println!("cargo:rerun-if-changed={}", root.display());
    Ok(())
}
