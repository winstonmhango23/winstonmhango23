const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

// Must run before Metro constructs its file watcher. Native FS watchers
// hang on this Windows path (spaces in "COFI PROJECTS" / "TRADELINE GIT PROJECTS")
// and trip "Failed to start watch mode." Polling avoids that for any start command
// (npx expo start, pnpm start, start:win).
if (process.platform === "win32") {
  process.env.CHOKIDAR_USEPOLLING = process.env.CHOKIDAR_USEPOLLING || "1";
  process.env.CHOKIDAR_INTERVAL = process.env.CHOKIDAR_INTERVAL || "1000";
  // Skip Expo doctor network calls that can crash with "Body has already been read".
  process.env.EXPO_NO_TELEMETRY = process.env.EXPO_NO_TELEMETRY || "1";
}

/** @type {import("expo/metro-config").MetroConfig} */
const config = getDefaultConfig(__dirname);

// Never put a bare `dist` segment in blockList — packages like whatwg-fetch and
// @radix-ui/* ship real entry files under node_modules/.../dist/ and EAS Metro
// will fail with "main module field that could not be resolved".
const heavyPathIgnore =
  /(^|[\\/])(graphify-out|\.git|\.expo|web-build|coverage|\.pytest_cache)([\\/]|$)/;

// Project-root build output only (not node_modules/*/dist).
const projectDistIgnore = new RegExp(
  `^${path
    .resolve(__dirname, "dist")
    .replace(/[/\\]/g, "[/\\\\]")}([/\\\\]|$)`
);

config.watcher = {
  ...config.watcher,
  watchman: false,
  // Health-check cookie writes also time out on broken native watchers.
  healthCheck: {
    enabled: false,
  },
  // Keep Metro from crawling huge generated trees (common Windows watch-mode failure).
  additionalExts: config.watcher?.additionalExts,
  ignored: [heavyPathIgnore, projectDistIgnore],
};

// pnpm's .pnpm store has massive symlink trees that hang the FallbackWatcher on
// Windows. Do NOT block .pnpm on Linux - EAS Build uses pnpm and Metro must
// resolve expo-router/entry through the store (see node-linker=hoisted).
if (!Array.isArray(config.resolver.blockList)) {
  config.resolver.blockList = [config.resolver.blockList].filter(Boolean);
}
config.resolver.blockList.push(heavyPathIgnore);
config.resolver.blockList.push(projectDistIgnore);
if (process.platform === "win32") {
  config.resolver.blockList.push(/node_modules[/\\]\.pnpm[/\\]/);
}

// Expo Go (SDK 53+) crashes if the real expo-notifications module is bundled on Android.
// Set EXPO_PUBLIC_EXPO_GO_COMPAT=false in EAS builds that need push notifications.
const useExpoGoCompat =
  process.env.EXPO_PUBLIC_EXPO_GO_COMPAT !== "false";
const expoNotificationsStub = path.resolve(
  __dirname,
  "lib/stubs/expo-notifications.ts"
);
const expoSecureStoreStub = path.resolve(
  __dirname,
  "lib/stubs/expo-secure-store.ts"
);
const defaultResolveRequest = config.resolver.resolveRequest;

config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (useExpoGoCompat && moduleName === "expo-notifications") {
    return {
      filePath: expoNotificationsStub,
      type: "sourceFile",
    };
  }
  if (useExpoGoCompat && moduleName === "expo-secure-store") {
    return {
      filePath: expoSecureStoreStub,
      type: "sourceFile",
    };
  }
  if (typeof defaultResolveRequest === "function") {
    return defaultResolveRequest(context, moduleName, platform);
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
