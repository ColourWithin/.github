import * as core from "@actions/core";

export interface CommandOutputs {
  stdout: string;
  exitCode: number;
  ociCliVersion: string;
}

export function writeCommandOutputs(outputs: CommandOutputs): void {
  core.setOutput("output", outputs.stdout.trim());
  core.setOutput("raw-output", outputs.stdout);
  core.setOutput("exit-code", String(outputs.exitCode));
  core.setOutput("oci-cli-version", outputs.ociCliVersion);
}
