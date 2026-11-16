import { useEffect, useState } from "react";
import { FuzzyText } from "../../components/GotchaHero";

// The APK is served by Firebase Hosting from website/public/downloads.
// Replace the file and bump APK_VERSION for every new Android build.
const APK_URL = "/downloads/gotcha.apk";
const APK_VERSION = "1.0.0";
// Set to the public TestFlight/App Store link to show it to iPhone visitors.
const IOS_URL: string | null = null;

export function meta() {
  return [
    { title: "Gotcha for Android" },
    { name: "description", content: "Download the Gotcha app for Android." },
  ];
}

type Platform = "android" | "ios" | "desktop" | null;

function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return "android";
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  return "desktop";
}

const steps = [
  {
    title: "Download",
    body: "Tap Download for Android. If Chrome asks whether to keep the file, tap Download anyway.",
  },
  {
    title: "Allow the install",
    body: "Open the file. If Android asks to allow installs from Chrome, tap Settings, switch it on, then go back.",
  },
  {
    title: "Install",
    body: "Tap Install. If Play Protect warns about an unknown app, tap More details, then Install anyway.",
  },
];

function DownloadButton() {
  return (
    <a
      href={APK_URL}
      download="gotcha.apk"
      className="gotcha-glitch-btn flex rounded-md bg-slate-600 hover:bg-slate-700 active:bg-slate-800 items-center justify-center px-6 py-2 gap-2 whitespace-nowrap text-white"
    >
      <svg viewBox="0 0 24 24" className="w-6 h-6 fill-current" aria-hidden="true">
        <path d="M12 3a1 1 0 0 1 1 1v9.59l3.3-3.3a1 1 0 1 1 1.4 1.42l-5 5a1 1 0 0 1-1.4 0l-5-5a1 1 0 1 1 1.4-1.42l3.3 3.3V4a1 1 0 0 1 1-1ZM5 19a1 1 0 1 0 0 2h14a1 1 0 1 0 0-2H5Z" />
      </svg>
      <span className="gotcha-glitch" data-text="Download for Android">
        Download for Android
      </span>
    </a>
  );
}

export default function AndroidDownload() {
  const [platform, setPlatform] = useState<Platform>(null);
  const [pageUrl, setPageUrl] = useState("");

  useEffect(() => {
    setPlatform(detectPlatform());
    setPageUrl(window.location.host + window.location.pathname);
  }, []);

  return (
    <div className="bg-slate-900 text-white">
      <div className="flex min-h-[100svh] flex-col items-center justify-center gap-8 px-4 py-12 text-center">
        <div className="flex flex-col items-center gap-2">
          {/* Home page's fuzzy text effect, sized to this line instead of the window. */}
          <h1 className="sr-only">GOTCHA for Android</h1>
          <div className="aspect-[10/1] w-[min(90vw,48rem)] overflow-hidden" aria-hidden="true">
            <FuzzyText
              fillParent
              className="flex h-full w-full items-center justify-center"
              fontSize="8rem"
              color="#ffff"
              baseIntensity={0.01}
              hoverIntensity={2}
              verticalCoverage={0.9}
              // FuzzyText cancels touchmove on its canvas, which would stop
              // phones from scrolling down to the install steps.
              enableHover={platform === "desktop"}
            >
              GOTCHA FOR ANDROID
            </FuzzyText>
          </div>
          <p className="text-sm text-slate-400">
            brought to you by Programming Club
          </p>
        </div>

        <DownloadButton />

        <a
          href="#install"
          className="text-sm text-slate-500 hover:text-slate-300"
        >
          How to install ↓
        </a>
      </div>

      <div className="mx-auto max-w-3xl px-4 pb-16 pt-8 space-y-6">
        {platform === "ios" && (
          <p className="rounded-md bg-slate-800 p-4 text-sm text-slate-300">
            This is the Android version.{" "}
            {IOS_URL ? (
              <a href={IOS_URL} className="font-bold text-white underline">
                Get Gotcha for iPhone
              </a>
            ) : (
              "iPhone players: check your email for the iPhone link."
            )}
          </p>
        )}
        {platform === "desktop" && pageUrl && (
          <p className="rounded-md bg-slate-800 p-4 text-sm text-slate-300">
            On a computer? Open{" "}
            <span className="font-mono text-white">{pageUrl}</span> on your
            Android phone.
          </p>
        )}

        <section id="install" className="scroll-mt-8">
          <h2 className="text-2xl font-bold">How to install</h2>
          <ol className="mt-4 grid gap-4 sm:grid-cols-3">
            {steps.map((step, i) => (
              <li key={step.title} className="rounded-md bg-slate-800 p-4">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-600 font-bold">
                    {i + 1}
                  </span>
                  <h3 className="font-bold">{step.title}</h3>
                </div>
                <p className="mt-3 text-sm text-slate-400">{step.body}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="rounded-md bg-slate-800 p-4 text-sm text-slate-400 space-y-3">
          <p>
            <span className="font-bold text-white">Why the warnings? </span>
            Android shows them for any app that isn't from the Play Store.
            Gotcha only uses your location while the app is open, to show your
            hunter which building you're in.
          </p>
          <p>
            <span className="font-bold text-white">Updates: </span>
            this version doesn't update itself. If we release a fix, download
            it again from this page. Your account and game progress stay the
            same.
          </p>
        </section>

        <p className="text-xs text-slate-500">Version {APK_VERSION}</p>
      </div>

      <style>{`
        /* Light RGB-split glitch on the download button label. */
        .gotcha-glitch { position: relative; display: inline-block; }
        .gotcha-glitch::before, .gotcha-glitch::after {
          content: attr(data-text); position: absolute; inset: 0; opacity: 0; pointer-events: none;
        }
        .gotcha-glitch::before { color: rgba(248,113,113,0.8); animation: gotcha-glitch-a 4s infinite steps(1); }
        .gotcha-glitch::after { color: rgba(103,232,249,0.8); animation: gotcha-glitch-b 4s infinite steps(1); }
        .gotcha-glitch-btn:hover .gotcha-glitch::before,
        .gotcha-glitch-btn:hover .gotcha-glitch::after { animation-duration: 1.2s; }
        @keyframes gotcha-glitch-a {
          0%, 90%, 100% { opacity: 0; transform: none; clip-path: none; }
          91% { opacity: 1; transform: translate(-0.06em, 0); clip-path: inset(0 0 55% 0); }
          93% { opacity: 1; transform: translate(0.06em, 0); clip-path: inset(60% 0 0 0); }
          95% { opacity: 0; }
        }
        @keyframes gotcha-glitch-b {
          0%, 91%, 100% { opacity: 0; transform: none; clip-path: none; }
          92% { opacity: 1; transform: translate(0.06em, 0); clip-path: inset(45% 0 20% 0); }
          94% { opacity: 1; transform: translate(-0.03em, 0); clip-path: inset(0 0 70% 0); }
          96% { opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .gotcha-glitch::before, .gotcha-glitch::after { animation: none; }
        }
      `}</style>
    </div>
  );
}
