import * as core from "@actions/core";
import * as exec from "@actions/exec";
import { parseCommand } from "./command";
import { ensureOciCli } from "./install";
import { writeCommandOutputs } from "./outputs";

export async function run(): Promise<void> {
  try {
    const command = core.getInput("command", { required: true });
    const silent = core.getBooleanInput("silent");
    const query = core.getInput("query");
    const workingDirectory = core.getInput("working-directory") || process.env.GITHUB_WORKSPACE || process.cwd();

    core.info("Checking OCI CLI version");
    const ociCliVersion = await ensureOciCli();
    core.info(`OCI CLI ${ociCliVersion} is available`);

    const parsed = parseCommand({
      command,
      query,
      workingDirectory,
      githubWorkspace: process.env.GITHUB_WORKSPACE
    });

    if (!silent) {
      core.info(`Running: ${parsed.display}`);
      core.info(`Working directory: ${parsed.cwd}`);
    } else {
      core.info("Running OCI CLI command");
    }

    let stdout = "";
    const exitCode = await exec.exec("oci", parsed.args, {
      cwd: parsed.cwd,
      ignoreReturnCode: true,
      listeners: {
        stdout: (data: Buffer) => {
          const chunk = data.toString("utf8");
          stdout += chunk;
        }
      }
    });

    writeCommandOutputs({ stdout, exitCode, ociCliVersion });
    core.info(`OCI CLI exited with code ${exitCode}`);

    if (exitCode !== 0) {
      core.setFailed(`OCI CLI command failed with exit code ${exitCode}`);
    }
  } catch (error) {
    core.setFailed(error instanceof Error ? error : String(error));
  }
}

if (require.main === module) {
  void run();
}
