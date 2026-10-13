import launch from "./core/launch";

if (location.origin === "http://127.0.0.1:8765" && location.pathname === "/options/pdf/web/viewer.html") {
  launch().catch(console.error);
}
