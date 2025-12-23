import { motion } from "framer-motion";

export default function GotchaLoader() {
  return (
    <motion.div
      className="relative w-24 h-24 flex items-center justify-center"
      animate={{ scale: [1, 1.12, 1], opacity: [0.9, 1, 0.9] }}
      transition={{ repeat: Infinity, duration: 1.8, ease: "easeInOut" }}
    >
      <div className="absolute inset-0 rounded-full bg-slate-800" />
      <div className="absolute inset-1 rounded-full bg-slate-800" />
      <span className="relative z-10 text-white text-2xl font-black">G</span>
    </motion.div>
  );
}
