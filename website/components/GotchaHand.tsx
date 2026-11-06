import { motion } from "framer-motion";
import {useState, useEffect} from "react";

export default function GotchaLoader() {

  const [loadingTips, setLoadingTips] = useState("Triangulating...");
  
  useEffect(() => {
    const tips = [
      "Triangulating...",
      "Checking Tag Loop...",
      "Making sure it's really you...",
      "Mapping Milton...",
      "Finding Waldo...",
      "Scouring the AMC...",
      "Receiving targets..."
    ]

    const startIndex = Math.floor(Math.random() * tips.length);
    setLoadingTips(tips[startIndex]);

    let i = (startIndex + 1) % tips.length;
    const interval = setInterval(() => {
      setLoadingTips(tips[i]);
      i = (i + 1) % tips.length;
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  return (
    <div className="flex flex-col items-center justify-center space-y-4 h-full w-full">
      <motion.div
        className="relative w-24 h-24 flex items-center justify-center"
        animate={{ scale: [1, 1.12, 1], opacity: [0.9, 1, 0.9] }}
        transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
      >
        <div className="absolute inset-0 rounded-full bg-slate-800" />
        <div className="absolute inset-1 rounded-full bg-slate-800" />
        <span className="relative z-10 text-white text-2xl font-black">G</span>
      </motion.div>
      <h2 className="text-white text-lg font-medium">{loadingTips}</h2>
    </div>
  );
}
