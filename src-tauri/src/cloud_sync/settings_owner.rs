//! Narrow portable projection of the existing AppearanceV2/PresentationV1 owners.
//! Wire keys stay compatible; local owner siblings and unrelated settings remain local.
use super::model::*;
use serde_json::{json, Value};
use std::collections::BTreeMap;

pub(crate) const KEYS: [&str; 4] = ["theme", "view", "sort", "groupDates"];
fn exact(value: &Value, keys: &[&str]) -> Result<()> {
    let object = value.as_object().ok_or_else(|| error("state"))?;
    if object.len() != keys.len() || keys.iter().any(|key| !object.contains_key(*key)) {
        return Err(error("state"));
    }
    Ok(())
}
fn choice(value: &Value, choices: &[&str]) -> bool {
    value.as_str().is_some_and(|v| choices.contains(&v))
}
fn validate_owners(b: &Value) -> Result<()> {
    if !b.is_object() {
        return Err(error("state"));
    }
    if let Some(a) = b.get("appearance") {
        exact(a, &["version", "themeId", "schemePreference"])?;
        if a["version"] != 2
            || !choice(
                &a["themeId"],
                &[
                    "classic",
                    "paper",
                    "high-contrast",
                    "ocean",
                    "forest",
                    "rose",
                    "lavender",
                    "graphite",
                ],
            )
            || !choice(&a["schemePreference"], &["system", "light", "dark"])
        {
            return Err(error("state"));
        }
    }
    if let Some(p) = b.get("presentation") {
        exact(p, &["version", "desktop", "mobile"])?;
        exact(
            &p["desktop"],
            &[
                "navigation",
                "lastNonFocusNavigation",
                "collectionView",
                "density",
            ],
        )?;
        exact(&p["mobile"], &["collectionView", "density"])?;
        if p["version"] != 1
            || !choice(
                &p["desktop"]["navigation"],
                &["three-pane", "two-pane", "focus"],
            )
            || !choice(
                &p["desktop"]["lastNonFocusNavigation"],
                &["three-pane", "two-pane"],
            )
            || !choice(&p["desktop"]["collectionView"], &["list", "gallery"])
            || !choice(&p["mobile"]["collectionView"], &["list", "gallery"])
            || !choice(
                &p["desktop"]["density"],
                &["compact", "standard", "comfortable"],
            )
            || !choice(&p["mobile"]["density"], &["standard", "comfortable"])
        {
            return Err(error("state"));
        }
    }
    for k in KEYS {
        if b.get(k).is_some_and(|v| !SettingVersion::valid_value(k, v)) {
            return Err(error("state"));
        }
    }
    if b.get("macSidebarVisible").is_some_and(|v| !v.is_boolean()) {
        return Err(error("state"));
    }
    Ok(())
}
pub(crate) fn values(b: &Value) -> Result<BTreeMap<String, Value>> {
    validate_owners(b)?;
    let mut values = BTreeMap::new();
    for key in KEYS {
        let value = match key {
            "theme" if b.get("appearance").is_some() => Some(&b["appearance"]["schemePreference"]),
            "view" if b.get("presentation").is_some() => {
                Some(&b["presentation"]["desktop"]["collectionView"])
            }
            _ => b.get(key),
        };
        if let Some(value) = value {
            values.insert(key.into(), value.clone());
        }
    }
    Ok(values)
}
/// Only deliberate portable keys create/update their owner. All nonportable
/// siblings are retained exactly; legacy missing owners migrate as Store does.
pub(crate) fn project(b: &mut Value, selected: &BTreeMap<String, Value>) -> Result<()> {
    validate_owners(b)?;
    for (key, value) in selected {
        if !SettingVersion::valid_value(key, value) {
            return Err(error("invalid"));
        }
        match key.as_str() {
            "theme" => {
                if b.get("appearance").is_none() {
                    b["appearance"] = json!({"version":2,"themeId":"classic","schemePreference":b.get("theme").cloned().unwrap_or(json!("system"))});
                }
                b["appearance"]["schemePreference"] = value.clone();
                b["theme"] = value.clone();
            }
            "view" => {
                if b.get("presentation").is_none() {
                    let nav = if b.get("macSidebarVisible") == Some(&json!(false)) {
                        "two-pane"
                    } else {
                        "three-pane"
                    };
                    b["presentation"] = json!({"version":1,"desktop":{"navigation":nav,"lastNonFocusNavigation":nav,"collectionView":b.get("view").cloned().unwrap_or(json!("list")),"density":"standard"},"mobile":{"collectionView":"gallery","density":"standard"}});
                }
                b["presentation"]["desktop"]["collectionView"] = value.clone();
                b["view"] = value.clone();
                let d = &b["presentation"]["desktop"];
                let nav = if d["navigation"] == "focus" {
                    &d["lastNonFocusNavigation"]
                } else {
                    &d["navigation"]
                };
                b["macSidebarVisible"] = json!(nav == "three-pane");
            }
            _ => b[key] = value.clone(),
        }
    }
    validate_owners(b)
}
/// Match effective frontend owner selection. Both type and value are used by
/// triggers so missing, explicit null, false and strings cannot collapse together.
pub(crate) fn expression(row: &str, key: &str, kind: &str) -> String {
    let path = match key {
        "theme" => Some(("appearance", "appearance.schemePreference")),
        "view" => Some(("presentation", "presentation.desktop.collectionView")),
        _ => None,
    };
    if let Some((owner, path)) = path {
        format!("CASE WHEN json_type({row}.body,'$.{owner}') IS NOT NULL THEN {kind}({row}.body,'$.{path}') ELSE {kind}({row}.body,'$.{key}') END")
    } else {
        format!("{kind}({row}.body,'$.{key}')")
    }
}
