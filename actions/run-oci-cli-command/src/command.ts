import { existsSync, statSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { parse, quote } from "shell-quote";

export interface ParseCommandOptions {
  command: string;
  query?: string;
  workingDirectory: string;
  githubWorkspace?: string;
}

export interface ParsedCommand {
  executable: "oci";
  args: string[];
  cwd: string;
  display: string;
}

export function parseCommand(options: ParseCommandOptions): ParsedCommand {
  const command = options.command.trim();
  if (command.length === 0) {
    throw new Error("command input must not be empty and must start with the literal 'oci'");
  }

  const tokens = parse(command);
  const argv = tokens.map((token) => {
    if (typeof token !== "string") {
      throw new Error("command contains shell syntax that is not allowed; pass a single OCI command as argv-compatible words");
    }
    return token;
  });

  if (argv.length === 0 || argv[0] !== "oci") {
    if (argv[0]?.includes("=")) {
      throw new Error("command must start with 'oci'; environment assignment prefixes are not allowed");
    }
    throw new Error("command must start with the literal 'oci'");
  }

  const query = options.query?.trim() ?? "";
  const args = argv.slice(1);
  if (query.length > 0) {
    if (args.some((arg) => arg === "--query" || arg.startsWith("--query="))) {
      throw new Error("query input cannot be used when command already includes --query");
    }
    args.push("--query", query);
  }

  const cwd = resolveWorkingDirectory(options.workingDirectory, options.githubWorkspace);
  return {
    executable: "oci",
    args,
    cwd,
    display: quote(["oci", ...args])
  };
}

function resolveWorkingDirectory(workingDirectory: string, githubWorkspace?: string): string {
  const trimmed = workingDirectory.trim();
  if (trimmed.length === 0) {
    throw new Error("working-directory must not be empty");
  }

  const cwd = isAbsolute(trimmed) ? trimmed : resolve(githubWorkspace ?? process.cwd(), trimmed);
  if (!existsSync(cwd)) {
    throw new Error(`working-directory does not exist: ${cwd}`);
  }
  if (!statSync(cwd).isDirectory()) {
    throw new Error(`working-directory is not a directory: ${cwd}`);
  }
  return cwd;
}
