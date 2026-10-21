import { ScrollViewStyleReset } from 'expo-router/html';
import type { PropsWithChildren } from 'react';

import { t } from '@/i18n';
import { SITE_ORIGIN } from '@/lib/site';
import { colors } from '@/theme/tokens';

/**
 * THE PAGE AROUND THE APP on the web: the <html> of every pre-rendered page
 * (web output "static"). It runs once per page while the build is made, in
 * Node - no browser, no window - and in English, the build's language.
 *
 * Expo's own version of this file is the first four tags of <head>. What is
 * added is what a browser, a search engine and a chat app read before any
 * script has run:
 *
 *  - the manifest, the theme colour and the home-screen icon, which make the
 *    web app installable on a computer or a phone (lib/install.web.ts);
 *  - what a shared link and a search result show: the picture
 *    (public/og-image.png, drawn by tools/brand/make-icons.mjs), the name and
 *    one sentence, and the same said to a search engine as structured data.
 *
 * The description meta itself is the root layout's, in Head, where it
 * follows the language the person chose.
 */
export default function Root({ children }: PropsWithChildren) {
  const description = t('seo.description');
  // A preview needs the picture's full address, which only a public build
  // knows (lib/site.ts). The LAN build names it relatively.
  const image = `${SITE_ORIGIN}/og-image.png`;
  const structured = {
    '@context': 'https://schema.org',
    '@type': 'WebApplication',
    name: 'FamStory',
    description,
    ...(SITE_ORIGIN ? { url: `${SITE_ORIGIN}/`, image } : null),
    applicationCategory: 'LifestyleApplication',
    operatingSystem: 'Web, Windows, macOS, Android, iOS',
    browserRequirements: 'Requires JavaScript.',
    // The free plan: the app costs nothing to start with.
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
  };

  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no" />
        {/* The screens scroll themselves, as on a phone; the page does not. */}
        <ScrollViewStyleReset />
        {/* Reduced motion before any script has read it: the welcome screen's
            mark and lines are CSS animations that start with the first paint
            (components/ui/logo-mark.tsx), so the page itself has to stop them. */}
        <style dangerouslySetInnerHTML={{ __html: REDUCED_MOTION }} />

        {/* The ground before the first paint. See GROUND. */}
        <style dangerouslySetInnerHTML={{ __html: GROUND }} />
        <script dangerouslySetInnerHTML={{ __html: HOLD_APPEARANCE }} />

        {/* The language before the first paint. See HOLD_FOR_LANGUAGE. */}
        <style dangerouslySetInnerHTML={{ __html: LANGUAGE_PENDING }} />
        <script dangerouslySetInnerHTML={{ __html: HOLD_FOR_LANGUAGE }} />

        {/* The first script on the page. See HOLD_INSTALL_OFFER. */}
        <script dangerouslySetInnerHTML={{ __html: HOLD_INSTALL_OFFER }} />

        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="theme-color" content={colors.light.primary} />
        <meta name="application-name" content="FamStory" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-title" content="FamStory" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />

        <meta property="og:type" content="website" />
        <meta property="og:site_name" content="FamStory" />
        <meta property="og:title" content="FamStory" />
        <meta property="og:description" content={description} />
        <meta property="og:image" content={image} />
        <meta property="og:image:width" content="1200" />
        <meta property="og:image:height" content="630" />
        <meta property="og:image:alt" content={t('auth.heroTitle')} />
        {SITE_ORIGIN ? <meta property="og:url" content={`${SITE_ORIGIN}/`} /> : null}
        <meta name="twitter:card" content="summary_large_image" />

        <script
          type="application/ld+json"
          // `<` escaped, so no sentence can close the tag it sits in.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structured).replace(/</g, '\\u003c') }}
        />
      </head>
      <body>{children}</body>
    </html>
  );
}

/**
 * The browser's offer to install can arrive before the app's script has run -
 * on a second visit it often does - and an offer nobody listened for is gone
 * until the next page load. So the page's first script holds it for
 * lib/install.web.ts.
 */
const REDUCED_MOTION =
  '@media (prefers-reduced-motion: reduce){*,*::before,*::after{animation-duration:1ms!important;animation-delay:0ms!important;animation-iteration-count:1!important}}';

/**
 * Until the app has drawn - a second or more on a cold load, longer while a
 * chosen language holds the page (LANGUAGE_PENDING) - what shows is the page
 * itself, and a browser's page is white: a white flash for everybody in dark
 * mode. So the page is the app's own ground from the first paint: Paper, or
 * the dark ground when the device is dark - or when the person chose it in
 * the app (data/appearance.ts keeps that in localStorage, read here before
 * anything is drawn).
 */
const GROUND =
  `html,body{background:${colors.light.background}}` +
  `@media (prefers-color-scheme: dark){html,body{background:${colors.dark.background}}}` +
  `html[data-appearance=light],html[data-appearance=light] body{background:${colors.light.background}}` +
  `html[data-appearance=dark],html[data-appearance=dark] body{background:${colors.dark.background}}`;

const HOLD_APPEARANCE =
  "try{var p=JSON.parse(localStorage.getItem('famstory.appearance')||'{}').preference;if(p==='light'||p==='dark')document.documentElement.setAttribute('data-appearance',p)}catch(e){}";

/**
 * A page drawn in English and then again in Latvian is a page that looks
 * broken (the owner, 2026-10-01: "it shows Latvian as English"). The
 * pre-rendered HTML is English - it is made at build time, in the build's
 * language - and a chosen Latvian arrives only once the app has hydrated
 * (data/locale.ts says why it cannot be sooner): a second or more of English,
 * and the welcome page's opening played twice. So for somebody who chose
 * another language the page waits out of sight - its ground only - until the
 * root layout has drawn it in theirs (app/_layout.tsx); never longer than
 * three seconds. A search engine has no stored choice, and reads the page.
 */
const LANGUAGE_PENDING = 'html[data-locale-pending] #root{visibility:hidden}';

const HOLD_FOR_LANGUAGE =
  "try{var l=JSON.parse(localStorage.getItem('famstory.locale')||'{}').locale;if(l&&l!=='en'){var d=document.documentElement;d.setAttribute('data-locale-pending',l);setTimeout(function(){d.removeAttribute('data-locale-pending')},3000)}}catch(e){}";

const HOLD_INSTALL_OFFER =
  "addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.__famstoryInstallOffer=e;});";
