// Usage: npm run scenarios:validate
import { loadCatalog } from "../src/lib/scenarios";

try {
  const { tracks, scenarios } = loadCatalog();
  console.log(`✓ ${tracks.length} tracks, ${scenarios.length} scenarios valid`);
  for (const s of scenarios) console.log(`  - ${s.id} (${s.track_id}, v${s.version}, ${s.language_modes.join("/")}, ${s.max_turns} turns)`);
} catch (err) {
  console.error(`✗ ${(err as Error).message}`);
  process.exit(1);
}
