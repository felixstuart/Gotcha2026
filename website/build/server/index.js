import { jsx, jsxs, Fragment } from "react/jsx-runtime";
import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import { ServerRouter, UNSAFE_withComponentProps, Outlet, UNSAFE_withErrorBoundaryProps, isRouteErrorResponse, Meta, Links, ScrollRestoration, Scripts, useNavigate, NavLink, UNSAFE_withHydrateFallbackProps, redirect, useLocation } from "react-router";
import { isbot } from "isbot";
import { renderToPipeableStream } from "react-dom/server";
import React, { useRef, useEffect, useState } from "react";
import { getAuth, setPersistence, browserLocalPersistence, signInWithPopup, GoogleAuthProvider, onAuthStateChanged } from "firebase/auth";
import { initializeApp } from "firebase/app";
import "firebase/analytics";
import { getRemoteConfig, fetchAndActivate, getValue } from "firebase/remote-config";
import "firebase/auth/web-extension";
import "firebase/firestore";
import { getFunctions, httpsCallable } from "firebase/functions";
import { motion, useMotionValue, useTransform, AnimatePresence, animate } from "framer-motion";
const streamTimeout = 5e3;
function handleRequest(request, responseStatusCode, responseHeaders, routerContext, loadContext) {
  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders
    });
  }
  return new Promise((resolve, reject) => {
    let shellRendered = false;
    let userAgent = request.headers.get("user-agent");
    let readyOption = userAgent && isbot(userAgent) || routerContext.isSpaMode ? "onAllReady" : "onShellReady";
    let timeoutId = setTimeout(
      () => abort(),
      streamTimeout + 1e3
    );
    const { pipe, abort } = renderToPipeableStream(
      /* @__PURE__ */ jsx(ServerRouter, { context: routerContext, url: request.url }),
      {
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            final(callback) {
              clearTimeout(timeoutId);
              timeoutId = void 0;
              callback();
            }
          });
          const stream = createReadableStreamFromReadable(body);
          responseHeaders.set("Content-Type", "text/html");
          pipe(body);
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode
            })
          );
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        }
      }
    );
  });
}
const entryServer = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: handleRequest,
  streamTimeout
}, Symbol.toStringTag, { value: "Module" }));
const links = () => [{
  rel: "preconnect",
  href: "https://fonts.googleapis.com"
}, {
  rel: "preconnect",
  href: "https://fonts.gstatic.com",
  crossOrigin: "anonymous"
}, {
  rel: "stylesheet",
  href: "https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&display=swap"
}];
function Layout$1({
  children
}) {
  return /* @__PURE__ */ jsxs("html", {
    lang: "en",
    children: [/* @__PURE__ */ jsxs("head", {
      children: [/* @__PURE__ */ jsx("meta", {
        charSet: "utf-8"
      }), /* @__PURE__ */ jsx("meta", {
        name: "viewport",
        content: "width=device-width, initial-scale=1"
      }), /* @__PURE__ */ jsx(Meta, {}), /* @__PURE__ */ jsx(Links, {})]
    }), /* @__PURE__ */ jsxs("body", {
      children: [children, /* @__PURE__ */ jsx(ScrollRestoration, {}), /* @__PURE__ */ jsx(Scripts, {})]
    })]
  });
}
const root = UNSAFE_withComponentProps(function App() {
  return /* @__PURE__ */ jsx(Outlet, {});
});
const ErrorBoundary$1 = UNSAFE_withErrorBoundaryProps(function ErrorBoundary2({
  error
}) {
  let message = "Oops!";
  let details = "An unexpected error occurred.";
  let stack;
  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details = error.status === 404 ? "The requested page could not be found." : error.statusText || details;
  }
  return /* @__PURE__ */ jsxs("main", {
    className: "pt-16 p-4 container mx-auto",
    children: [/* @__PURE__ */ jsx("h1", {
      children: message
    }), /* @__PURE__ */ jsx("p", {
      children: details
    }), stack]
  });
});
function meta({}) {
  return [{
    title: "Gotcha"
  }];
}
const route0 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ErrorBoundary: ErrorBoundary$1,
  Layout: Layout$1,
  default: root,
  links,
  meta
}, Symbol.toStringTag, { value: "Module" }));
const FuzzyText = ({
  children,
  fontSize = "clamp(2rem, 8vw, 8rem)",
  fontWeight = 900,
  fontFamily = "inherit",
  color = "#fff",
  enableHover = true,
  baseIntensity = 0.18,
  hoverIntensity = 0.5,
  verticalCoverage = 0.9,
  ...divProps
}) => {
  const canvasRef = useRef(null);
  useEffect(() => {
    let animationFrameId;
    let isCancelled = false;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const init = async () => {
      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      if (isCancelled) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const computedFontFamily = fontFamily === "inherit" ? window.getComputedStyle(canvas).fontFamily || "sans-serif" : fontFamily;
      const fontSizeStr = typeof fontSize === "number" ? `${fontSize}px` : fontSize;
      let numericFontSize;
      if (typeof fontSize === "number") {
        numericFontSize = fontSize;
      } else {
        const temp = document.createElement("span");
        temp.style.fontSize = fontSize;
        document.body.appendChild(temp);
        const computedSize = window.getComputedStyle(temp).fontSize;
        numericFontSize = parseFloat(computedSize);
        document.body.removeChild(temp);
      }
      const text = React.Children.toArray(children).join("");
      const offscreen = document.createElement("canvas");
      const offCtx = offscreen.getContext("2d");
      if (!offCtx) return;
      offCtx.font = `${fontWeight} ${fontSizeStr} ${computedFontFamily}`;
      offCtx.textBaseline = "alphabetic";
      const metrics = offCtx.measureText(text);
      const actualLeft = metrics.actualBoundingBoxLeft ?? 0;
      const actualRight = metrics.actualBoundingBoxRight ?? metrics.width;
      const actualAscent = metrics.actualBoundingBoxAscent ?? numericFontSize;
      const actualDescent = metrics.actualBoundingBoxDescent ?? numericFontSize * 0.2;
      const textBoundingWidth = Math.ceil(actualLeft + actualRight);
      const tightHeight = Math.ceil(actualAscent + actualDescent);
      const extraWidthBuffer = 10;
      const offscreenWidth = textBoundingWidth + extraWidthBuffer;
      offscreen.width = offscreenWidth;
      offscreen.height = tightHeight;
      const xOffset = extraWidthBuffer / 2;
      offCtx.font = `${fontWeight} ${fontSizeStr} ${computedFontFamily}`;
      offCtx.textBaseline = "alphabetic";
      offCtx.fillStyle = color;
      offCtx.fillText(text, xOffset - actualLeft, actualAscent);
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
      canvas.width = screenWidth;
      canvas.height = screenHeight;
      const targetHeight = screenHeight * verticalCoverage;
      const verticalPadding = (screenHeight - targetHeight) / 2;
      const verticalStretchRatio = targetHeight / tightHeight;
      const interactiveLeft = 0;
      const interactiveTop = 0;
      const interactiveRight = screenWidth;
      const interactiveBottom = screenHeight;
      let isHovering = false;
      const fuzzRange = 30;
      const run = () => {
        if (isCancelled) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const intensity = isHovering ? hoverIntensity : baseIntensity;
        for (let j = 0; j < tightHeight; j++) {
          const dx = Math.floor(intensity * (Math.random() - 0.5) * fuzzRange);
          const destY = verticalPadding + j * verticalStretchRatio;
          const destHeight = verticalStretchRatio;
          ctx.drawImage(
            offscreen,
            0,
            j,
            offscreenWidth,
            1,
            // source
            dx,
            destY,
            screenWidth,
            destHeight
            // destination - stretched horizontally too
          );
        }
        animationFrameId = window.requestAnimationFrame(run);
      };
      run();
      const isInsideTextArea = (x, y) => x >= interactiveLeft && x <= interactiveRight && y >= interactiveTop && y <= interactiveBottom;
      const handleMouseMove = (e) => {
        if (!enableHover) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        isHovering = isInsideTextArea(x, y);
      };
      const handleMouseLeave = () => {
        isHovering = false;
      };
      const handleTouchMove = (e) => {
        if (!enableHover) return;
        e.preventDefault();
        const rect = canvas.getBoundingClientRect();
        const touch = e.touches[0];
        const x = touch.clientX - rect.left;
        const y = touch.clientY - rect.top;
        isHovering = isInsideTextArea(x, y);
      };
      const handleTouchEnd = () => {
        isHovering = false;
      };
      const handleResize = () => {
        init();
      };
      if (enableHover) {
        canvas.addEventListener("mousemove", handleMouseMove);
        canvas.addEventListener("mouseleave", handleMouseLeave);
        canvas.addEventListener("touchmove", handleTouchMove, {
          passive: false
        });
        canvas.addEventListener("touchend", handleTouchEnd);
      }
      window.addEventListener("resize", handleResize);
      const cleanup = () => {
        window.cancelAnimationFrame(animationFrameId);
        window.removeEventListener("resize", handleResize);
        if (enableHover) {
          canvas.removeEventListener("mousemove", handleMouseMove);
          canvas.removeEventListener("mouseleave", handleMouseLeave);
          canvas.removeEventListener("touchmove", handleTouchMove);
          canvas.removeEventListener("touchend", handleTouchEnd);
        }
      };
      canvas.cleanupFuzzyText = cleanup;
    };
    init();
    return () => {
      isCancelled = true;
      window.cancelAnimationFrame(animationFrameId);
      if (canvas && canvas.cleanupFuzzyText) {
        canvas.cleanupFuzzyText();
      }
    };
  }, [
    children,
    fontSize,
    fontWeight,
    fontFamily,
    color,
    enableHover,
    baseIntensity,
    hoverIntensity,
    verticalCoverage
  ]);
  return /* @__PURE__ */ jsx(
    "div",
    {
      className: "w-screen h-screen flex items-center justify-center bg-inherit",
      ...divProps,
      children: /* @__PURE__ */ jsx("canvas", { ref: canvasRef })
    }
  );
};
const GoogleLogo = "/assets/google-logo-DcoS_MPT.png";
const firebaseConfig = {
  apiKey: "AIzaSyC35OSKmGGTL1l_T_lH_rjrhx6gUB1vkWY",
  authDomain: "felixs-gotcha-tes.firebaseapp.com",
  databaseURL: "https://felixs-gotcha-tes-default-rtdb.firebaseio.com",
  projectId: "felixs-gotcha-tes",
  storageBucket: "felixs-gotcha-tes.firebasestorage.app",
  messagingSenderId: "680586060563",
  appId: "1:680586060563:web:08b57c8124c29996c970e6",
  measurementId: "G-1S2HPGK9SK"
};
const app = initializeApp(firebaseConfig);
const remoteConfig = getRemoteConfig(app);
const auth = getAuth(app);
const functions = getFunctions(app, "us-central1");
const home = UNSAFE_withComponentProps(function Home() {
  const navigate = useNavigate();
  const signInWithGoogle = async () => {
    setPersistence(auth, browserLocalPersistence).then(() => {
      console.log("Persistence set to local");
    }).catch((err) => {
      console.error("Error setting persistence:", err);
    });
    try {
      await signInWithPopup(auth, new GoogleAuthProvider());
      navigate("/app/profile");
    } catch (error) {
      console.log(error);
    }
  };
  return /* @__PURE__ */ jsxs("div", {
    className: "relative bg-slate-900",
    children: [/* @__PURE__ */ jsx(FuzzyText, {
      fontSize: "8rem",
      color: "#ffff",
      baseIntensity: 0.01,
      hoverIntensity: 2,
      verticalCoverage: 0.8,
      children: "GOTCHA"
    }), /* @__PURE__ */ jsxs("div", {
      className: "absolute bottom-0 left-0 right-0 flex items-center gap-4 px-4 py-4 text-white bg-slate-900 w-full",
      children: [/* @__PURE__ */ jsx("h1", {
        className: "text-sm text-slate-400",
        children: "GOTCHA • brought to you by Programming Club • Please Proceed with Google"
      }), /* @__PURE__ */ jsxs("button", {
        onClick: () => signInWithGoogle(),
        className: "flex rounded-md bg-slate-600 hover:bg-slate-700 active:bg-slate-800 items-center justify-center px-6 py-2 gap-2 ml-auto",
        children: [/* @__PURE__ */ jsx("img", {
          src: GoogleLogo,
          alt: "Google Logo",
          className: "w-8 h-8"
        }), /* @__PURE__ */ jsx("span", {
          children: "Sign in with Google"
        })]
      })]
    })]
  });
});
const route1 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: home
}, Symbol.toStringTag, { value: "Module" }));
const GotchaLogo = "/assets/gotcha-logo-B-MkBQe_.png";
const Layout = UNSAFE_withComponentProps(function Layout2() {
  return /* @__PURE__ */ jsxs("div", {
    className: "bg-slate-900 dark:bg-slate-900 text-white min-w-full min-h-screen",
    children: [/* @__PURE__ */ jsxs("header", {
      className: "flex items-center p-2",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "flex items-center",
        children: [/* @__PURE__ */ jsx("img", {
          src: GotchaLogo,
          alt: "The Classic Gotcha Outstretched Hand",
          className: "w-16 h-16"
        }), /* @__PURE__ */ jsx("h1", {
          className: "text-2xl font-bold text-white flex items-center",
          children: "Gotcha"
        })]
      }), /* @__PURE__ */ jsxs("div", {
        className: "flex ml-auto mr-4 space-x-8 *:font-bold text-center text-xl items-center *:hover:text-slate-300",
        children: [/* @__PURE__ */ jsx(NavLink, {
          className: "flex items-center",
          to: "/app/profile",
          children: "Profile"
        }), /* @__PURE__ */ jsx(NavLink, {
          className: "flex items-center",
          to: "/app/leaderboard",
          children: "Leaderboard"
        })]
      })]
    }), /* @__PURE__ */ jsx("div", {
      children: /* @__PURE__ */ jsx(Outlet, {})
    })]
  });
});
const route2 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: Layout
}, Symbol.toStringTag, { value: "Module" }));
function GotchaLoader() {
  return /* @__PURE__ */ jsxs(
    motion.div,
    {
      className: "relative w-24 h-24 flex items-center justify-center",
      animate: { scale: [1, 1.12, 1], opacity: [0.9, 1, 0.9] },
      transition: { repeat: Infinity, duration: 1.8, ease: "easeInOut" },
      children: [
        /* @__PURE__ */ jsx("div", { className: "absolute inset-0 rounded-full bg-slate-800" }),
        /* @__PURE__ */ jsx("div", { className: "absolute inset-1 rounded-full bg-slate-800" }),
        /* @__PURE__ */ jsx("span", { className: "relative z-10 text-white text-2xl font-black", children: "G" })
      ]
    }
  );
}
const buttonVariants = {
  idle: {
    x: 0,
    rotate: 0,
    transition: {
      duration: 0.1
    }
  },
  shaking: {
    x: [10, -10],
    // Keyframes: from 10 to -10 pixels
    rotate: [-3, 3],
    // Keyframes: from -3 to 3 degrees
    // This settings make our button shake indefinitely
    transition: {
      repeatType: "mirror",
      repeat: Infinity,
      duration: 0.1,
      ease: "easeInOut"
    }
  }
};
const textVariants = {
  initial: (direction) => ({
    y: direction === "forward" ? "-30%" : "30%",
    opacity: 0
  }),
  target: {
    y: "0%",
    opacity: 1
  },
  exit: (direction) => ({
    y: direction === "forward" ? "30%" : "-30%",
    opacity: 0
  })
};
const TagOut = ({
  text: textFromProps,
  confirmTimeout = 2,
  onConfirm
}) => {
  const startCountdown = () => {
    setState("inProgress");
    animate(progress, 1, { duration: confirmTimeout, ease: "linear" }).then(
      () => {
        if (progress.get() !== 1) return;
        setState("complete");
      }
    );
  };
  const cancelCountdown = () => {
    progress.stop();
    setState("idle");
    animate(progress, 0, { duration: 0.2, ease: "linear" });
  };
  const pointerUp = (e) => {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (progress.get() === 1 && ref.current?.contains(target)) {
      animate(fillerConfirmAnimationProgress, 1, {
        duration: 0.2,
        ease: "linear"
      }).then(() => {
        fillerConfirmAnimationProgress.jump(0);
        progress.jump(0);
        setState("idle");
        onConfirm?.();
      });
    } else {
      cancelCountdown();
    }
  };
  const pointerMove = (e) => {
    if (e.pointerType === "mouse") return;
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!ref.current?.contains(target)) {
      cancelCountdown();
    }
  };
  const [state, setState] = useState(
    "idle"
  );
  const ref = useRef(null);
  const progress = useMotionValue(0);
  const fillRightOffset = useTransform(progress, (v) => `${(1 - v) * 100}%`);
  const [prevText, setPrevText] = useState(textFromProps);
  const [textDirection, setTextDirection] = useState("forward");
  const text = state === "idle" ? textFromProps : state === "inProgress" ? "Hold to confirm" : "Release to confirm";
  if (text !== prevText) {
    setTextDirection("forward");
    setPrevText(text);
  }
  const fillerConfirmAnimationProgress = useMotionValue(0);
  useTransform(
    fillerConfirmAnimationProgress,
    (v) => `${v * 100}%`
  );
  return /* @__PURE__ */ jsxs(
    motion.button,
    {
      type: "button",
      className: "box-border whitespace-nowrap font-inherit text-2xl font-bold text-center cursor-pointer transition duration-100 ease-in-out bg-slate-600 rounded-lg text-white leading-5 py-12 relative overflow-hidden min-w-50 w-full select-none touch-none hover:bg-slate-900 focus:outline-offset-6 focus-visible:shadow-none ",
      ref,
      onPointerDown: startCountdown,
      onPointerUp: pointerUp,
      onPointerCancel: cancelCountdown,
      onPointerLeave: (e) => {
        if (e.pointerType === "mouse") cancelCountdown();
      },
      onPointerMove: pointerMove,
      onContextMenuCapture: (e) => e.preventDefault(),
      variants: buttonVariants,
      children: [
        /* @__PURE__ */ jsx(AnimatePresence, { custom: textDirection, initial: false, mode: "popLayout", children: /* @__PURE__ */ jsx(
          motion.div,
          {
            className: "relative z-10",
            variants: textVariants,
            custom: textDirection,
            initial: "initial",
            animate: "target",
            exit: "exit",
            children: text
          },
          text
        ) }),
        /* @__PURE__ */ jsx(
          motion.div,
          {
            className: "bg-rose-600 absolute top-0 bottom-0 left-0 right-[100%] pointer-events-none",
            style: {
              right: fillRightOffset
            }
          }
        )
      ]
    }
  );
};
async function clientLoader$2() {
  const user = await new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user2) => {
      unsubscribe();
      resolve(user2);
    });
  });
  if (!user || !user.email?.endsWith("@milton.edu")) {
    return redirect("/");
  }
  const getProfile = httpsCallable(functions, "getProfile");
  const profileResult = await getProfile({});
  const getLastWords = httpsCallable(functions, "getLastWords");
  const lastWordsResult = await getLastWords({});
  return {
    profile: profileResult.data,
    user,
    lastWords: lastWordsResult.data
  };
}
const profile = UNSAFE_withComponentProps(function Profile({
  loaderData
}) {
  const {
    profile: profile2,
    user,
    lastWords: lastWords2
  } = loaderData;
  const [alive, setAlive] = React.useState(profile2.alive);
  const navigate = useNavigate();
  console.log(lastWords2);
  const tagOut = async () => {
    try {
      const tagOut2 = httpsCallable(functions, "tagOut");
      const tagOutResult = await tagOut2({});
      const data = tagOutResult.data;
      if (data.status !== 200) {
        throw new Error("Failed to tag out");
      }
      setAlive(false);
      navigate("/app/last-words", {
        state: {
          canSubmit: true
        },
        viewTransition: true
      });
    } catch (err) {
      console.error("tagOut error:", err);
      throw err;
    }
  };
  return /* @__PURE__ */ jsxs(Fragment, {
    children: [/* @__PURE__ */ jsxs("div", {
      className: "p-4",
      children: [/* @__PURE__ */ jsx("h1", {
        className: "font-bold text-xl",
        children: "Profile"
      }), /* @__PURE__ */ jsxs("div", {
        className: "bg-slate-800 p-4 rounded-lg m-4 text-center items-center flex flex-col space-y-4",
        children: [/* @__PURE__ */ jsx("img", {
          src: user.photoURL,
          className: "rounded-full"
        }), /* @__PURE__ */ jsxs("h2", {
          className: "text-2xl font-bold",
          children: [profile2.firstName, " ", profile2.lastName]
        })]
      }), alive ? /* @__PURE__ */ jsxs("div", {
        className: "m-4 flex-col space-y-4",
        children: [/* @__PURE__ */ jsxs("div", {
          className: "bg-slate-800 p-4 rounded-lg text-center items-center flex flex-col flex-1",
          children: [/* @__PURE__ */ jsx("h2", {
            className: "text-xl font-semibold",
            children: "Tags"
          }), /* @__PURE__ */ jsx("h1", {
            className: "text-2xl font-bold",
            children: profile2.tags
          })]
        }), /* @__PURE__ */ jsx(TagOut, {
          text: "Tag Out",
          onConfirm: tagOut
        })]
      }) : /* @__PURE__ */ jsxs("div", {
        className: "bg-slate-800 p-4 rounded-lg m-4 text-center items-center flex flex-col flex-1",
        children: [/* @__PURE__ */ jsx("h2", {
          className: "text-xl font-semibold",
          children: "Tags"
        }), /* @__PURE__ */ jsx("h1", {
          className: "text-2xl font-bold",
          children: profile2.tags
        })]
      }), alive ? /* @__PURE__ */ jsxs("div", {
        className: "bg-slate-800 p-4 rounded-lg m-4 text-center items-center flex flex-col",
        children: [/* @__PURE__ */ jsx("h2", {
          className: "text-xl font-semibold",
          children: "Target"
        }), /* @__PURE__ */ jsxs("h1", {
          className: "text-2xl font-bold",
          children: [profile2.target.firstName, " ", profile2.target.lastName]
        }), /* @__PURE__ */ jsx("p", {
          className: "italic font-light text-slate-300",
          children: profile2.target.email
        })]
      }) : null]
    }), /* @__PURE__ */ jsxs("div", {
      className: "p-4",
      children: [/* @__PURE__ */ jsx("h1", {
        className: "font-bold text-xl",
        children: "Last Words"
      }), /* @__PURE__ */ jsx("div", {
        children: lastWords2.lastWords.map((lw) => /* @__PURE__ */ jsxs("div", {
          className: "bg-slate-800 p-4 rounded-lg m-4",
          children: [/* @__PURE__ */ jsxs("p", {
            className: "italic text-white",
            children: ['"', lw.lw, '"']
          }), /* @__PURE__ */ jsxs("p", {
            className: "text-sm text-slate-300",
            children: ["- ", lw.author, " at", " ", new Date(lw.timestamp).toLocaleString(void 0, {
              year: "numeric",
              month: "numeric",
              day: "numeric",
              hour: "numeric",
              minute: "2-digit"
            })]
          })]
        }, lw.timestamp))
      })]
    })]
  });
});
const ErrorBoundary = UNSAFE_withErrorBoundaryProps(function ErrorBoundary3({
  error
}) {
  return /* @__PURE__ */ jsxs("div", {
    className: "w-screen h-screen flex flex-col items-center justify-center p-4 bg-slate-900",
    children: [/* @__PURE__ */ jsx("div", {
      className: " flex items-center justify-center",
      children: /* @__PURE__ */ jsx("h1", {
        className: "w-full text-center text-6xl font-bold",
        children: "Uh oh."
      })
    }), /* @__PURE__ */ jsx("div", {
      className: "mb-8 w-full flex justify-center",
      children: /* @__PURE__ */ jsx("p", {
        className: "text-sm text-red-300",
        children: error.message
      })
    })]
  });
});
const HydrateFallback = UNSAFE_withHydrateFallbackProps(function HydrateFallback2() {
  return /* @__PURE__ */ jsx("div", {
    className: "w-screen h-screen flex flex-col items-center justify-center p-4 bg-slate-900",
    children: /* @__PURE__ */ jsx(GotchaLoader, {})
  });
});
const route3 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  ErrorBoundary,
  HydrateFallback,
  clientLoader: clientLoader$2,
  default: profile
}, Symbol.toStringTag, { value: "Module" }));
function LeaderboardCard({
  position,
  name,
  tags
}) {
  const positionColor = position === 1 ? "bg-amber-400" : position === 2 ? "bg-slate-400" : position === 3 ? "bg-amber-700" : "bg-slate-500";
  return /* @__PURE__ */ jsxs("div", { className: "flex align-center space-x-4 items-center p-4 rounded-xl bg-slate-600", children: [
    /* @__PURE__ */ jsx(
      "div",
      {
        className: `rounded-full ${positionColor} p-4 flex w-4 h-4 items-center justify-center text-center`,
        children: /* @__PURE__ */ jsx("h2", { children: position })
      }
    ),
    /* @__PURE__ */ jsx("h1", { className: "font-bold text-left flex-1", children: name }),
    /* @__PURE__ */ jsx("h2", { className: "text-right", children: tags })
  ] });
}
async function clientLoader$1() {
  await fetchAndActivate(remoteConfig);
  const endDateValue = getValue(remoteConfig, "endDate");
  const endDate = endDateValue.asString();
  const getLeaderboard = httpsCallable(functions, "getLeaderboard");
  const leaderboard2 = (await getLeaderboard({})).data.leaderboard;
  return {
    endDate,
    leaderboard: leaderboard2
  };
}
const leaderboard = UNSAFE_withComponentProps(function Leaderboard({
  loaderData
}) {
  const {
    endDate,
    leaderboard: leaderboard2
  } = loaderData;
  const [timeRemaining, setTimeRemaining] = React.useState("");
  console.log(leaderboard2);
  React.useEffect(() => {
    function updateTimeRemaining() {
      const end = (/* @__PURE__ */ new Date("2026-01-01T20:00")).getTime();
      const now = Date.now();
      const diff = end - now;
      if (diff <= 0) {
        setTimeRemaining("Gotcha is Over!");
        return;
      }
      const days = Math.floor(diff / (1e3 * 60 * 60 * 24));
      const hours = Math.floor(diff / (1e3 * 60 * 60) % 24);
      const minutes = Math.floor(diff / (1e3 * 60) % 60);
      const seconds = Math.floor(diff / 1e3 % 60);
      setTimeRemaining(`${days}d ${hours}h ${minutes}m ${seconds}s`);
    }
    updateTimeRemaining();
    const intervalId = setInterval(updateTimeRemaining, 1e3);
    return () => clearInterval(intervalId);
  }, [endDate]);
  return /* @__PURE__ */ jsxs("div", {
    className: "flex flex-col sm:flex-col md:flex-row flex-1 p-8 items-center",
    children: [/* @__PURE__ */ jsxs("div", {
      className: "space-y-2",
      children: [/* @__PURE__ */ jsx("h1", {
        className: "font-bold text-xl",
        children: "Leaderboard"
      }), leaderboard2 && leaderboard2.topTaggers && leaderboard2.topTaggers.map(({
        name,
        tags
      }, index) => /* @__PURE__ */ jsx(LeaderboardCard, {
        name,
        tags,
        position: index + 1
      }, index))]
    }), /* @__PURE__ */ jsxs("div", {
      className: "flex flex-1 flex-col items-center justify-start p-4 rounded-xl space-y-8",
      children: [/* @__PURE__ */ jsx("h1", {
        className: "text-red-500 text-4xl text-center font-bold",
        children: timeRemaining
      }), /* @__PURE__ */ jsxs("div", {
        className: "flex w-full justify-around space-x-8",
        children: [/* @__PURE__ */ jsxs("div", {
          className: "flex-1",
          children: [/* @__PURE__ */ jsx("h1", {
            className: "font-bold text-xl text-white mb-4 text-center",
            children: "Classes"
          }), /* @__PURE__ */ jsx("div", {
            className: "space-y-2",
            children: leaderboard2 && leaderboard2.byClass.map((classEntry) => /* @__PURE__ */ jsxs("div", {
              className: "flex justify-between p-3 bg-slate-700 rounded-lg",
              children: [/* @__PURE__ */ jsx("h2", {
                className: "font-medium capitalize",
                children: classEntry.class
              }), /* @__PURE__ */ jsx("h2", {
                className: "font-bold",
                children: classEntry.tags
              })]
            }, classEntry.class))
          })]
        }), /* @__PURE__ */ jsxs("div", {
          className: "flex-1",
          children: [/* @__PURE__ */ jsx("h1", {
            className: "font-bold text-xl text-white mb-4 text-center",
            children: "Dorms"
          }), /* @__PURE__ */ jsx("div", {
            className: "space-y-2",
            children: leaderboard2 && leaderboard2.byDorms.map((dormEntry) => /* @__PURE__ */ jsxs("div", {
              className: "flex justify-between p-3 bg-slate-700 rounded-lg",
              children: [/* @__PURE__ */ jsx("h2", {
                className: "font-medium capitalize",
                children: dormEntry.dorm
              }), /* @__PURE__ */ jsx("h2", {
                className: "font-bold",
                children: dormEntry.tags
              })]
            }, dormEntry.dorm))
          })]
        })]
      })]
    })]
  });
});
const route4 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  clientLoader: clientLoader$1,
  default: leaderboard
}, Symbol.toStringTag, { value: "Module" }));
const LetterGlitch = ({
  glitchColors = ["#2b4539", "#61dca3", "#61b3dc"],
  glitchSpeed = 50,
  centerVignette = false,
  outerVignette = true,
  smooth = true,
  characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789",
  children
}) => {
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const letters = useRef([]);
  const grid = useRef({ columns: 0, rows: 0 });
  const context = useRef(null);
  const lastGlitchTime = useRef(Date.now());
  const lettersAndSymbols = Array.from(characters);
  const fontSize = 16;
  const charWidth = 10;
  const charHeight = 20;
  const getRandomChar = () => {
    return lettersAndSymbols[Math.floor(Math.random() * lettersAndSymbols.length)];
  };
  const getRandomColor = () => {
    return glitchColors[Math.floor(Math.random() * glitchColors.length)];
  };
  const hexToRgb = (hex) => {
    const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
    hex = hex.replace(shorthandRegex, (_m, r, g, b) => {
      return r + r + g + g + b + b;
    });
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16)
    } : null;
  };
  const interpolateColor = (start, end, factor) => {
    const result = {
      r: Math.round(start.r + (end.r - start.r) * factor),
      g: Math.round(start.g + (end.g - start.g) * factor),
      b: Math.round(start.b + (end.b - start.b) * factor)
    };
    return `rgb(${result.r}, ${result.g}, ${result.b})`;
  };
  const calculateGrid = (width, height) => {
    const columns = Math.ceil(width / charWidth);
    const rows = Math.ceil(height / charHeight);
    return { columns, rows };
  };
  const initializeLetters = (columns, rows) => {
    grid.current = { columns, rows };
    const totalLetters = columns * rows;
    letters.current = Array.from({ length: totalLetters }, () => ({
      char: getRandomChar(),
      color: getRandomColor(),
      targetColor: getRandomColor(),
      colorProgress: 1
    }));
  };
  const resizeCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const parent = canvas.parentElement;
    if (!parent) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = parent.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;
    if (context.current) {
      context.current.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    const { columns, rows } = calculateGrid(rect.width, rect.height);
    initializeLetters(columns, rows);
    drawLetters();
  };
  const drawLetters = () => {
    if (!context.current || letters.current.length === 0) return;
    const ctx = context.current;
    const { width, height } = canvasRef.current.getBoundingClientRect();
    ctx.clearRect(0, 0, width, height);
    ctx.font = `${fontSize}px monospace`;
    ctx.textBaseline = "top";
    letters.current.forEach((letter, index) => {
      const x = index % grid.current.columns * charWidth;
      const y = Math.floor(index / grid.current.columns) * charHeight;
      ctx.fillStyle = letter.color;
      ctx.fillText(letter.char, x, y);
    });
  };
  const updateLetters = () => {
    if (!letters.current || letters.current.length === 0) return;
    const updateCount = Math.max(1, Math.floor(letters.current.length * 0.05));
    for (let i = 0; i < updateCount; i++) {
      const index = Math.floor(Math.random() * letters.current.length);
      if (!letters.current[index]) continue;
      letters.current[index].char = getRandomChar();
      letters.current[index].targetColor = getRandomColor();
      if (!smooth) {
        letters.current[index].color = letters.current[index].targetColor;
        letters.current[index].colorProgress = 1;
      } else {
        letters.current[index].colorProgress = 0;
      }
    }
  };
  const handleSmoothTransitions = () => {
    let needsRedraw = false;
    letters.current.forEach((letter) => {
      if (letter.colorProgress < 1) {
        letter.colorProgress += 0.05;
        if (letter.colorProgress > 1) letter.colorProgress = 1;
        const startRgb = hexToRgb(letter.color);
        const endRgb = hexToRgb(letter.targetColor);
        if (startRgb && endRgb) {
          letter.color = interpolateColor(
            startRgb,
            endRgb,
            letter.colorProgress
          );
          needsRedraw = true;
        }
      }
    });
    if (needsRedraw) {
      drawLetters();
    }
  };
  const animate2 = () => {
    const now = Date.now();
    if (now - lastGlitchTime.current >= glitchSpeed) {
      updateLetters();
      drawLetters();
      lastGlitchTime.current = now;
    }
    if (smooth) {
      handleSmoothTransitions();
    }
    animationRef.current = requestAnimationFrame(animate2);
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    context.current = canvas.getContext("2d");
    resizeCanvas();
    animate2();
    let resizeTimeout;
    const handleResize = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(() => {
        cancelAnimationFrame(animationRef.current);
        resizeCanvas();
        animate2();
      }, 100);
    };
    window.addEventListener("resize", handleResize);
    return () => {
      cancelAnimationFrame(animationRef.current);
      window.removeEventListener("resize", handleResize);
    };
  }, [glitchSpeed, smooth]);
  return /* @__PURE__ */ jsxs("div", { className: "relative w-full h-full bg-black overflow-hidden", children: [
    /* @__PURE__ */ jsx("canvas", { ref: canvasRef, className: "block w-full h-full" }),
    outerVignette && /* @__PURE__ */ jsx("div", { className: "absolute top-0 left-0 w-full h-full pointer-events-none bg-[radial-gradient(circle,_rgba(0,0,0,0)_60%,_rgba(0,0,0,1)_100%)]" }),
    centerVignette && /* @__PURE__ */ jsx("div", { className: "absolute top-0 left-0 w-full h-full pointer-events-none bg-[radial-gradient(circle,_rgba(0,0,0,0.8)_0%,_rgba(0,0,0,0)_60%)]", children: /* @__PURE__ */ jsx("div", { className: "pointer-events-auto w-full h-full", children }) })
  ] });
};
const lastWords = UNSAFE_withComponentProps(function LastWords() {
  const navigate = useNavigate();
  const inputRef = React.useRef(null);
  const [error, setError] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const location = useLocation();
  const state = location.state;
  React.useEffect(() => {
    if (!state?.canSubmit) {
      navigate("/app/leaderboard", {
        replace: true
      });
    }
  }, [state, navigate]);
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const lastWords2 = inputRef.current?.value?.trim() ?? "";
    if (!lastWords2) {
      setError("Please enter your last words.");
      return;
    }
    const user = auth.currentUser;
    if (!user?.email) {
      setError("You must be signed in to submit last words.");
      return;
    }
    setLoading(true);
    try {
      const setLastWordsFn = httpsCallable(functions, "setLastWords");
      const res = await setLastWordsFn({
        lastWords: lastWords2,
        email: user.email
      });
      if (res?.data && typeof res.data === "object" && res.data.status !== void 0) {
        if (res.data.status !== 200) {
          setError("Failed to submit. Please try again.");
          setLoading(false);
          return;
        }
      }
      navigate("/app/leaderboard");
    } catch (err) {
      console.error("Error setting last words:", err);
      const msg = err?.message || "";
      if (msg.includes("Last words already set")) {
        setError("You have already submitted your last words.");
      } else if (msg.includes("unauthenticated")) {
        setError("Please sign in again.");
      } else {
        setError("Something went wrong. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };
  return /* @__PURE__ */ jsx("div", {
    className: "w-screen h-screen bg-black overflow-hidden",
    children: /* @__PURE__ */ jsx(motion.div, {
      initial: {
        opacity: 0,
        y: 0
      },
      animate: {
        opacity: 1,
        y: 0
      },
      transition: {
        duration: 1,
        ease: "easeOut"
      },
      className: "w-screen h-screen bg-black overflow-hidden",
      children: /* @__PURE__ */ jsx(LetterGlitch, {
        glitchSpeed: 100,
        centerVignette: true,
        outerVignette: false,
        smooth: true,
        characters: "ABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$&*()-_+=/[]{};:<>.,0123456789",
        children: /* @__PURE__ */ jsx("div", {
          className: "w-full h-full flex flex-col items-center justify-center p-4 z-50 relative",
          children: /* @__PURE__ */ jsx(motion.div, {
            initial: {
              opacity: 0,
              y: 20
            },
            animate: {
              opacity: 1,
              y: 0
            },
            transition: {
              delay: 0.5,
              duration: 1,
              ease: "easeOut"
            },
            children: /* @__PURE__ */ jsxs("div", {
              className: "max-w-md w-full p-8 flex flex-col items-center space-y-8",
              children: [/* @__PURE__ */ jsxs("div", {
                className: "space-y-2 text-center",
                children: [/* @__PURE__ */ jsx("h1", {
                  className: "text-white text-4xl font-bold tracking-tighter",
                  children: "Thanks for playing."
                }), /* @__PURE__ */ jsx("p", {
                  className: "text-gray-400 text-sm",
                  children: "Any last words?"
                })]
              }), /* @__PURE__ */ jsxs("form", {
                onSubmit: handleSubmit,
                className: "w-full flex flex-col space-y-6",
                children: [/* @__PURE__ */ jsx("div", {
                  className: "relative group",
                  children: /* @__PURE__ */ jsx("input", {
                    ref: inputRef,
                    autoFocus: true,
                    type: "text",
                    disabled: loading,
                    maxLength: 60,
                    className: "w-full bg-black/50 border-2 rounded-lg border-gray-700 py-3 text-center text-white placeholder-gray-600 focus:outline-none focus:border-slate-500 transition-colors disabled:opacity-50",
                    placeholder: "I'll be back..."
                  })
                }), error && /* @__PURE__ */ jsx("div", {
                  className: "p-3 bg-red-500/10 border border-red-500/20 rounded-full text-red-400 text-sm text-center animate-pulse",
                  children: error
                }), /* @__PURE__ */ jsx("button", {
                  type: "submit",
                  disabled: loading,
                  className: "w-full py-4 bg-white text-black font-bold hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed rounded-full",
                  children: loading ? /* @__PURE__ */ jsxs("span", {
                    className: "flex items-center justify-center gap-2",
                    children: [/* @__PURE__ */ jsx("span", {
                      className: "w-2 h-2 bg-black rounded-full animate-bounce"
                    }), /* @__PURE__ */ jsx("span", {
                      className: "w-2 h-2 bg-black rounded-full animate-bounce [animation-delay:0.1s]"
                    }), /* @__PURE__ */ jsx("span", {
                      className: "w-2 h-2 bg-black rounded-full animate-bounce [animation-delay:0.2s]"
                    })]
                  }) : "Submit"
                })]
              })]
            })
          })
        })
      })
    })
  });
});
const route5 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  default: lastWords
}, Symbol.toStringTag, { value: "Module" }));
async function clientLoader() {
  const user = await new Promise((resolve) => {
    const unsubscribe = onAuthStateChanged(auth, (user2) => {
      unsubscribe();
      resolve(user2);
    });
  });
  if (!user || !user.email?.endsWith("@milton.edu")) {
    return redirect("/");
  }
  const getProfile = httpsCallable(functions, "getProfile");
  const profileResult = (await getProfile({})).data;
  console.log(profileResult);
  return {
    profile: profileResult,
    user
  };
}
const admin = UNSAFE_withComponentProps(function AdminPanel({
  loaderData
}) {
  const {
    profile: profile2,
    user
  } = loaderData;
  console.log(profile2);
  console.log(user);
  const [searchText, setSearchText] = useState("");
  return /* @__PURE__ */ jsx(Fragment, {
    children: /* @__PURE__ */ jsxs("div", {
      className: "p-6",
      children: [/* @__PURE__ */ jsxs("div", {
        className: "text-lg pb-4",
        children: ["Salutations, ", profile2.firstName, " ", profile2.lastName, ". The Gotcha admin panel is at your service."]
      }), /* @__PURE__ */ jsx("input", {
        value: searchText,
        onChange: (event) => setSearchText(event.target.value),
        placeholder: "Search players by name or email...",
        className: "border-2 rounded-sm p-2 w-full"
      })]
    })
  });
});
const route6 = /* @__PURE__ */ Object.freeze(/* @__PURE__ */ Object.defineProperty({
  __proto__: null,
  clientLoader,
  default: admin
}, Symbol.toStringTag, { value: "Module" }));
const serverManifest = { "entry": { "module": "/assets/entry.client-BUR5AqMv.js", "imports": ["/assets/jsx-runtime-jioiABin.js"], "css": [] }, "routes": { "root": { "id": "root", "parentId": void 0, "path": "", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": true, "module": "/assets/root-D_dYqQID.js", "imports": ["/assets/jsx-runtime-jioiABin.js"], "css": ["/assets/root-Cb12WqZP.css"], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/home": { "id": "routes/home", "parentId": "root", "path": void 0, "index": true, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/home-C9rRrOj2.js", "imports": ["/assets/jsx-runtime-jioiABin.js", "/assets/firebase-DgHvPz6v.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "../components/Layout": { "id": "../components/Layout", "parentId": "root", "path": void 0, "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/Layout-CYY9l6Xg.js", "imports": ["/assets/jsx-runtime-jioiABin.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/profile": { "id": "routes/profile", "parentId": "../components/Layout", "path": "app/profile", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": true, "hasClientMiddleware": false, "hasErrorBoundary": true, "module": "/assets/profile-B61pbri9.js", "imports": ["/assets/jsx-runtime-jioiABin.js", "/assets/firebase-DgHvPz6v.js", "/assets/proxy-DrPk0-nW.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/leaderboard": { "id": "routes/leaderboard", "parentId": "../components/Layout", "path": "app/leaderboard", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": true, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/leaderboard-BdLbOmig.js", "imports": ["/assets/jsx-runtime-jioiABin.js", "/assets/firebase-DgHvPz6v.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/last-words": { "id": "routes/last-words", "parentId": "root", "path": "app/last-words", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": false, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/last-words-es_xlYs7.js", "imports": ["/assets/jsx-runtime-jioiABin.js", "/assets/firebase-DgHvPz6v.js", "/assets/proxy-DrPk0-nW.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 }, "routes/admin": { "id": "routes/admin", "parentId": "root", "path": "app/admin", "index": void 0, "caseSensitive": void 0, "hasAction": false, "hasLoader": false, "hasClientAction": false, "hasClientLoader": true, "hasClientMiddleware": false, "hasErrorBoundary": false, "module": "/assets/admin-BL4a4s-R.js", "imports": ["/assets/jsx-runtime-jioiABin.js", "/assets/firebase-DgHvPz6v.js"], "css": [], "clientActionModule": void 0, "clientLoaderModule": void 0, "clientMiddlewareModule": void 0, "hydrateFallbackModule": void 0 } }, "url": "/assets/manifest-0d6050ad.js", "version": "0d6050ad", "sri": void 0 };
const assetsBuildDirectory = "build/client";
const basename = "/";
const future = { "unstable_optimizeDeps": false, "unstable_subResourceIntegrity": false, "v8_middleware": false, "v8_splitRouteModules": false, "v8_viteEnvironmentApi": false };
const ssr = true;
const isSpaMode = false;
const prerender = [];
const routeDiscovery = { "mode": "lazy", "manifestPath": "/__manifest" };
const publicPath = "/";
const entry = { module: entryServer };
const routes = {
  "root": {
    id: "root",
    parentId: void 0,
    path: "",
    index: void 0,
    caseSensitive: void 0,
    module: route0
  },
  "routes/home": {
    id: "routes/home",
    parentId: "root",
    path: void 0,
    index: true,
    caseSensitive: void 0,
    module: route1
  },
  "../components/Layout": {
    id: "../components/Layout",
    parentId: "root",
    path: void 0,
    index: void 0,
    caseSensitive: void 0,
    module: route2
  },
  "routes/profile": {
    id: "routes/profile",
    parentId: "../components/Layout",
    path: "app/profile",
    index: void 0,
    caseSensitive: void 0,
    module: route3
  },
  "routes/leaderboard": {
    id: "routes/leaderboard",
    parentId: "../components/Layout",
    path: "app/leaderboard",
    index: void 0,
    caseSensitive: void 0,
    module: route4
  },
  "routes/last-words": {
    id: "routes/last-words",
    parentId: "root",
    path: "app/last-words",
    index: void 0,
    caseSensitive: void 0,
    module: route5
  },
  "routes/admin": {
    id: "routes/admin",
    parentId: "root",
    path: "app/admin",
    index: void 0,
    caseSensitive: void 0,
    module: route6
  }
};
export {
  serverManifest as assets,
  assetsBuildDirectory,
  basename,
  entry,
  future,
  isSpaMode,
  prerender,
  publicPath,
  routeDiscovery,
  routes,
  ssr
};
