// App Check's native module initialises Firebase eagerly at app start and crashes when the app
// has no Firebase project yet (google-services.json missing). Only link it once Firebase is set up.
const fs = require('fs');
const path = require('path');

const hasFirebase = fs.existsSync(path.join(__dirname, 'google-services.json'));

module.exports = {
  dependencies: hasFirebase ? {} : { '@react-native-firebase/app-check': { platforms: { android: null, ios: null } } },
};
