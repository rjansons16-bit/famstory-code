/**
 * THE APP'S CONFIGURATION: app.json, plus what a JSON file cannot hold - the
 * site the app's links live on, and the rules a store build must pass
 * (docs/09-APP-STORES.md, docs/12-LAUNCH-RUNBOOK.md).
 *
 * THE SITE. With EXPO_PUBLIC_SITE_ORIGIN set (https://famstory.lv), an
 * invitation or a password reset link on that site opens the app when it is
 * installed: associated domains on iOS, verified app links on Android. The
 * site answers for it with /.well-known/apple-app-site-association and
 * /.well-known/assetlinks.json (tools/deploy/Caddyfile), and the paths here
 * and there have to match.
 *
 * A production build stops here, instead of shipping, when:
 *
 *   - there is no https API address. Without one the app runs on its sample
 *     family (data/backend.ts). That is right for the demo, and a disaster
 *     in the App Store: nothing anybody made would be kept, and nothing on
 *     screen would say so;
 *   - there is no https site: invitations would be links nobody without the
 *     app can open;
 *   - there is no RevenueCat key for the platform: the paywall would sell
 *     nothing (lib/purchases.ts);
 *   - an Android build has no google-services.json: the phone would never
 *     have a push token (lib/push.ts);
 *   - there is no support address (lib/contact.ts). The terms send reports
 *     and disputes there, and App Review asks for it (guideline 1.2);
 *   - the privacy policy or the terms still has a blank in it - the company's
 *     own details, which only exist once the company does
 *     (src/legal/texts.generated.json, from docs/legal/).
 */
const { existsSync } = require('node:fs');
const { join } = require('node:path');

const legal = require('./src/legal/texts.generated.json');

/**
 * Pushes (src/lib/push.ts). The small icon Android draws in the status bar is
 * the mark in white - the themed icon's own picture - tinted Evergreen in the
 * shade. TestFlight, the App Store and an internal Android build all use the
 * production push servers; only a development build uses Apple's sandbox.
 */
const PUSH_PLUGIN = [
  'expo-notifications',
  {
    icon: './assets/images/android-icon-monochrome.png',
    color: '#234E42',
    mode: process.env.EAS_BUILD_PROFILE === 'development' ? 'development' : 'production',
  },
];

/**
 * Firebase's google-services.json, which Android needs to have a push token
 * at all: an EAS file variable (GOOGLE_SERVICES_JSON is then its path on the
 * build machine), or the file beside this one for a local build. Never in
 * git (.gitignore).
 */
function googleServicesFile() {
  const fromEas = (process.env.GOOGLE_SERVICES_JSON ?? '').trim();
  if (fromEas) return fromEas;
  return existsSync(join(__dirname, 'google-services.json')) ? './google-services.json' : null;
}

/** The paths on the site that are the app's own. Guest links stay in the browser: they are for people without it. */
const APP_PATHS = ['/join', '/reset'];

/** "famstory.lv", from EXPO_PUBLIC_SITE_ORIGIN; null without an https site. */
function siteHost() {
  const origin = (process.env.EXPO_PUBLIC_SITE_ORIGIN ?? '').trim().replace(/\/+$/, '');
  const match = /^https:\/\/([a-z0-9.-]+)$/i.exec(origin);
  return match ? match[1].toLowerCase() : null;
}

const REVENUECAT_KEYS = {
  ios: 'EXPO_PUBLIC_REVENUECAT_APPLE_KEY',
  android: 'EXPO_PUBLIC_REVENUECAT_GOOGLE_KEY',
};

module.exports = ({ config }) => {
  // A dev session for the phones alone (Expo Go): FAMSTORY_NATIVE_ONLY=1.
  // With web on, any browser asking the port - the preview pane checking it is
  // up - sets Metro rendering the web app for minutes, and the phone's request
  // for its manifest waits behind that until Expo Go gives up on the server.
  if (process.env.FAMSTORY_NATIVE_ONLY === '1') config = { ...config, platforms: ['ios', 'android'] };

  config = { ...config, plugins: [...(config.plugins ?? []), PUSH_PLUGIN] };
  const googleServices = googleServicesFile();
  if (googleServices) config = { ...config, android: { ...config.android, googleServicesFile: googleServices } };

  const host = siteHost();
  if (host) {
    config = {
      ...config,
      ios: {
        ...config.ios,
        // webcredentials: a password saved for the site in Safari is offered
        // in the app's sign-in, and the other way round.
        associatedDomains: [`applinks:${host}`, `webcredentials:${host}`],
      },
      android: {
        ...config.android,
        intentFilters: [
          {
            action: 'VIEW',
            autoVerify: true,
            data: APP_PATHS.map((pathPrefix) => ({ scheme: 'https', host, pathPrefix })),
            category: ['BROWSABLE', 'DEFAULT'],
          },
        ],
      },
    };
  }

  if (process.env.EAS_BUILD_PROFILE !== 'production') return config;

  const problems = [];
  const api = (process.env.EXPO_PUBLIC_API_URL ?? '').trim();
  if (!api.startsWith('https://')) {
    problems.push("EXPO_PUBLIC_API_URL must be the API's https address (eas.json, build.production.env)");
  }
  if (!host) {
    problems.push('EXPO_PUBLIC_SITE_ORIGIN must be the https site the links open, with no path (https://famstory.lv)');
  }
  if (!(process.env.EXPO_PUBLIC_SUPPORT_EMAIL ?? '').includes('@')) {
    problems.push('EXPO_PUBLIC_SUPPORT_EMAIL must be the address people write to');
  }
  // EAS says which platform it is building; without it, both must be there.
  const platform = process.env.EAS_BUILD_PLATFORM;
  for (const [name, variable] of Object.entries(REVENUECAT_KEYS)) {
    if (platform && platform !== name) continue;
    if (!(process.env[variable] ?? '').trim()) {
      problems.push(`${variable} must be RevenueCat's public ${name} key (RevenueCat, Project settings, API keys)`);
    }
  }
  if ((!platform || platform === 'android') && !googleServices) {
    problems.push(
      "GOOGLE_SERVICES_JSON must be Firebase's google-services.json, as an EAS file variable - without it an Android phone gets no pushes",
    );
  }
  for (const [doc, locales] of Object.entries(legal)) {
    for (const [locale, text] of Object.entries(locales)) {
      if (text.placeholders.length > 0) {
        problems.push(
          `docs/legal ${doc} (${locale}) still has ${text.placeholders.length} blanks: ${text.placeholders.join(' ')}` +
            ' - fill docs/legal/facts.json and run npm run legal',
        );
      }
    }
  }
  if (problems.length > 0) throw new Error(`Not a store build yet:\n- ${problems.join('\n- ')}`);
  return config;
};
