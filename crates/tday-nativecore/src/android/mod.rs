// Copyright (c) 2024-2026 Tday Authors. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1
// See LICENSE in the repository root for full license text.

//! Android/ADB automation module.

pub mod device;
pub mod input;
pub mod navigation;
pub mod screenshot;
pub mod ui_automator;

pub use device::AndroidDevice;
