import fs from 'fs';
import path from 'path';
import type { ConfigContext, ExpoConfig } from 'expo/config';

const IOS_FIREBASE = './GoogleService-Info.plist';
const ANDROID_FIREBASE = './google-services.json';
const exists = (p: string) => fs.existsSync(path.join(__dirname, p));

// The RNFirebase config plugin fails prebuild when these files are missing, so
// they are only wired up once you've downloaded them from the Firebase console.
const hasFirebaseFiles = exists(IOS_FIREBASE) && exists(ANDROID_FIREBASE);

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'PoseDirector',
  slug: '8camerapose',
  scheme: 'posedirector',
  version: '0.1.0',
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  ios: {
    bundleIdentifier: 'com.camera.pose',
    supportsTablet: false,
    ...(hasFirebaseFiles ? { googleServicesFile: IOS_FIREBASE } : {}),
  },
  android: {
    package: 'com.camera.pose',
    adaptiveIcon: {
      backgroundColor: '#05080D',
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
    predictiveBackGestureEnabled: false,
    ...(hasFirebaseFiles ? { googleServicesFile: ANDROID_FIREBASE } : {}),
  },
  plugins: [
    'expo-router',
    'expo-secure-store',
    [
      'expo-build-properties',
      {
        ios: { useFrameworks: 'static' },
        android: { minSdkVersion: 26 },
      },
    ],
    [
      'react-native-vision-camera',
      {
        cameraPermissionText: 'PoseDirector needs the camera to guide your pose.',
        enableMicrophonePermission: false,
      },
    ],
    // Copies the MediaPipe model into the native iOS/Android projects on prebuild.
    ['react-native-mediapipe-posedetection', { assetsPaths: ['./assets/models/'] }],
    [
      'expo-media-library',
      {
        photosPermission: 'Allow PoseDirector to access your photos.',
        savePhotosPermission: 'Allow PoseDirector to save your photos.',
        isAccessMediaLocationEnabled: false,
      },
    ],
    './plugins/withFirebaseNoSPM',
    ...(hasFirebaseFiles
      ? ['@react-native-firebase/app', '@react-native-firebase/auth', '@react-native-firebase/crashlytics']
      : []),
  ],
  experiments: { typedRoutes: true },
});
