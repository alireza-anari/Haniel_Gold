/** HANI-EL try-on prototype geometry; normalized landmarks are untrusted estimates. */
export const clamp = (value, min, max) => Math.min(max, Math.max(min, Number(value) || 0));

export function containSize(width, height, maxSide = 2048) {
  if (![width, height, maxSide].every(n => Number.isFinite(n) && n > 0)) throw Error('INVALID_DIMENSIONS');
  const factor = Math.min(1, maxSide / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * factor)), height: Math.max(1, Math.round(height * factor)) };
}

export function mapPointer(clientX, clientY, rect, canvasWidth, canvasHeight) {
  if (!rect?.width || !rect?.height) throw Error('INVALID_CANVAS');
  return { x: (clientX - rect.left) * canvasWidth / rect.width, y: (clientY - rect.top) * canvasHeight / rect.height };
}

export function defaultOverlay(type, imageWidth, imageHeight, itemAspectRatio = 1) {
  const side = Math.min(imageWidth, imageHeight);
  const base = type === 'earring' ? side * 0.105 : type === 'necklace' ? side * 0.36 : side * 0.20;
  return { x: imageWidth * 0.50, y: imageHeight * (type === 'earring' ? 0.43 : 0.64), width: base,
    height: base / clamp(itemAspectRatio, 0.15, 8), rotation: 0 };
}

export function faceAnchor(landmarks, type, width, height, side = 'right') {
  if (!Array.isArray(landmarks) || landmarks.length < 455 || !Number.isFinite(width) || !Number.isFinite(height)) return null;
  const at = idx => {
    const v = landmarks[idx];
    return v && Number.isFinite(v.x) && Number.isFinite(v.y) ? { x: v.x * width, y: v.y * height } : null;
  };
  const leftEdge = at(234), rightEdge = at(454), chin = at(152), forehead = at(10);
  if (!leftEdge || !rightEdge || !chin || !forehead) return null;
  const faceWidth = Math.abs(rightEdge.x - leftEdge.x);
  const faceHeight = Math.abs(chin.y - forehead.y);
  if (faceWidth < width * 0.08 || faceWidth > width * 0.85 || faceHeight < height * 0.08) return null;
  if (type === 'earring') {
    const cheek = side === 'left' ? leftEdge : rightEdge;
    const sign = side === 'left' ? -1 : 1;
    return { x: cheek.x + sign * faceWidth * 0.06, y: cheek.y + faceHeight * 0.13, width: faceWidth * 0.18,
      rotation: Math.atan2(rightEdge.y - leftEdge.y, rightEdge.x - leftEdge.x) * 180 / Math.PI };
  }
  if (type === 'necklace') {
    return { x: (leftEdge.x + rightEdge.x) / 2, y: chin.y + faceHeight * 0.47, width: faceWidth * 0.92, rotation: 0 };
  }
  return null;
}

export function poseNeckAnchor(pose, width, height) {
  if (!Array.isArray(pose) || pose.length < 13) return null;
  const left = pose[11], right = pose[12];
  if (!left || !right || [left.x,left.y,right.x,right.y].some(n => !Number.isFinite(n))) return null;
  if (Math.min(left.visibility ?? 1, right.visibility ?? 1) < 0.55) return null;
  const shoulderWidth = Math.hypot((right.x - left.x) * width, (right.y - left.y) * height);
  if (shoulderWidth < width * 0.15) return null;
  return { x: (left.x + right.x) * width / 2, y: (left.y + right.y) * height / 2 - shoulderWidth * 0.13,
    width: shoulderWidth * 0.58, rotation: Math.atan2((right.y-left.y)*height,(right.x-left.x)*width)*180/Math.PI };
}

/** Constrain extreme user edits; an estimated size is never claimed to match actual dimensions. */
export function normalizeOverlay(overlay, imageWidth, imageHeight) {
  const max = Math.max(imageWidth, imageHeight);
  return { x: clamp(overlay.x, 0, imageWidth), y: clamp(overlay.y, 0, imageHeight),
    width: clamp(overlay.width, 8, max * 1.2), height: clamp(overlay.height, 8, max * 2),
    rotation: clamp(overlay.rotation, -70, 70) };
}