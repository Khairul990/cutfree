/**
 * Automated verification test for CutFree Video Blueprint JSON v1.0.
 * Tests:
 *  - Structure validation
 *  - Authoritative audio duration (341.89s)
 *  - Continuous scene coverage from 0.0 to 341.89s with no gaps
 *  - Continuous speech/pause segments with no gaps
 *  - Derived count integrity
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const fixturePath = path.join(__dirname, "fixtures", "sample-blueprint-341s.json");
const raw = JSON.parse(fs.readFileSync(fixturePath, "utf8"));

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

// 1. Version and project duration
assert("Schema version is 1.0", raw.version === "1.0");
assert("Authoritative audio duration matches 341.89s", raw.audio?.duration === 341.89);
assert("Timeline duration matches 341.89s", raw.timeline?.duration === 341.89);

// 2. Count integrity
assert("Scene count matches actual scenes length", raw.timeline.totalScenes === raw.scenes.length);
assert("Segment count matches actual segments length", raw.timeline.totalSegments === raw.segments.length);

// 3. Scene continuity and total coverage
let sceneCursor = 0;
raw.scenes.forEach((s) => {
  assert(`Scene ${s.id} starts at cursor ${sceneCursor}`, Math.abs(s.start - sceneCursor) < 0.05);
  assert(`Scene ${s.id} end > start`, s.end > s.start);
  sceneCursor = s.end;
});
assert(`Final scene covers full duration (${sceneCursor} === 341.89)`, Math.abs(sceneCursor - 341.89) < 0.05);

// 4. Segment continuity (speech + pause)
let segCursor = 0;
raw.segments.forEach((seg) => {
  assert(`Segment ${seg.id} starts at cursor ${segCursor}`, Math.abs(seg.start - segCursor) < 0.05);
  assert(`Segment ${seg.id} end > start`, seg.end > seg.start);
  segCursor = seg.end;
});
assert(`Final segment covers full duration (${segCursor} === 341.89)`, Math.abs(segCursor - 341.89) < 0.05);

if (failures > 0) {
  console.error(`\n❌ ${failures} test assertion(s) failed!`);
  process.exit(1);
} else {
  console.log("\n✅ All CutFree Blueprint JSON v1.0 assertions passed!");
}
