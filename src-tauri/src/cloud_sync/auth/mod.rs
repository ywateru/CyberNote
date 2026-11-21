//! OpenList-compatible authorization. This module owns only OAuth attempts,
//! token refresh and the encrypted credential vault. It never owns a Store,
//! account grant, note library or content sync schedule.
pub mod openlist;
pub mod oauth;
pub mod vault;

pub const ISSUER: &str = "https://api.oplist.org";
