use super::*;
fn convert_review(html_text: &str) -> Value {
 let result=html::convert(html_text,&BTreeMap::new(),&[]).unwrap().0;
 let prepared=prepare_one(SourceNote{id:"review-account\0whitespace-shape".into(),folders:vec![SourceFolder{id:"review-account".into(),name:"合成账户".into()}],title:"合成结构".into(),html:html_text.into(),plain_text:"合成元数据".into(),created_at_ms:100,updated_at_ms:200,status:"ok".into(),attachments:vec![]}).unwrap();
 let raw=prepared.attachments.iter().find(|a|a.mime==RAW_MIME).unwrap();let bytes=B64.decode(&prepared.files[&raw.id]).unwrap();let retained:RawRecord=serde_json::from_slice(&bytes).unwrap();assert!(retained.valid());assert_eq!(retained.snapshot["html"],html_text);assert_eq!(retained.snapshot["plainText"],"合成元数据");assert_eq!(prepared.note.created_at,100);assert_eq!(prepared.note.updated_at,200);
 result
}
fn text_content(n:&Value)->String { if n["type"]=="text" { return n["text"].as_str().unwrap().to_string(); } n["content"].as_array().map(|c|c.iter().map(text_content).collect()).unwrap_or_default() }
#[test]
fn review_six_div_formatting_whitespace_has_no_extra_paragraphs() {
 let d=convert_review("<div><h1>合成标题</h1></div>\n<div>甲<br>乙</div>\n<div><br></div>\n<div>丙<br>丁</div>\n<div>戊</div>\n<div>己</div>\n");
 let b=d["content"].as_array().unwrap();assert_eq!(b.len(),6,"outside formatting whitespace must not become paragraphs");
 assert_eq!(b[0]["type"],"heading");assert_eq!(b[0]["attrs"]["level"],1);
 assert_eq!(b.iter().map(text_content).collect::<Vec<_>>(),vec!["合成标题","甲乙","","丙丁","戊","己"]);
 assert_eq!(b.iter().map(|x|x["content"].as_array().unwrap().iter().filter(|n|n["type"]=="hardBreak").count()).sum::<usize>(),4);
}
#[test]
fn review_explicit_empty_div_br_and_inline_spaces_survive() {
 let d=convert_review("<div>甲 <b>乙</b> 丙</div>\n  <div></div>\n<div><br></div>\n<div>丁<br>戊</div>");
 let b=d["content"].as_array().unwrap();assert_eq!(b.len(),4);assert_eq!(text_content(&b[0]),"甲 乙 丙");
 assert!(b[0]["content"].as_array().unwrap().iter().any(|n|n["marks"].as_array().is_some_and(|m|m.iter().any(|m|m["type"]=="bold"))));
 assert_eq!(b[1]["type"],"paragraph");assert_eq!(text_content(&b[1]),"");assert_eq!(b[2]["content"][0]["type"],"hardBreak");assert_eq!(b[3]["content"][1]["type"],"hardBreak");
}
#[test]
fn review_pre_and_nonbreaking_space_not_trimmed() {
 let d=convert_review("<pre> 甲  乙 \n丙\t丁</pre>");assert_eq!(text_content(&d)," 甲  乙 \n丙\t丁");
 let d=convert_review("<div>甲</div>\n<div>&nbsp;</div>\n<div>乙</div>");let b=d["content"].as_array().unwrap();assert_eq!(b.len(),3);assert_eq!(text_content(&b[1]),"\u{a0}");
}
