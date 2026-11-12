//! Native-free real Store/cache/HTTP probes. Frozen source files are read only;
//! no whole fixture copies and no font copies in artifacts.
use super::*;
use sha2::{Digest, Sha256};
fn svg(content: &str) -> Vec<u8> {
    format!("<svg xmlns='http://www.w3.org/2000/svg' width='800' height='240'><rect width='800' height='240' fill='white'/>{content}</svg>").into_bytes()
}
async fn thumbnail(f: &Fixture, pixels: u32) -> image::RgbaImage {
    f.core
        .grant_thumbnail(
            &f.window,
            &f.attachment.id,
            &f.token,
            pixels,
            "http://127.0.0.1:1",
        )
        .await
        .unwrap();
    image::open(&files(&f.cache_root)[0]).unwrap().into_rgba8()
}
fn different(a: &image::RgbaImage, b: &image::RgbaImage, region: (u32, u32, u32, u32)) -> usize {
    let (x, y, w, h) = region;
    (y..y + h)
        .flat_map(|y| (x..x + w).map(move |x| (x, y)))
        .filter(|&(x, y)| a.get_pixel(x, y) != b.get_pixel(x, y))
        .count()
}
pub async fn svg104_visible_chinese_latin_tspan_and_vector_styles() {
    let blank = Fixture::new(svg(""), "image/svg+xml");
    let blank = thumbnail(&blank, 800).await;
    for (content, region) in [
        ("<text x='20' y='90' font-size='64'>记录更自然 CyberNote 123，。！？</text>", (20,20,760,90)),
        ("<text x='20' y='90' font-size='64' font-family='not-installed' font-weight='700' font-style='italic'>記錄與靈感</text>", (20,20,500,90)),
        ("<text x='400' y='70' text-anchor='middle' font-size='48'><tspan>中文 ABC</tspan><tspan x='400' dy='100'>第二行</tspan></text>", (240,100,320,100)),
        ("<text x='20' y='70' font-size='48'>第一行<tspan x='20' dy='100' dx='30'>second中文</tspan></text>", (40,100,450,100)),
        ("<text x='780' y='90' text-anchor='end' style='font-size:64px;fill:#000'>中文</text>", (600,20,180,90)),
    ] {
        let f = Fixture::new(svg(content), "image/svg+xml");
        let image=thumbnail(&f,800).await;
        assert!(different(&image,&blank,region)>250,"No actual text pixels: {content}");
    }
    // Existing vector stylesheet/comment/local paint and style attribute behavior retained.
    let styled = Fixture::new(svg("<style>/* existing style */ .a { fill: #ff0000; }</style><rect class='a' x='20' y='20' width='40' height='40'/><rect x='100' y='20' width='40' height='40' style='fill:#0000ff'/><defs><linearGradient id='g'><stop stop-color='red'/></linearGradient></defs><rect x='180' y='20' width='40' height='40' fill='url(#g)'/>"),"image/svg+xml");
    let image = thumbnail(&styled, 800).await;
    assert_eq!(image.get_pixel(30, 30).0, [255, 0, 0, 255]);
    assert_eq!(image.get_pixel(110, 30).0, [0, 0, 255, 255]);
    assert_eq!(image.get_pixel(190, 30).0, [255, 0, 0, 255]);
}
pub async fn svg104_rejects_missing_external_and_complexity_without_cache() {
    let mut sources = vec![
        svg("<text x='10' y='50'>缺字\u{10ffff}</text>"),
        svg("<text x='10' y='50'>\u{1f9d1}</text>"),
        svg("<textPath href='#p'>中文</textPath>"),
        svg("<text font-size='1e100'>中文</text>"),
        svg("<text font-size='0'>中文</text>"),
        svg("<text x='10' y='50'>正常<tspan font-size='0'>遗漏</tspan></text>"),
        svg("<text x='10' y='50'>正常<tspan display='none'>遗漏</tspan></text>"),
        svg("<text x='10' y='50'>正常</text><text display='none'>遗漏</text>"),
        svg("<text x='10' y='50'>正常<tspan letter-spacing='-12000'>遗漏</tspan></text>"),
        svg("<text writing-mode='vertical-rl'>中文</text>"),
        svg("<text style='font-size:999999px'>中文</text>"),
        svg("<rect width='40' height='40' fill='url(http://127.0.0.1:9/private)'/>"),
        svg("<rect width='40' height='40' stroke='url(file:///private/secret)'/>"),
        svg("<rect width='40' height='40' fill='url(data:image/svg+xml;base64,AAAA)'/>"),
        svg("<image href='file:///etc/passwd'/><text>中文</text>"),
        svg("<image href='data:image/svg+xml;base64,AAAA'/><text>中文</text>"),
        svg("<style>@font-face{font-family:X;src:url(file:///etc/passwd)}</style><text>中文</text>"),
        svg("<style>@import url(https://example.invalid/a.css);</style>"),
        svg("<text style='fill:url(http://127.0.0.1:9/private)'>中文</text>"),
        b"<!DOCTYPE svg [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><svg xmlns='http://www.w3.org/2000/svg'><text>&x;</text></svg>".to_vec(),
        "<svg xmlns='http://www.w3.org/2000/svg' width='13000' height='20'><text>中文</text></svg>".as_bytes().to_vec(),
        svg(&format!("<text>{}</text>","中".repeat(1025))),
        svg(&format!("<text>{}</text>","<tspan>中</tspan>".repeat(128))),
        svg(&format!("<text x='{}'>中</text>","1 ".repeat(4097))),
        svg(&format!("<text><a>{}</a></text>","中".repeat(1025))),
    ];
    // Real local server is a canary: neither CSS nor font resolution may contact it.
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/font.otf", listener.local_addr().unwrap());
    sources.push(svg(&format!(
        "<style>@font-face{{font-family:X;src:url({url})}}</style><text>中文</text>"
    )));
    let secret = tempfile::NamedTempFile::new().unwrap();
    sources.push(svg(&format!(
        "<style>@font-face{{font-family:X;src:url(file://{})}}</style><text>中文</text>",
        secret.path().display()
    )));
    for source in sources {
        let f = Fixture::new(source, "image/svg+xml");
        let e = f
            .core
            .grant_thumbnail(
                &f.window,
                &f.attachment.id,
                &f.token,
                160,
                "http://127.0.0.1:1",
            )
            .await
            .err()
            .expect("Unsupported source succeeded");
        assert!(
            matches!(e.code.as_str(), "unsupported_media" | "invalid"),
            "{}",
            e.code
        );
        assert!(files(&f.cache_root).is_empty());
    }
    assert!(
        tokio::time::timeout(Duration::from_millis(50), listener.accept())
            .await
            .is_err()
    );
    // The scalar count alone is legal; trusted nominal outlines are rejected before shaping.
    let dense = Fixture::new(
        svg(&format!(
            "<text font-size='10'>{}</text>",
            "鬱".repeat(1024)
        )),
        "image/svg+xml",
    );
    let e = dense
        .core
        .grant_thumbnail(
            &dense.window,
            &dense.attachment.id,
            &dense.token,
            160,
            "http://127.0.0.1:1",
        )
        .await
        .err()
        .expect("Dense outlines must be bounded");
    assert_eq!(e.code, "unsupported_media");
}
pub async fn svg104_text_real_http_cache_replacement_and_revocation() {
    let original = svg("<text x='20' y='100' font-size='80'>中文ABC</text>");
    let f = Fixture::new(original.clone(), "image/svg+xml");
    let server = f.server().await;
    let grant = f
        .core
        .grant_thumbnail(&f.window, &f.attachment.id, &f.token, 240, &server.base)
        .await
        .unwrap();
    let r = request(&server.base, &path(&grant), "GET", "").await;
    assert_eq!(r.status, 200);
    let bytes = body(r).await;
    assert!(image::load_from_memory(&bytes).unwrap().width() <= 240);
    assert_eq!(fs::read(f.file()).unwrap(), original);
    let generated = f.core.metrics.thumbnail_generations.load(Ordering::Relaxed);
    f.core
        .grant_thumbnail(&f.window, &f.attachment.id, &f.token, 240, &server.base)
        .await
        .unwrap();
    assert_eq!(
        f.core.metrics.thumbnail_generations.load(Ordering::Relaxed),
        generated
    );
    assert_eq!(f.core.metrics.thumbnail_hits.load(Ordering::Relaxed), 1);
    // Same length new inode must invalidate old derivative/grant, not hit old text.
    let replacement = f.root.join("replacement.svg");
    fs::write(
        &replacement,
        original
            .iter()
            .map(|&b| if b == b'A' { b'Z' } else { b })
            .collect::<Vec<_>>(),
    )
    .unwrap();
    fs::rename(replacement, f.file()).unwrap();
    assert_eq!(
        request(&server.base, &path(&grant), "GET", "").await.status,
        404
    );
    f.core
        .grant_thumbnail(&f.window, &f.attachment.id, &f.token, 240, &server.base)
        .await
        .unwrap();
    assert_eq!(
        f.core.metrics.thumbnail_generations.load(Ordering::Relaxed),
        generated + 1
    );
    f.prepare_delete();
    assert!(f
        .core
        .grant_thumbnail(&f.window, &f.attachment.id, &f.token, 240, &server.base)
        .await
        .is_err());
    server.shutdown().await;
}
pub async fn svg104_frozen_50_readonly_hash_and_visible_text() {
    let root = PathBuf::from(
        std::env::var("SVG104_FIXTURE").expect("SVG104_FIXTURE must name existing frozen fixture"),
    );
    let manifest: serde_json::Value =
        serde_json::from_slice(&fs::read(root.join("manifest.json")).unwrap()).unwrap();
    let rows: Vec<_> = manifest["files"]
        .as_array()
        .unwrap()
        .iter()
        .filter(|r| r["mime"] == "image/svg+xml")
        .collect();
    assert_eq!(rows.len(), 50);
    let mut evidence = Vec::new();
    for row in rows {
        let file = root.join(row["path"].as_str().unwrap());
        let original = fs::read(&file).unwrap();
        let hash = format!("{:x}", Sha256::digest(&original));
        assert_eq!(hash, row["sha256"].as_str().unwrap());
        let f = Fixture::new(original.clone(), "image/svg+xml");
        let image = thumbnail(&f, 800).await;
        let source = String::from_utf8(original.clone()).unwrap();
        let start = source.find("<text").unwrap();
        let end = source[start..].find("</text>").unwrap() + start + 7;
        let no_text = format!("{}{}", &source[..start], &source[end..]);
        let contrast = Fixture::new(no_text.into_bytes(), "image/svg+xml");
        let contrast = thumbnail(&contrast, 800).await;
        // Source baseline (40,80)/size42 -> scale.4: actual label occupies this region.
        let changed = different(&image, &contrast, (12, 12, 260, 28));
        assert!(changed > 30, "Text missing in {}", file.display());
        evidence.push(serde_json::json!({"path":row["path"],"sourceSha256":hash,"width":image.width(),"height":image.height(),"textRoi":[12,12,260,28],"changedPixelsAgainstSameSourceWithoutText":changed}));
        assert_eq!(
            format!("{:x}", Sha256::digest(fs::read(&file).unwrap())),
            hash
        );
    }
    if let Ok(path) = std::env::var("SVG104_RESULTS") {
        fs::write(path, serde_json::to_vec_pretty(&evidence).unwrap()).unwrap();
    }
    println!(
        "frozen SVGs: {}/50 original SHA matched before+after; real text-region differences passed",
        evidence.len()
    );
}
