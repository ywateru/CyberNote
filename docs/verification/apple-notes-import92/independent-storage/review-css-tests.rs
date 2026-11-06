use super::*;
#[test]
fn review_unsupported_css_warns_without_losing_raw() {
 for declaration in ["font-size:32px","font-family:Courier","text-align:center"] {
  let html=format!("<p style='{declaration}'>合成样式</p>");
  let n=SourceNote{id:"review-css".into(),folders:vec![SourceFolder{id:"review-account".into(),name:"合成账户".into()}],title:"样式".into(),html:html.clone(),plain_text:"合成样式".into(),created_at_ms:100,updated_at_ms:100,status:"ok".into(),attachments:vec![]};
  let p=prepare_one(n).unwrap();assert!(!p.warnings.is_empty());
  let raw=p.attachments.iter().find(|a|a.mime==RAW_MIME).unwrap();let raw:RawRecord=serde_json::from_slice(&B64.decode(&p.files[&raw.id]).unwrap()).unwrap();assert_eq!(raw.snapshot["html"],html);
 }
}
