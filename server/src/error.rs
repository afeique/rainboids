use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("encode: {0}")]
    Encode(#[from] bincode::Error),
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("{0}")]
    Other(String),
}

pub type Result<T> = std::result::Result<T, AppError>;
