//! The single error type that can travel from the Rust core to the React view.
//!
//! Everything that reaches the user is a short, plain-language sentence. The
//! technical detail (a database error, a missing row, a serialisation problem)
//! is logged to the terminal instead, so it never leaks into the interface.

use serde::Serialize;

/// Errors are serialised as `{ "code": "VALIDATION", "message": "..." }` so the
/// frontend can both show `message` and branch on `code` when it needs to
/// (for example, asking "are you sure?" before discarding a focus session).
#[derive(Debug, Serialize)]
#[serde(tag = "code", rename_all = "SCREAMING_SNAKE_CASE")]
pub enum AppError {
    /// The user typed something we cannot accept (empty title, silly duration).
    Validation { message: String },

    /// The thing being edited no longer exists.
    NotFound { message: String },

    /// The action is blocked by an app rule (for example the last preset).
    Conflict { message: String },

    /// Switching presets mid-focus needs a confirmation first.
    NeedsConfirmation {
        message: String,
        #[serde(rename = "remainingMs")]
        remaining_ms: i64,
        #[serde(rename = "presetName")]
        preset_name: String,
    },

    /// A database operation failed. The real error is logged, never shown.
    Database { message: String },

    /// Anything else unexpected.
    Internal { message: String },
}

impl AppError {
    pub fn validation(message: impl Into<String>) -> Self {
        Self::Validation {
            message: message.into(),
        }
    }

    pub fn not_found(message: impl Into<String>) -> Self {
        Self::NotFound {
            message: message.into(),
        }
    }

    pub fn conflict(message: impl Into<String>) -> Self {
        Self::Conflict {
            message: message.into(),
        }
    }

    pub fn internal(message: impl Into<String>) -> Self {
        Self::Internal {
            message: message.into(),
        }
    }

    /// Logs the technical detail and gives the user a friendly sentence.
    pub fn database(context: &str, error: impl std::fmt::Debug) -> Self {
        eprintln!("[pomodesk] database error while {context}: {error:?}");
        Self::Database {
            message: "PomoDesk could not save that change. Please try again.".to_string(),
        }
    }

    /// The human-readable sentence the interface shows.
    pub fn message(&self) -> &str {
        match self {
            Self::Validation { message }
            | Self::NotFound { message }
            | Self::Conflict { message }
            | Self::NeedsConfirmation { message, .. }
            | Self::Database { message }
            | Self::Internal { message } => message,
        }
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.message())
    }
}

impl std::error::Error for AppError {}

impl From<sqlx::Error> for AppError {
    fn from(error: sqlx::Error) -> Self {
        AppError::database("talking to the local database", error)
    }
}

impl From<serde_json::Error> for AppError {
    fn from(error: serde_json::Error) -> Self {
        eprintln!("[pomodesk] json error: {error:?}");
        Self::internal("PomoDesk could not read one of its saved settings.")
    }
}
