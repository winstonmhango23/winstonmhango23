/**
 * Windows-safe Expo start: polling watcher + offline (skips Expo API body-read crash).
 * Other platforms: plain `expo start` with passthrough args.
 */
const { spawn } = require("child_process");
const path = require("path");

const isWin = process.platform === "win32";
const args = process.argv.slice(2);
const expoCli = require.resolve("expo/bin/cli");

const env = { ...process.env };
if (!env.EXPO_PUBLIC_EXPO_GO_COMPAT) {
  env.EXPO_PUBLIC_EXPO_GO_COMPAT = "true";
}
if (isWin) {
  env.CHOKIDAR_USEPOLLING = env.CHOKIDAR_USEPOLLING || "1";
  env.CHOKIDAR_INTERVAL = env.CHOKIDAR_INTERVAL || "1000";
  env.EXPO_NO_TELEMETRY = env.EXPO_NO_TELEMETRY || "1";
  env.EXPO_OFFLINE = env.EXPO_OFFLINE || "1";
}

const finalArgs = ["start", ...args];
if (isWin && !finalArgs.includes("--offline")) {
  finalArgs.push("--offline");
}

const child = spawn(process.execPath, [expoCli, ...finalArgs], {
  cwd: path.join(__dirname, ".."),
  env,
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
