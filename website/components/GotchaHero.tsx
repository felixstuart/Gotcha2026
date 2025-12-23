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
  ...divProps
}) => {
  const canvasRef = useRef<
    HTMLCanvasElement & { cleanupFuzzyText?: () => void }
  >(null);

  useEffect(() => {
    let animationFrameId: number;
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

      // Set canvas to screen size
      const screenWidth = window.innerWidth;
      const screenHeight = window.innerHeight;
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
      const fuzzRange = 30;

      const run = () => {
        if (isCancelled) return;
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
        if (!enableHover) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        isHovering = isInsideTextArea(x, y);
      };

      const handleMouseLeave = () => {
        isHovering = false;
      };

      const handleTouchMove = (e: TouchEvent) => {
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
        // Re-initialize on resize
        init();
      };

      if (enableHover) {
        canvas.addEventListener("mousemove", handleMouseMove);
        canvas.addEventListener("mouseleave", handleMouseLeave);
        canvas.addEventListener("touchmove", handleTouchMove, {
          passive: false,
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
    verticalCoverage,
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
