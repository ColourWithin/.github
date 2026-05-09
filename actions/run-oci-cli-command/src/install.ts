import * as core from "@actions/core";
import { execFile as execFileCallback } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import { delimiter, join } from "node:path";
import { promisify } from "node:util";

export const MIN_OCI_CLI_VERSION = "3.81.1";
const SENTINEL_FILE = ".oci-cli-installed";
const execFile = promisify(execFileCallback);

export async function ensureOciCli(): Promise<string> {
  const userBin = getUserBinDirectory();
  addPathOnce(userBin);

  const currentVersion = await detectOciVersion();
  if (currentVersion !== null && satisfiesMinimum(currentVersion, MIN_OCI_CLI_VERSION) && sentinelMatches(currentVersion)) {
    return currentVersion;
  }
  if (currentVersion !== null && satisfiesMinimum(currentVersion, MIN_OCI_CLI_VERSION)) {
    writeSentinel(currentVersion);
    return currentVersion;
  }

  await installOciCli();
  addPathOnce(userBin);

  const installedVersion = await detectOciVersion();
  if (installedVersion === null || !satisfiesMinimum(installedVersion, MIN_OCI_CLI_VERSION)) {
    throw new Error(`installed OCI CLI does not satisfy >=${MIN_OCI_CLI_VERSION}`);
  }
  writeSentinel(installedVersion);
  return installedVersion;
}

async function detectOciVersion(): Promise<string | null> {
  try {
    const result = await execFile("oci", ["--version"], { encoding: "utf8" });
    return parseOciVersion(`${result.stdout}\n${result.stderr}`);
  } catch {
    return null;
  }
}

async function installOciCli(): Promise<void> {
  core.info(`Installing or upgrading OCI CLI with python -m pip install --user 'oci-cli>=${MIN_OCI_CLI_VERSION}'`);
  try {
    await execFile("python", ["-m", "pip", "install", "--user", `oci-cli>=${MIN_OCI_CLI_VERSION}`], {
      encoding: "utf8",
      maxBuffer: 10 * 1024 * 1024
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`failed to install OCI CLI >=${MIN_OCI_CLI_VERSION}: ${detail}`);
  }
}

export function parseOciVersion(output: string): string {
  const match = output.match(/\b(\d+\.\d+\.\d+)\b/);
  if (!match) {
    throw new Error(`could not parse OCI CLI version from: ${output.trim()}`);
  }
  return match[1];
}

export function satisfiesMinimum(version: string, minimum: string): boolean {
  return compareVersions(version, minimum) >= 0;
}

function compareVersions(left: string, right: string): number {
  const leftParts = left.split(".").map(Number);
  const rightParts = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
    if (delta !== 0) {
      return delta;
    }
  }
  return 0;
}

function sentinelMatches(version: string): boolean {
  const path = sentinelPath();
  if (!existsSync(path)) {
    return false;
  }
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8")) as { required?: string; version?: string };
    return parsed.required === MIN_OCI_CLI_VERSION && parsed.version === version;
  } catch {
    return false;
  }
}

function writeSentinel(version: string): void {
  const path = sentinelPath();
  writeFileSync(path, JSON.stringify({ required: MIN_OCI_CLI_VERSION, version }, null, 2));
}

function sentinelPath(): string {
  return join(getHomeDirectory(), SENTINEL_FILE);
}

function getUserBinDirectory(): string {
  const home = getHomeDirectory();
  if (platform() === "win32") {
    return join(home, "AppData", "Roaming", "Python", "Scripts");
  }
  return join(home, ".local", "bin");
}

function getHomeDirectory(): string {
  return process.env.HOME || homedir();
}

function addPathOnce(path: string): void {
  mkdirSync(path, { recursive: true });
  const currentPath = process.env.PATH ?? "";
  const entries = currentPath.split(delimiter).filter(Boolean);
  if (!entries.includes(path)) {
    process.env.PATH = [path, ...entries].join(delimiter);
    core.addPath(path);
  }
}
