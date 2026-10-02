module.exports = function (api) {
  api.cache(true);
  return {
    // Reanimated/Worklets plugin is disabled on purpose: VisionCamera v4 frame
    // processors run on react-native-worklets-core, and two worklet compilers
    // in one bundle clash. We don't use Reanimated ourselves.
    presets: [['babel-preset-expo', { worklets: false, reanimated: false }]],
    plugins: ['react-native-worklets-core/plugin'],
    env: {
      // The pose library logs on every detection result (~15/s); drop that noise in release builds.
      production: { plugins: [['transform-remove-console', { exclude: ['error', 'warn'] }]] },
    },
  };
};
