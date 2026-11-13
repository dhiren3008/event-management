#!/usr/bin/env node
// Frees port 3000 before json-server starts.
//
// Why this exists: two sibling projects in "Web development" are both
// configured for port 3000 (this one and "Infinity"). Whoever starts first
// owns the port and the other dies with EADDRINUSE. This runs ahead of
// json-server and evicts whatever is already squatting on the port.
//
// Safety: it only ever kills processes whose command line contains
// "json-server", so it cannot take down an unrelated app (office-backend,
// opencode, browsers, ...).
//
// Windows-only, zero dependencies. Always exits 0 — if we cannot inspect or
// clear the port we must not mask json-server's own error output.

import { spawnSync } from 'node:child_process';

const PORT = 3000;

// Passed as a single -Command argument (no shell in between), so the
// PowerShell quoting never has to survive cmd.exe reinterpretation.
const psScript = `
$ErrorActionPreference = 'SilentlyContinue'
$evicted = $false

foreach ($listener in Get-NetTCPConnection -LocalPort ${PORT} -State Listen) {
  $owner = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
  if ($owner -and $owner.CommandLine -like '*json-server*') {
    Stop-Process -Id $listener.OwningProcess -Force
    Write-Output "  free-port: evicted PID $($listener.OwningProcess) from port ${PORT}"
    $evicted = $true
  }
}

# The socket needs a moment to be released after the kill, otherwise
# json-server rebinds into the same EADDRINUSE it was meant to avoid.
if ($evicted) {
  $deadline = (Get-Date).AddSeconds(5)
  while ((Get-Date) -lt $deadline) {
    $busy = Get-NetTCPConnection -LocalPort ${PORT} -State Listen
    if (-not $busy) { break }
    Start-Sleep -Milliseconds 200
  }
}
`;

const result = spawnSync(
  'powershell',
  ['-NoLogo', '-NoProfile', '-NonInteractive', '-Command', psScript],
  { encoding: 'utf8', windowsHide: true }
);

if (result.stdout && result.stdout.trim()) {
  process.stdout.write(result.stdout.trimEnd() + '\n');
}

if (result.error) {
  console.warn(`free-port: could not inspect port ${PORT} (${result.error.message}) — continuing anyway`);
}

process.exit(0);
