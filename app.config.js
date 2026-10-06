/**
 * Dynamic Expo config — reads static app.json and injects env-backed settings.
 * Google Maps Android/iOS key: set EXPO_PUBLIC_GOOGLE_MAPS_API_KEY for EAS/native builds.
 *
 * Note: react-native-maps@1.20.1 (Expo SDK 54 pin) has no app.plugin.js, so the API key
 * is applied via android.config.googleMaps / ios.config.googleMapsApiKey instead of a plugin.
 */
const appJson = require('./app.json');

const googleMapsApiKey = process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY || '';

const expo = appJson.expo || {};

/** @type {import('expo/config').ExpoConfig} */
module.exports = {
  ...expo,
  android: {
    ...(expo.android || {}),
    config: {
      ...((expo.android && expo.android.config) || {}),
      googleMaps: {
        ...((expo.android && expo.android.config && expo.android.config.googleMaps) || {}),
        apiKey: googleMapsApiKey,
      },
    },
  },
  ios: {
    ...(expo.ios || {}),
    config: {
      ...((expo.ios && expo.ios.config) || {}),
      googleMapsApiKey,
    },
  },
  extra: {
    ...(expo.extra || {}),
    eas: {
      ...(((expo.extra && expo.extra.eas) || {})),
      projectId: '317ee9f1-5cca-4af9-8dd6-8d2610e4e03c',
    },
    googleMapsApiKey,
  },
};
