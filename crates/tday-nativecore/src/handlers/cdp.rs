// Copyright (c) 2024-2026 Tday Authors. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1
// See LICENSE in the repository root for full license text.

//! CDP (Chrome DevTools Protocol) handlers — thin bridge from server dispatch
//! to the cdp::tools functions.

pub use crate::cdp::CdpClient;
use std::sync::Arc;
use tokio::sync::RwLock;

#[allow(dead_code)]
pub type SharedCdpClient = Arc<RwLock<Option<CdpClient>>>;
