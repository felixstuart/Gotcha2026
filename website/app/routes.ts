import {
  type RouteConfig,
  index,
  layout,
  prefix,
  route,
} from "@react-router/dev/routes";

export default [
  index("./routes/home.tsx"),
  ...prefix("app", [
    layout("../components/Layout.tsx", [
      route("profile", "routes/profile.tsx"),
      route("leaderboard", "routes/leaderboard.tsx"),
    ]),
    route("last-words", "routes/last-words.tsx"),
    route("admin", "routes/admin.tsx")
  ]),
] satisfies RouteConfig;
//
