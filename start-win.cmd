@echo off
set CHOKIDAR_USEPOLLING=1
set CHOKIDAR_INTERVAL=1000
set EXPO_NO_TELEMETRY=1
set EXPO_OFFLINE=1
pnpm exec expo start --offline --clear %*
