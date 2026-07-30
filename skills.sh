#!/bin/sh
set -eu

BASE_URL="${BOPLOG_BASE_URL:-https://kvnloo.github.io/boplog}"
BIN_DIR="${BOPLOG_BIN_DIR:-$HOME/.local/bin}"

mkdir -p "$BIN_DIR"

printf '%s\n' "Installing boplog CLI to $BIN_DIR/boplog"
curl -fsSL "$BASE_URL/boplog" -o "$BIN_DIR/boplog"
chmod +x "$BIN_DIR/boplog"

printf '%s\n' "Installing boplog MCP server to $BIN_DIR/boplog-mcp"
curl -fsSL "$BASE_URL/mcp/boplog_mcp.py" -o "$BIN_DIR/boplog-mcp"
chmod +x "$BIN_DIR/boplog-mcp"

printf '%s\n' "Installed. Try: boplog latest 5"
printf '%s\n' "MCP command: $BIN_DIR/boplog-mcp"
