import path from "node:path";

export type SitePackageCommand = {
  args: string[];
  command: string;
  label: string;
};

export function packageRunScriptCommand(
  scriptName: string,
  env: NodeJS.ProcessEnv,
): SitePackageCommand {
  if (packageCommandRunner(env) === "bun") {
    return {
      args: ["run", scriptName],
      command: "bun",
      label: `bun run ${scriptName}`,
    };
  }

  return {
    args: ["run", scriptName],
    command: "npm",
    label: `npm run ${scriptName}`,
  };
}

export function packageExecCommand(
  executable: string,
  args: string[],
  env: NodeJS.ProcessEnv,
): SitePackageCommand {
  if (packageCommandRunner(env) === "bun") {
    return {
      args: ["x", executable, ...args],
      command: "bun",
      label: `bun x ${[executable, ...args].join(" ")}`,
    };
  }

  return {
    args: ["exec", "--", executable, ...args],
    command: "npm",
    label: `npm exec -- ${[executable, ...args].join(" ")}`,
  };
}

function packageCommandRunner(env: NodeJS.ProcessEnv): "bun" | "npm" {
  const userAgent = env.npm_config_user_agent ?? "";
  const execPath = env.npm_execpath ?? "";

  return userAgent.startsWith("bun/") || path.basename(execPath).startsWith("bun") ? "bun" : "npm";
}
