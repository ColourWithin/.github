import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureOciCli, MIN_OCI_CLI_VERSION } from "../src/install";

let root: string;
let bin: string;
let home: string;
let originalPath: string | undefined;
let originalHome: string | undefined;

function writeShim(name: string, body: string): string {
  const path = join(bin, name);
  writeFileSync(path, `#!/bin/sh\n${body}\n`);
  chmodSync(path, 0o755);
  return path;
}

describe("ensureOciCli", () => {
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "cw-oci-install-"));
    bin = join(root, "bin");
    home = join(root, "home");
    mkdirSync(bin);
    mkdirSync(home);
    originalPath = process.env.PATH;
    originalHome = process.env.HOME;
    process.env.PATH = `${bin}:/bin:/usr/bin`;
    process.env.HOME = home;
    vi.resetModules();
  });

  afterEach(() => {
    process.env.PATH = originalPath;
    process.env.HOME = originalHome;
    rmSync(root, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  it("exposes the current minimum version constant", () => {
    expect(MIN_OCI_CLI_VERSION).toBe("3.81.1");
  });

  it("returns a bare semver for a current CLI", async () => {
    writeShim("oci", "echo '3.81.1'");
    await expect(ensureOciCli()).resolves.toBe("3.81.1");
  });

  it("accepts a newer CLI", async () => {
    writeShim("oci", "echo '3.82.0'");
    await expect(ensureOciCli()).resolves.toBe("3.82.0");
  });

  it("installs when the CLI is missing", async () => {
    writeShim("python", `mkdir -p "$HOME/.local/bin"; cat > "$HOME/.local/bin/oci" <<'SH'\n#!/usr/bin/env bash\necho '3.81.1'\nSH\nchmod +x "$HOME/.local/bin/oci"`);
    await expect(ensureOciCli()).resolves.toBe("3.81.1");
    expect(readFileSync(join(home, ".oci-cli-installed"), "utf8")).toContain("3.81.1");
  });

  it("upgrades an old CLI despite a stale sentinel", async () => {
    writeShim("oci", "echo '3.80.0'");
    writeShim("python", `cat > "${bin}/oci" <<'SH'\n#!/usr/bin/env bash\necho '3.81.1'\nSH\nchmod +x "${bin}/oci"`);
    writeFileSync(join(home, ".oci-cli-installed"), JSON.stringify({ required: "3.81.1", version: "3.80.0" }));
    await expect(ensureOciCli()).resolves.toBe("3.81.1");
  });

  it("surfaces pip failure", async () => {
    writeShim("python", "exit 17");
    await expect(ensureOciCli()).rejects.toThrow(/install OCI CLI/);
  });
});
