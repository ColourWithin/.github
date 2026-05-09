import { beforeEach, describe, expect, it, vi } from "vitest";

const outputs = new Map<string, string>();
const infos: string[] = [];
let failed = "";
let inputs = new Map<string, string>();

vi.mock("@actions/core", () => ({
  getInput: vi.fn((name: string, opts?: { required?: boolean }) => {
    const value = inputs.get(name) ?? "";
    if (opts?.required && value === "") {
      throw new Error(`Input required and not supplied: ${name}`);
    }
    return value;
  }),
  getBooleanInput: vi.fn((name: string) => (inputs.get(name) ?? "false") === "true"),
  setOutput: vi.fn((name: string, value: string) => outputs.set(name, value)),
  setFailed: vi.fn((message: string | Error) => {
    failed = message instanceof Error ? message.message : message;
  }),
  info: vi.fn((message: string) => infos.push(message)),
  addPath: vi.fn()
}));

vi.mock("@actions/exec", () => ({
  exec: vi.fn(async (_tool: string, _args: string[], options: { listeners?: { stdout?: (data: Buffer) => void; stderr?: (data: Buffer) => void } }) => {
    options.listeners?.stdout?.(Buffer.from("  value\n"));
    options.listeners?.stderr?.(Buffer.from("diagnostic\n"));
    return 0;
  })
}));

vi.mock("../src/install", () => ({
  ensureOciCli: vi.fn(async () => "3.81.1")
}));

describe("run", () => {
  beforeEach(() => {
    outputs.clear();
    infos.length = 0;
    failed = "";
    inputs = new Map([
      ["command", "oci iam region list"],
      ["silent", "false"],
      ["query", ""],
      ["working-directory", process.cwd()]
    ]);
    vi.resetModules();
  });

  it("sets trimmed, raw, exit-code, and oci-cli-version outputs", async () => {
    const { run } = await import("../src/index");
    await run();
    expect(outputs.get("output")).toBe("value");
    expect(outputs.get("raw-output")).toBe("  value\n");
    expect(outputs.get("exit-code")).toBe("0");
    expect(outputs.get("oci-cli-version")).toBe("3.81.1");
    expect(failed).toBe("");
  });

  it("hides command summary when silent is true", async () => {
    inputs.set("silent", "true");
    const { run } = await import("../src/index");
    await run();
    expect(infos.join("\n")).not.toContain("iam region list");
  });

  it("sets all outputs before failing on a non-zero OCI exit", async () => {
    const execModule = await import("@actions/exec");
    vi.mocked(execModule.exec).mockImplementationOnce(async (_tool, _args, options = {}) => {
      options.listeners?.stdout?.(Buffer.from("  value\n"));
      options.listeners?.stderr?.(Buffer.from("diagnostic\n"));
      return 7;
    });
    const { run } = await import("../src/index");
    await run();
    expect(outputs.get("output")).toBe("value");
    expect(outputs.get("raw-output")).toBe("  value\n");
    expect(outputs.get("exit-code")).toBe("7");
    expect(outputs.get("oci-cli-version")).toBe("3.81.1");
    expect(failed).toContain("exit code 7");
  });
});
