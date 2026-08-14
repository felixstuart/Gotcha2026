import { useRef, useState, type PointerEvent } from "react";
import {
  AnimatePresence,
  type Variants,
  animate,
  motion,
  useMotionValue,
  useTransform,
} from "framer-motion";

type HoldToConfirmProps = {
  text: string;
  confirmTimeout?: number; // seconds
  onConfirm?: VoidFunction;
};

type Direction = "forward" | "backward";

const buttonVariants: Variants = {
  idle: {
    x: 0,
    rotate: 0,
    transition: {
      duration: 0.1,
    },
  },
  shaking: {
    x: [10, -10], // Keyframes: from 10 to -10 pixels
    rotate: [-3, 3], // Keyframes: from -3 to 3 degrees
    // This settings make our button shake indefinitely
    transition: {
      repeatType: "mirror",
      repeat: Infinity,
      duration: 0.1,
      ease: "easeInOut",
    },
  },
};

const textVariants: Variants = {
  initial: (direction: Direction) => ({
    y: direction === "forward" ? "-30%" : "30%",
    opacity: 0,
  }),
  target: {
    y: "0%",
    opacity: 1,
  },
  exit: (direction: Direction) => ({
    y: direction === "forward" ? "30%" : "-30%",
    opacity: 0,
  }),
};

export const TagOut = ({
  text: textFromProps,
  confirmTimeout = 2,
  onConfirm,
}: HoldToConfirmProps) => {
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

  const pointerUp = (e: PointerEvent) => {
    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (progress.get() === 1 && ref.current?.contains(target)) {
      animate(fillerConfirmAnimationProgress, 1, {
        duration: 0.2,
        ease: "linear",
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

  const pointerMove = (e: PointerEvent) => {
    if (e.pointerType === "mouse") return;

    const target = document.elementFromPoint(e.clientX, e.clientY);
    if (!ref.current?.contains(target)) {
      cancelCountdown();
    }
  };

  const [state, setState] = useState<"idle" | "inProgress" | "complete">(
    "idle"
  );
  const ref = useRef<HTMLButtonElement>(null);

  const progress = useMotionValue(0);
  const fillRightOffset = useTransform(progress, (v) => `${(1 - v) * 100}%`);

  const [prevText, setPrevText] = useState(textFromProps);
  const [textDirection, setTextDirection] = useState<Direction>("forward");

  const text =
    state === "idle"
      ? textFromProps
      : state === "inProgress"
        ? "Hold to confirm"
        : "Release to confirm";

  // Update direction when text changes
  if (text !== prevText) {
    setTextDirection("forward");
    setPrevText(text);
  }

  const fillerConfirmAnimationProgress = useMotionValue(0);
  const fillLeftOffset = useTransform(
    fillerConfirmAnimationProgress,
    (v) => `${v * 100}%`
  );

  return (
    <motion.button
      type="button"
      className="box-border whitespace-nowrap font-inherit text-2xl font-bold text-center cursor-pointer transition duration-100 ease-in-out bg-slate-600 rounded-lg text-white leading-5 py-12 relative overflow-hidden min-w-50 w-full select-none touch-none hover:bg-slate-900 focus:outline-offset-6 focus-visible:shadow-none "
      ref={ref}
      onPointerDown={startCountdown}
      onPointerUp={pointerUp}
      onPointerCancel={cancelCountdown}
      onPointerLeave={(e) => {
        if (e.pointerType === "mouse") cancelCountdown();
      }}
      onPointerMove={pointerMove}
      onContextMenuCapture={(e) => e.preventDefault()}
      variants={buttonVariants}
    >
      <AnimatePresence custom={textDirection} initial={false} mode="popLayout">
        <motion.div
          key={text}
          className="relative z-10"
          variants={textVariants}
          custom={textDirection}
          initial="initial"
          animate="target"
          exit="exit"
        >
          {text}
        </motion.div>
      </AnimatePresence>
      <motion.div
        className="bg-rose-600 absolute top-0 bottom-0 left-0 right-full pointer-events-none"
        style={{
          right: fillRightOffset,
        }}
      />
    </motion.button>
  );
};
