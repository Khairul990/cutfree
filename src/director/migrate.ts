/**
 * Explicit Spec/Blueprint schema migration. Never silently destroy old projects.
 */

import type { Blueprint, BlueprintScene } from '../brain/types';

export const CURRENT_SCHEMA = '2.0.0';

export function migrateBlueprint(raw: Blueprint): Blueprint {
  const bp: Blueprint = JSON.parse(JSON.stringify(raw));
  const ver = String((bp as unknown as { schemaVersion?: string }).schemaVersion || '1.0.0');
  if (ver === CURRENT_SCHEMA) {
    ensureSceneIds(bp);
    return bp;
  }
  // 1.0.0 → 2.0.0: add ids, camera, textAnimation defaults
  if (ver === '1.0.0' || !ver) {
    ensureSceneIds(bp);
    bp.scenes.forEach((sc, i) => {
      const s = sc as BlueprintScene & { camera?: string; textAnimation?: string; purpose?: string };
      if (!s.camera) s.camera = i === 0 ? 'slow_zoom_in' : 'static';
      if (!s.textAnimation) s.textAnimation = 'fade';
      if (!s.purpose) s.purpose = sc.type;
      if (!s.transitionOut) s.transitionOut = 'fade';
    });
    (bp as unknown as { schemaVersion: string }).schemaVersion = CURRENT_SCHEMA;
  }
  return bp;
}

function ensureSceneIds(bp: Blueprint) {
  const seen = new Set<string>();
  bp.scenes.forEach((sc, i) => {
    const s = sc as BlueprintScene & { id?: string };
    if (!s.id || seen.has(s.id)) s.id = `scene_${String(i).padStart(3, '0')}`;
    seen.add(s.id);
  });
}
