//! Business rules live here. Commands stay thin (parse + call), repositories
//! stay dumb (SQL only), and this layer decides what is allowed.

pub mod presets;
pub mod settings;
pub mod stats;
pub mod subtasks;
pub mod tasks;
