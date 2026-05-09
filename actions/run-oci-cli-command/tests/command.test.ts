import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseCommand } from "../src/command";

function tempDir(): string {
  return mkdtempSync(join(tmpdir(), "cw-oci-command-"));
}

describe("parseCommand", () => {
  it("parses a simple OCI command into executable and argv", () => {
    const cwd = tempDir();
    try {
      expect(parseCommand({ command: "oci iam region list", workingDirectory: cwd })).toMatchObject({
        executable: "oci",
        args: ["iam", "region", "list"],
        cwd
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("preserves quoted JMESPath and inline JSON arguments", () => {
    const cwd = tempDir();
    try {
      const parsed = parseCommand({
        command: "oci os object put --from-json '{\"name\":\"a;b\",\"nested\":\"x && y\"}' --query \"data[0].name\"",
        workingDirectory: cwd
      });

      expect(parsed.args).toContain('{"name":"a;b","nested":"x && y"}');
      expect(parsed.args).toContain("data[0].name");
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("appends query input when the command has no query", () => {
    const cwd = tempDir();
    try {
      expect(parseCommand({
        command: "oci iam region list",
        query: "data[0].name",
        workingDirectory: cwd
      }).args).toEqual(["iam", "region", "list", "--query", "data[0].name"]);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("rejects query input when command already includes --query", () => {
    const cwd = tempDir();
    try {
      expect(() => parseCommand({
        command: "oci iam region list --query data[0].name",
        query: "data[1].name",
        workingDirectory: cwd
      })).toThrow(/query input cannot be used when command already includes --query/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it.each([
    ["empty command", ""],
    ["non-oci command", "echo hello"],
    ["env prefix", "OCI_CONFIG=/tmp/config oci iam region list"],
    ["semicolon", "oci iam region list; echo nope"],
    ["and operator", "oci iam region list && echo nope"],
    ["or operator", "oci iam region list || echo nope"],
    ["redirect", "oci iam region list > out.txt"],
    ["comment", "oci iam region list # hidden"],
    ["substitution", "oci iam region list $(echo bad)"]
  ])("rejects %s", (_name, command) => {
    const cwd = tempDir();
    try {
      expect(() => parseCommand({ command, workingDirectory: cwd })).toThrow();
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("rejects missing and file working directories", () => {
    const cwd = tempDir();
    const file = join(cwd, "file.txt");
    writeFileSync(file, "not a directory");
    try {
      expect(() => parseCommand({ command: "oci iam region list", workingDirectory: join(cwd, "missing") })).toThrow(/working-directory/);
      expect(() => parseCommand({ command: "oci iam region list", workingDirectory: file })).toThrow(/working-directory/);
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("resolves relative working directories against GITHUB_WORKSPACE", () => {
    const workspace = tempDir();
    const relative = join(workspace, "subdir");
    try {
      rmSync(relative, { recursive: true, force: true });
      require("node:fs").mkdirSync(relative);
      expect(parseCommand({
        command: "oci iam region list",
        workingDirectory: "subdir",
        githubWorkspace: workspace
      }).cwd).toBe(relative);
    } finally {
      rmSync(workspace, { recursive: true, force: true });
    }
  });
});
