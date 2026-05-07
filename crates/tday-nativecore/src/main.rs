// Copyright (c) 2024-2026 Tday Authors. All rights reserved.
// SPDX-License-Identifier: BUSL-1.1
// See LICENSE in the repository root for full license text.

// Suppress deprecated-API warnings that come from cocoa / objc macros.
#![allow(deprecated)]

use tday_nativecore::DevToolsServer;

fn main() -> Result<(), Box<dyn std::error::Error>> {
    start_server()
}

#[tokio::main]
async fn start_server() -> Result<(), Box<dyn std::error::Error>> {
    use rmcp::ServiceExt;
    use tokio::signal;
    use tracing_subscriber::{fmt, prelude::*, EnvFilter};

    // Log to stderr — stdout carries the MCP JSON-RPC stream.
    tracing_subscriber::registry()
        .with(fmt::layer().with_writer(std::io::stderr))
        .with(
            EnvFilter::from_default_env()
                .add_directive("tday_nativecore=info".parse()?),
        )
        .init();

    tracing::info!("Starting tday-nativecore MCP server");

    let server  = DevToolsServer::new();
    let service = server.serve(rmcp::transport::stdio()).await?;

    tokio::select! {
        result = service.waiting() => { result?; }
        _ = signal::ctrl_c()       => { tracing::info!("SIGINT — shutting down"); }
    }

    tracing::info!("Server stopped");
    std::process::exit(0);
}
