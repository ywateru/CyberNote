//! Deterministic bounded SVG text. Only a trusted embedded font is accessible;
//! no font filesystem, system database, external CSS or resource resolver.
use super::error;
use crate::store::Result;
use resvg::usvg::{self, fontdb};
use sha2::{Digest, Sha256};
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, OnceLock,
};

pub(super) const FONT_SHA256: &str =
    "2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b";
const FONT: &[u8] = include_bytes!("../../fonts/NotoSansCJKsc-Regular.otf");
const MAX_TEXT: usize = 1024;
const MAX_SPANS: usize = 128;
const MAX_POSITIONS: usize = 4096;
const MAX_TEXT_SEGMENTS: usize = 100_000;
struct Fonts {
    db: Arc<fontdb::Database>,
    face: fontdb::ID,
}
static FONTS: OnceLock<Option<Fonts>> = OnceLock::new();
fn unsupported() -> crate::store::AppError {
    error(
        "unsupported_media",
        "SVG 文字、字体、布局或资源超出受限渲染能力",
    )
}
fn fonts() -> Result<&'static Fonts> {
    FONTS
        .get_or_init(|| {
            if format!("{:x}", Sha256::digest(FONT)) != FONT_SHA256 {
                return None;
            }
            let mut db = fontdb::Database::new();
            // Arc wraps a static slice, not a fresh 16MiB Vec per thumbnail.
            let ids = db.load_font_source(fontdb::Source::Binary(Arc::new(FONT)));
            if ids.len() != 1 {
                return None;
            }
            Some(Fonts {
                db: Arc::new(db),
                face: ids[0],
            })
        })
        .as_ref()
        .ok_or_else(unsupported)
}
fn length(value: &str, allow_normal: bool) -> Result<()> {
    let v = value.trim();
    if allow_normal && v == "normal" {
        return Ok(());
    }
    let number = v.trim_end_matches(|c: char| c.is_ascii_alphabetic() || c == '%');
    let unit = &v[number.len()..];
    if !matches!(
        unit,
        "" | "px" | "pt" | "pc" | "em" | "ex" | "%" | "in" | "cm" | "mm"
    ) {
        return Err(unsupported());
    }
    let n: f64 = number.parse().map_err(|_| unsupported())?;
    if !n.is_finite() || n.abs() > 12000.0 {
        return Err(unsupported());
    }
    Ok(())
}
fn positive_length(value: &str) -> Result<()> {
    length(value, false)?;
    let number = value
        .trim()
        .trim_end_matches(|c: char| c.is_ascii_alphabetic() || c == '%');
    if number.parse::<f64>().map_err(|_| unsupported())? <= 0.0 {
        return Err(unsupported());
    }
    Ok(())
}
fn attribute(name: &str, value: &str, positions: &mut usize) -> Result<()> {
    if matches!(name, "x" | "y" | "dx" | "dy" | "rotate") {
        for v in value
            .split(|c: char| c.is_ascii_whitespace() || c == ',')
            .filter(|v| !v.is_empty())
        {
            *positions += 1;
            if *positions > MAX_POSITIONS {
                return Err(unsupported());
            }
            length(v, false)?;
        }
    } else if name == "font-size" {
        positive_length(value)?;
    } else if matches!(
        name,
        "letter-spacing" | "word-spacing" | "textLength" | "baseline-shift"
    ) {
        if !matches!(value.trim(), "baseline" | "sub" | "super") {
            length(value, true)?;
        }
    } else if matches!(name, "writing-mode" | "direction" | "unicode-bidi") {
        // First contract is horizontal; do not silently approximate vertical/bidi layout.
        if !matches!(
            value.trim(),
            "lr" | "lr-tb" | "horizontal-tb" | "ltr" | "normal"
        ) {
            return Err(unsupported());
        }
    }
    Ok(())
}
fn safe_value(value: &str) -> Result<()> {
    let lower = value.to_ascii_lowercase();
    if lower.contains('\\') || lower.contains('@') || lower.contains("/*") {
        return Err(unsupported());
    }
    // Permit ordinary local paint references. External/data URLs never reach a resolver.
    let mut tail = lower.as_str();
    while let Some(i) = tail.find("url(") {
        tail = &tail[i + 4..];
        let end = tail.find(')').ok_or_else(unsupported)?;
        let target = tail[..end].trim().trim_matches(['\'', '"']);
        if !target.starts_with('#') || target.len() < 2 || target.chars().any(char::is_whitespace) {
            return Err(unsupported());
        }
        tail = &tail[end + 1..];
    }
    Ok(())
}
fn safe_css(value: &str) -> Result<()> {
    let mut clean = String::new();
    let mut rest = value;
    while let Some(start) = rest.find("/*") {
        clean.push_str(&rest[..start]);
        let end = rest[start + 2..].find("*/").ok_or_else(unsupported)?;
        rest = &rest[start + 2 + end + 2..];
    }
    clean.push_str(rest);
    safe_value(&clean)
}
// Count trusted nominal outlines before usvg allocates transformed glyph paths.
// A scalar limit alone still permits a large CJK outline expansion.
#[derive(Default)]
struct SegmentBudget(usize);
impl ttf_parser::OutlineBuilder for SegmentBudget {
    fn move_to(&mut self, _: f32, _: f32) {
        self.0 += 1;
    }
    fn line_to(&mut self, _: f32, _: f32) {
        self.0 += 1;
    }
    fn quad_to(&mut self, _: f32, _: f32, _: f32, _: f32) {
        self.0 += 1;
    }
    fn curve_to(&mut self, _: f32, _: f32, _: f32, _: f32, _: f32, _: f32) {
        self.0 += 1;
    }
    fn close(&mut self) {
        self.0 += 1;
    }
}
fn meaningful(s: &str) -> String {
    s.chars().filter(|c| !c.is_whitespace()).collect()
}
fn preflight(doc: &roxmltree::Document<'_>) -> Result<bool> {
    // Resource policy is shared by text and vector-only SVGs. Presentation
    // attributes (fill/stroke/clip-path/etc.) can carry URLs just like CSS;
    // disabled resolvers alone must not turn unsupported paint into a hit.
    for node in doc.descendants().filter(|n| n.is_element()) {
        for attr in node.attributes() {
            if attr.name() == "style" {
                safe_css(attr.value())?;
            } else {
                safe_value(attr.value())?;
            }
        }
    }
    let contains_text = doc
        .descendants()
        .any(|n| n.is_element() && matches!(n.tag_name().name(), "text" | "tspan"));
    if !contains_text {
        // Preserve accepted vector geometry, local paint and ordinary styles.
        // External/escaped CSS stays prohibited; no font initialization.
        for n in doc.descendants().filter(|n| n.is_element()) {
            if matches!(
                n.tag_name().name(),
                "image"
                    | "foreignObject"
                    | "script"
                    | "filter"
                    | "mask"
                    | "pattern"
                    | "use"
                    | "animate"
                    | "animateTransform"
                    | "set"
                    | "textPath"
                    | "tref"
            ) || n
                .attributes()
                .any(|a| a.name() == "href" && !a.value().starts_with('#'))
            {
                return Err(unsupported());
            }
            if n.tag_name().name() == "style" {
                safe_css(n.text().unwrap_or_default())?;
            }
        }
        return Ok(false);
    }
    let mut chars = 0usize;
    let mut spans = 0usize;
    let mut positions = 0usize;
    let mut has_text = false;
    for n in doc.descendants().filter(|n| n.is_element()) {
        let tag = n.tag_name().name();
        if matches!(
            tag,
            "image"
                | "foreignObject"
                | "script"
                | "filter"
                | "mask"
                | "pattern"
                | "use"
                | "animate"
                | "animateTransform"
                | "set"
                | "style"
                | "textPath"
                | "tref"
        ) {
            return Err(unsupported());
        }
        if matches!(tag, "text" | "tspan") {
            spans += 1;
            if spans > MAX_SPANS {
                return Err(unsupported());
            }
            if n.ancestors().count() > 64 {
                return Err(unsupported());
            }
            has_text = true;
        }
        for a in n.attributes() {
            if a.name() == "href" && !a.value().starts_with('#') {
                return Err(unsupported());
            }
            safe_value(a.value())?;
            if a.name() == "style" {
                // Small explicit CSS declaration grammar; no sheets/imports/escapes.
                for declaration in a.value().split(';').filter(|s| !s.trim().is_empty()) {
                    let (key, val) = declaration.split_once(':').ok_or_else(unsupported)?;
                    let key = key.trim();
                    if !matches!(
                        key,
                        "font-family"
                            | "font-size"
                            | "font-weight"
                            | "font-style"
                            | "text-anchor"
                            | "dominant-baseline"
                            | "alignment-baseline"
                            | "baseline-shift"
                            | "fill"
                            | "fill-opacity"
                            | "stroke"
                            | "stroke-width"
                            | "opacity"
                            | "color"
                            | "display"
                            | "visibility"
                            | "letter-spacing"
                            | "word-spacing"
                            | "writing-mode"
                            | "direction"
                            | "unicode-bidi"
                    ) {
                        return Err(unsupported());
                    }
                    attribute(key, val, &mut positions)?;
                }
            } else {
                attribute(a.name(), a.value(), &mut positions)?;
            }
        }
    }
    if has_text {
        let face = ttf_parser::Face::parse(FONT, 0).map_err(|_| unsupported())?;
        let mut budget = SegmentBudget::default();
        for n in doc.descendants().filter(|n| {
            n.is_text()
                && n.ancestors()
                    .any(|p| p.is_element() && matches!(p.tag_name().name(), "text" | "tspan"))
        }) {
            // Each actual text node once, including nested spans/links. Counting
            // parent itertext would double count; only immediate children could miss links.
            chars = chars
                .checked_add(n.text().unwrap_or_default().chars().count())
                .ok_or_else(unsupported)?;
            if chars > MAX_TEXT {
                return Err(unsupported());
            }
            for c in n.text().unwrap_or_default().chars() {
                if matches!(c, '\n' | '\r' | '\t') {
                    continue;
                }
                if c.is_control() {
                    return Err(unsupported());
                }
                let id = face.glyph_index(c).ok_or_else(unsupported)?;
                if !c.is_whitespace() && face.outline_glyph(id, &mut budget).is_none() {
                    return Err(unsupported());
                }
                if budget.0 > MAX_TEXT_SEGMENTS {
                    return Err(unsupported());
                }
            }
        }
    }
    Ok(has_text)
}
// Public usvg layouted spans retain the cluster's original text. Check each
// meaningful style span in chunk order, not only the whole Text's nonempty path:
// one good chunk must not conceal a dropped neighbour. Ambiguous multi-glyph
// cluster expansion is explicitly outside this first profile rather than
// accepting a potentially partial picture.
fn validate_layout(t: &usvg::Text) -> Result<()> {
    let expected: Vec<String> = t
        .chunks()
        .iter()
        .flat_map(|c| {
            c.spans()
                .iter()
                .map(|s| meaningful(&c.text()[s.start()..s.end()]))
        })
        .filter(|s| !s.is_empty())
        .collect();
    let mut actual = Vec::new();
    let face = ttf_parser::Face::parse(FONT, 0).map_err(|_| unsupported())?;
    let mut budget = SegmentBudget::default();
    for span in t.layouted() {
        let mut text = String::new();
        for glyph in &span.positioned_glyphs {
            let part = meaningful(&glyph.text);
            if !part.is_empty() {
                if glyph.id.0 == 0 || face.outline_glyph(glyph.id, &mut budget).is_none() {
                    return Err(unsupported());
                }
                if budget.0 > MAX_TEXT_SEGMENTS {
                    return Err(unsupported());
                }
                text.push_str(&part);
            }
        }
        if !text.is_empty() {
            actual.push(text);
        }
    }
    if actual != expected {
        return Err(unsupported());
    }
    Ok(())
}
fn outlines(
    group: &usvg::Group,
    in_text: bool,
    segments: &mut usize,
    text_paths: &mut usize,
    parsed_text: &mut String,
) -> Result<()> {
    for n in group.children() {
        match n {
            usvg::Node::Group(g) => outlines(g, in_text, segments, text_paths, parsed_text)?,
            usvg::Node::Text(t) => {
                validate_layout(t)?;
                for c in t.chunks() {
                    parsed_text.push_str(&meaningful(c.text()));
                }
                let before = *text_paths;
                outlines(t.flattened(), true, segments, text_paths, parsed_text)?;
                if *text_paths == before
                    && t.chunks().iter().any(|c| !meaningful(c.text()).is_empty())
                {
                    return Err(unsupported());
                }
            }
            usvg::Node::Path(p) if in_text => {
                *text_paths += 1;
                *segments += p.data().segments().count();
                if *segments > MAX_TEXT_SEGMENTS {
                    return Err(unsupported());
                }
            }
            _ => {}
        }
    }
    Ok(())
}
pub(super) fn render(bytes: &[u8], pixels: u32) -> Result<image::RgbaImage> {
    let text = std::str::from_utf8(bytes).map_err(|_| error("invalid", "SVG 编码无效"))?;
    let doc = roxmltree::Document::parse_with_options(
        text,
        roxmltree::ParsingOptions {
            allow_dtd: false,
            nodes_limit: 10000,
        },
    )
    .map_err(|_| error("invalid", "SVG 无效或超出复杂度限制"))?;
    if doc.root_element().tag_name().name() != "svg" {
        return Err(error("invalid", "不是 SVG 图像"));
    }
    let has_text = preflight(&doc)?;
    let missing = Arc::new(AtomicBool::new(false));
    let mut options = usvg::Options {
        resources_dir: None,
        image_href_resolver: usvg::ImageHrefResolver {
            resolve_data: Box::new(|_, _, _| None),
            resolve_string: Box::new(|_, _| None),
        },
        ..Default::default()
    };
    if has_text {
        let fonts = fonts()?;
        let id = fonts.face;
        options.fontdb = fonts.db.clone();
        options.font_family = "Noto Sans CJK SC".into();
        let failed = missing.clone();
        options.font_resolver = usvg::FontResolver {
            // Family, bold and italic are documented approximations of this single face.
            select_font: Box::new(move |_, _| Some(id)),
            select_fallback: Box::new(move |_, _, _| {
                failed.store(true, Ordering::Relaxed);
                None
            }),
        };
    }
    let tree =
        usvg::Tree::from_data(bytes, &options).map_err(|_| error("invalid", "SVG 解析失败"))?;
    if missing.load(Ordering::Relaxed) {
        return Err(unsupported());
    }
    let (mut segments, mut text_paths) = (0, 0);
    let mut parsed_text = String::new();
    outlines(
        tree.root(),
        false,
        &mut segments,
        &mut text_paths,
        &mut parsed_text,
    )?;
    if has_text {
        let source_text: String = doc
            .descendants()
            .filter(|n| {
                n.is_text()
                    && n.ancestors()
                        .any(|p| p.is_element() && matches!(p.tag_name().name(), "text" | "tspan"))
            })
            .map(|n| meaningful(n.text().unwrap_or_default()))
            .collect();
        if parsed_text != source_text {
            return Err(unsupported());
        }
    }
    if has_text
        && text_paths == 0
        && doc.descendants().any(|n| {
            n.is_text()
                && n.ancestors()
                    .any(|p| p.is_element() && matches!(p.tag_name().name(), "text" | "tspan"))
                && n.text()
                    .is_some_and(|s| s.chars().any(|c| !c.is_whitespace()))
        })
    {
        return Err(unsupported());
    }
    let size = tree.size();
    if !size.width().is_finite()
        || !size.height().is_finite()
        || size.width() > 12000.0
        || size.height() > 12000.0
    {
        return Err(error("invalid", "SVG 画布超出限制"));
    }
    let scale = (pixels as f32 / size.width().max(size.height())).min(1.0);
    let width = (size.width() * scale).round().max(1.0) as u32;
    let height = (size.height() * scale).round().max(1.0) as u32;
    let mut pixmap = resvg::tiny_skia::Pixmap::new(width, height)
        .ok_or_else(|| error("invalid", "SVG 输出尺寸无效"))?;
    resvg::render(
        &tree,
        resvg::tiny_skia::Transform::from_scale(scale, scale),
        &mut pixmap.as_mut(),
    );
    for rgba in pixmap.data_mut().chunks_exact_mut(4) {
        let a = u32::from(rgba[3]);
        if a > 0 && a < 255 {
            for c in &mut rgba[..3] {
                *c = ((u32::from(*c) * 255 + a / 2) / a).min(255) as u8;
            }
        }
    }
    image::RgbaImage::from_raw(width, height, pixmap.take())
        .ok_or_else(|| error("invalid", "SVG 输出失败"))
}
