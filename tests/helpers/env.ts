import fs from "node:fs";

// Mirror global-setup so each worker uses the test database.
let base = process.env.DATABASE_URL;
if (!base && fs.existsSync(".env")) base = fs.readFileSync(".env", "utf8").match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
if (!base?.includes("_test")) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? base?.replace(/\/([^/?]+)(\?|$)/, "/$1_test$2");
}
process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";
