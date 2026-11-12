//! Post-measure reference only. Exact production svg_text module is compiled
//! by path; no copied rendering algorithm, no product acquisition/coverage.
include!(concat!(env!("MEDIA105_BINDINGS")));
use sha2::{Digest,Sha256};
use serde_json::{json,Value};
use std::{fs,path::Path};
fn sha(bytes:&[u8])->String{format!("{:x}",Sha256::digest(bytes))}
fn bounded(path:&Path,limit:u64)->Result<Vec<u8>,String>{if fs::metadata(path).map_err(|e|e.to_string())?.len()>limit{return Err("analysis input exceeds limit".into());}fs::read(path).map_err(|e|e.to_string())}
fn analyze(row:&Value)->Result<Value,String>{
 let source=bounded(Path::new(row["sourcePath"].as_str().ok_or("source path")?),2*1024*1024)?;
 if sha(&source)!=row["sourceSHA256"].as_str().ok_or("source SHA")?{return Err("frozen source SHA mismatch".into());}
 let png=bounded(Path::new(row["pngPath"].as_str().ok_or("PNG path")?),8*1024*1024)?;
 if sha(&png)!=row["pngSHA256"].as_str().ok_or("PNG SHA")?{return Err("actual HTTP PNG SHA mismatch".into());}
 let mut reader=image::ImageReader::new(std::io::Cursor::new(&png)).with_guessed_format().map_err(|e|e.to_string())?;
 let mut limits=image::Limits::default();limits.max_image_width=Some(480);limits.max_image_height=Some(480);limits.max_alloc=Some(4*1024*1024);reader.limits(limits);
 let actual=reader.decode().map_err(|e|e.to_string())?.into_rgba8();
 let original=render::render(&source,480).map_err(|e|e.message)?;
 let text=std::str::from_utf8(&source).map_err(|e|e.to_string())?;let doc=roxmltree::Document::parse(text).map_err(|e|e.to_string())?;
 let nodes:Vec<_>=doc.descendants().filter(|n|n.is_element()&&n.tag_name().name()=="text").collect();
 if nodes.len()!=1{return Err("frozen single text profile changed".into());}
 let node=nodes[0];if node.attribute("x")!=Some("40")||node.attribute("y")!=Some("80")||node.attribute("font-size")!=Some("42"){return Err("frozen text ROI profile changed".into());}
 let range=node.range();let mut without=String::with_capacity(source.len());without.push_str(&text[..range.start]);without.push_str(&text[range.end..]);
 let contrast=render::render(without.as_bytes(),480).map_err(|e|e.message)?;
 if actual.dimensions()!=(480,360)||actual.dimensions()!=original.dimensions()||actual.dimensions()!=contrast.dimensions(){return Err("expected exact480x360 dimensions".into());}
 let equal=actual.as_raw()==original.as_raw();let(mut changed,mut outside)=(0usize,0usize);let(mut minx,mut miny,mut maxx,mut maxy)=(480u32,360u32,0u32,0u32);
 for y in 0..360{for x in 0..480{if actual.get_pixel(x,y)!=contrast.get_pixel(x,y){changed+=1;minx=minx.min(x);miny=miny.min(y);maxx=maxx.max(x);maxy=maxy.max(y);if !(6..166).contains(&x)||!(6..28).contains(&y){outside+=1;}}}}
 if sha(&bounded(Path::new(row["sourcePath"].as_str().unwrap()),2*1024*1024)?)!=row["sourceSHA256"].as_str().unwrap(){return Err("source changed during analysis".into());}
 Ok(json!({"attachmentId":row["attachmentId"],"sampleIndex":row["sampleIndex"],"sourceSHA256":row["sourceSHA256"],"actualPngSHA256":sha(&png),"actualRgbaSHA256":sha(actual.as_raw()),"referenceRgbaSHA256":sha(original.as_raw()),"noTextRgbaSHA256":sha(contrast.as_raw()),"width":480,"height":360,"roi":[6,6,160,22],"changedPixels":changed,"outsideRoiChangedPixels":outside,"differenceBounds":if changed>0{json!([minx,miny,maxx+1,maxy+1])}else{Value::Null},"fullReferenceEqual":equal,"passed":equal&&changed>0&&outside==0}))
}
fn main()->Result<(),Box<dyn std::error::Error>>{
 let path=std::env::args().nth(1).ok_or("analysis request required")?;let input:Value=serde_json::from_slice(&bounded(Path::new(&path),128*1024)?)?;
 let rows=input["captures"].as_array().ok_or("captures required")?;if rows.len()>50{return Err("max50 references".into());}
 let mut results=Vec::new();for row in rows{results.push(match analyze(row){Ok(v)=>v,Err(message)=>json!({"attachmentId":row["attachmentId"],"sampleIndex":row["sampleIndex"],"passed":false,"error":message})});}
 let passed=results.iter().all(|v|v["passed"]==true);println!("{}",json!({"allPassed":passed,"results":results,"scope":"post-measure exact production renderer references, never product coverage/IO timing","fontSHA256":"2c76254f6fc379fddfce0a7e84fb5385bb135d3e399294f6eeb6680d0365b74b","algorithm":"media-thumbnail-v3-svg-text","pixels":480}));if !passed{std::process::exit(1);}Ok(())
}
