//! The database access layer.
//!
//! Rule of thumb for this project: **SQL only lives here.** Services ask a
//! repository for data; they never write a query themselves. Every function
//! takes a `&mut SqliteConnection`, so it can be called directly with a pooled
//! connection or inside a transaction.

pub mod app_state;
pub mod presets;
pub mod sessions;
pub mod tasks;
