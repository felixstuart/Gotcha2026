import React, { useEffect, useRef } from "react";

interface FuzzyTextProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  fontSize?: number | string;
  fontWeight?: string | number;
  fontFamily?: string;
  color?: string;
  enableHover?: boolean;
  baseIntensity?: number;
  hoverIntensity?: number;
  verticalCoverage?: number; // percentage of screen height (0-1)
  // Size the canvas to the wrapper div instead of the window. Pass a className
  // that gives the wrapper a size, e.g. "w-full h-full".
  fillParent?: boolean;
}

export const FuzzyText: React.FC<FuzzyTextProps> = ({
  children,
  fontSize = "clamp(2rem, 8vw, 8rem)",
  fontWeight = 900,
  fontFamily = "inherit",
  color = "#fff",
  enableHover = true,
  baseIntensity = 0.18,
  hoverIntensity = 0.5,
  verticalCoverage = 0.9,
  fillParent = false,
  ...divProps
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let isCancelled = false;
    let initializationId = 0;
    let cleanupAnimation: (() => void) | undefined;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const init = async () => {
      const currentInitializationId = ++initializationId;
      cleanupAnimation?.();
      cleanupAnimation = undefined;

      if (document.fonts?.ready) {
        await document.fonts.ready;
      }
      // Only the latest resize may initialize after font loading finishes.
      if (isCancelled || currentInitializationId !== initializationId) return;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const computedFontFamily =
        fontFamily === "inherit"
          ? window.getComputedStyle(canvas).fontFamily || "sans-serif"
          : fontFamily;

      const fontSizeStr =
        typeof fontSize === "number" ? `${fontSize}px` : fontSize;
      let numericFontSize: number;
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
      const actualDescent =
        metrics.actualBoundingBoxDescent ?? numericFontSize * 0.2;

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

      // Set canvas to screen size (or the wrapper's size with fillParent)
      const host = fillParent ? canvas.parentElement : null;
      const screenWidth = host ? host.clientWidth : window.innerWidth;
      const screenHeight = host ? host.clientHeight : window.innerHeight;
      canvas.width = screenWidth;
      canvas.height = screenHeight;

      // Calculate target height (90% of screen)
      const targetHeight = screenHeight * verticalCoverage;
      const verticalPadding = (screenHeight - targetHeight) / 2;

      // Calculate stretch ratios
      const horizontalStretchRatio = screenWidth / offscreenWidth;
      const verticalStretchRatio = targetHeight / tightHeight;

      const interactiveLeft = 0;
      const interactiveTop = 0;
      const interactiveRight = screenWidth;
      const interactiveBottom = screenHeight;

      let isHovering = false;
      let animationFrameId: number;
      const fuzzRange = 30;
      // Phones (no mouse) get no hover boost, and touching the text never blocks scrolling
      const canHover = enableHover && window.matchMedia("(hover: hover) and (pointer: fine)").matches;

      const run = () => {
        if (isCancelled || currentInitializationId !== initializationId) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const intensity = isHovering ? hoverIntensity : baseIntensity;

        // Draw each row of the original text, stretched both horizontally and vertically
        for (let j = 0; j < tightHeight; j++) {
          const dx = Math.floor(intensity * (Math.random() - 0.5) * fuzzRange);
          const destY = verticalPadding + j * verticalStretchRatio;
          const destHeight = verticalStretchRatio;
          ctx.drawImage(
            offscreen,
            0,
            j,
            offscreenWidth,
            1, // source
            dx,
            destY,
            screenWidth,
            destHeight // destination - stretched horizontally too
          );
        }
        animationFrameId = window.requestAnimationFrame(run);
      };

      run();

      const isInsideTextArea = (x: number, y: number) =>
        x >= interactiveLeft &&
        x <= interactiveRight &&
        y >= interactiveTop &&
        y <= interactiveBottom;

      const handleMouseMove = (e: MouseEvent) => {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        isHovering = isInsideTextArea(x, y);
      };

      const handleMouseLeave = () => {
        isHovering = false;
      };

      if (canHover) {
        canvas.addEventListener("mousemove", handleMouseMove);
        canvas.addEventListener("mouseleave", handleMouseLeave);
      }

      cleanupAnimation = () => {
        window.cancelAnimationFrame(animationFrameId);
        if (canHover) {
          canvas.removeEventListener("mousemove", handleMouseMove);
          canvas.removeEventListener("mouseleave", handleMouseLeave);
        }
      };
    };

    const handleResize = () => {
      void init();
    };

    window.addEventListener("resize", handleResize);
    void init();

    return () => {
      isCancelled = true;
      window.removeEventListener("resize", handleResize);
      cleanupAnimation?.();
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
    verticalCoverage,
    fillParent,
  ]);

  return (
    <div
      className="w-screen h-screen flex items-center justify-center bg-inherit"
      {...divProps}
    >
      <canvas ref={canvasRef} />
    </div>
  );
};
