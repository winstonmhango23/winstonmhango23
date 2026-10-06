module.exports = function (api) {
  api.cache(true);
  return {
    // babel-preset-expo auto-wires react-native-worklets/plugin for Reanimated 4.
    // Do NOT also add react-native-reanimated/plugin — duplicate/legacy plugins
    // break worklet transforms and crash release APKs on launch (Expo SDK 54).
    presets: ['babel-preset-expo'],
  };
};
