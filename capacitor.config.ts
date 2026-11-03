import type { CapacitorConfig } from '@capacitor/cli';

// The phone app (ios/): a native shell around the live site, so accounts, games and the server are the
// same as on the web and nothing changes on the server. `webDir` is required, but while `server.url` is
// set the app loads the site instead. Steps for building on a Mac: docs/mobile.md.
const config: CapacitorConfig = {
  appId: 'app.ultrachess',
  appName: 'Ultrachess',
  webDir: 'dist',
  backgroundColor: '#0c1120',
  server: { url: 'https://ultrachess.app' },
  ios: { contentInset: 'never' },
  plugins: {
    SplashScreen: { launchShowDuration: 600, backgroundColor: '#0c1120', showSpinner: false },
    // Light text over the dark page.
    StatusBar: { style: 'DARK' },
  },
};

export default config;
