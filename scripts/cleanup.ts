// Deletes data past its retention period. Schedule daily, e.g. via cron or an Azure WebJob:
//   npm run db:cleanup
import { db } from "../src/lib/db";
import { runCleanup } from "../src/lib/retention";

runCleanup()
  .then((r) => console.log("Cleanup complete:", r))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
