import { execSync } from "node:child_process";
import fs from "node:fs";

/** Points tests at a separate database (TEST_DATABASE_URL, or "<db>_test") and applies migrations. */
export default function setup() {
  let base = process.env.DATABASE_URL;
  if (!base && fs.existsSync(".env")) {
    base = fs.readFileSync(".env", "utf8").match(/^DATABASE_URL="?([^"\n]+)"?/m)?.[1];
  }
  const url = process.env.TEST_DATABASE_URL ?? base?.replace(/\/([^/?]+)(\?|$)/, "/$1_test$2");
  if (!url) throw new Error("Set TEST_DATABASE_URL or DATABASE_URL to run tests");
  process.env.DATABASE_URL = url;
  process.env.SESSION_SECRET = "test-secret-test-secret-test-secret";
  execSync("npx prisma migrate deploy", { env: process.env, stdio: "ignore" });
}
