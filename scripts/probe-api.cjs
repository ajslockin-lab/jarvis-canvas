// Tiny probe — checks if api-server is up on 8080.
const http = require("node:http");
const req = http.get({ hostname: "127.0.0.1", port: 8080, path: "/api/healthz", timeout: 2000 }, (res) => {
  console.log(`OK status=${res.statusCode}`);
  process.exit(0);
});
req.on("error", (e) => {
  console.log(`FAIL ${e.code || e.message}`);
  process.exit(1);
});
req.on("timeout", () => {
  console.log("FAIL timeout");
  req.destroy();
  process.exit(1);
});
