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

export function parseCommand(_options: ParseCommandOptions): ParsedCommand {
  throw new Error("parseCommand is not implemented yet");
}
