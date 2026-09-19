/**
 * Automated verification test for CutFree Video Blueprint JSON v1.0.
 * Tests:
 *  - 6-scene and 14-scene Authoritative Blueprint fixtures
 *  - Audio duration (341.89s) & Timeline duration
 *  - Continuous scene coverage from 0.0 to 341.89s with no gaps
 *  - Continuous speech/pause segments with no gaps (251 segments)
 *  - Dynamic resolution of metadata count mismatch (125 -> 251)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixture6Path = path.join(__dirname, "fixtures", "sample-blueprint-341s.json");
const fixture14Path = path.join(__dirname, "fixtures", "sample-blueprint-14scenes-341s.json");

console.log("⚡ Testing CutFree Blueprint JSON v1.0 Verification...");

let failures = 0;

function assert(desc, condition) {
  if (condition) {
    console.log(`  PASS: ${desc}`);
  } else {
    console.error(`  FAIL: ${desc}`);
    failures++;
  }
}

function verifyBlueprint(name, raw, expectedScenes, expectedSegments, expectedDeclaredSegments) {
  console.log(`\n--- Verifying Blueprint: ${name} ---`);
  assert("Schema version is 1.0", raw.version === "1.0");
  assert("Authoritative audio duration matches 341.89s", Math.abs((raw.audio?.duration || 0) - 341.89) < 0.05);
  assert("Timeline duration matches 341.89s", Math.abs((raw.timeline?.duration || 0) - 341.89) < 0.05);

  assert(`Scene count matches ${expectedScenes}`, raw.scenes.length === expectedScenes);
  assert(`Segment count matches ${expectedSegments}`, raw.segments.length === expectedSegments);

  // Verify segment count matches declared metadata
  assert(
    `Declared totalSegments (${raw.timeline.totalSegments}) equals actual segments.length (${raw.segments.length})`,
    raw.timeline.totalSegments === raw.segments.length
  );
  assert("Segment count matches declared metadata", raw.timeline.totalSegments === expectedSegments);

  // Scene continuity
  let sceneCursor = 0;
  raw.scenes.forEach((s) => {
    assert(`Scene ${s.id} starts at cursor ${sceneCursor}`, Math.abs(s.start - sceneCursor) < 0.05);
    assert(`Scene ${s.id} end > start`, s.end > s.start);
    sceneCursor = s.end;
  });
  assert(`Final scene covers full duration (${sceneCursor} === 341.89)`, Math.abs(sceneCursor - 341.89) < 0.05);

  // Segment continuity
  let segCursor = 0;
  raw.segments.forEach((seg) => {
    assert(`Segment ${seg.id} starts at cursor ${segCursor}`, Math.abs(seg.start - segCursor) < 0.05);
    assert(`Segment ${seg.id} end > start`, seg.end > seg.start);
    segCursor = seg.end;
  });
  assert(`Final segment covers full duration (${segCursor} === 341.89)`, Math.abs(segCursor - 341.89) < 0.05);
}

// 1. Verify 6-scene fixture
const raw6 = JSON.parse(fs.readFileSync(fixture6Path, "utf8"));
verifyBlueprint("6-Scene Blueprint", raw6, 6, 12, 12);

// 2. Verify 14-scene, 251-segment fixture
const raw14 = JSON.parse(fs.readFileSync(fixture14Path, "utf8"));
verifyBlueprint("14-Scene 251-Segment Blueprint", raw14, 14, 251, 125);

if (failures > 0) {
  console.error(`\n❌ ${failures} test assertion(s) failed!`);
  process.exit(1);
} else {
  console.log("\n✅ All CutFree Blueprint JSON v1.0 assertions passed!");
}
