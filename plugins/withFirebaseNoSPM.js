// react-native-firebase 26 resolves Firebase through Swift Package Manager by default. That
// collides with `useFrameworks: 'static'` (required by VisionCamera / MediaPipe pods), so force
// CocoaPods. The official @react-native-firebase/app plugin has the same option, but it also
// demands GoogleService-Info.plist at prebuild time; this keeps prebuild working before the
// Firebase project exists. Uses the same tag, so both plugins together stay idempotent.
const { withPodfile } = require('@expo/config-plugins');
const { mergeContents } = require('@expo/config-plugins/build/utils/generateCode');

module.exports = (config) =>
  withPodfile(config, (c) => {
    c.modResults.contents = mergeContents({
      src: c.modResults.contents,
      newSrc: '$RNFirebaseDisableSPM = true',
      tag: '@react-native-firebase/app-disableSPM',
      anchor: /prepare_react_native_project!/,
      offset: 1,
      comment: '#',
    }).contents;
    return c;
  });
