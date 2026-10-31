import type { Config } from "@react-router/dev/config";

export default {
  // Firebase Hosting serves the app; Firebase callable functions provide the backend.
  ssr: false,
} satisfies Config;
