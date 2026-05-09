export interface CommandOutputs {
  stdout: string;
  exitCode: number;
  ociCliVersion: string;
}

export function writeCommandOutputs(_outputs: CommandOutputs): void {
  throw new Error("writeCommandOutputs is not implemented yet");
}
