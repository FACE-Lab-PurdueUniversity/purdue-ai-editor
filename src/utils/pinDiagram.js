// Shared layout constants and pure helpers for MpuPinDiagram / ComponentPinDiagram.

export const SIDE_LABEL_W      = 50;
export const SIDE_LABEL_H      = 7;
export const SIDE_LABEL_HALF_H = SIDE_LABEL_H / 2;
export const SIDE_BOARD_GAP    = 9;

export const TB_LABEL_W = 20;
export const TB_LABEL_H = 7;
export const TB_NEAR    = 10;
export const TB_FAR     = TB_NEAR + TB_LABEL_H + 2;

export const PAD_LEFT   = SIDE_LABEL_W + SIDE_BOARD_GAP + 2;
export const PAD_RIGHT  = SIDE_LABEL_W + SIDE_BOARD_GAP + 2;
export const PAD_TOP    = TB_FAR + TB_LABEL_H + 3;
export const PAD_BOTTOM = TB_FAR + TB_LABEL_H + 3;

export const LENS_SCREEN_R = 50
export const ZOOM = 2;

/**
 * Groups pins into sides by clustering: pins sharing a similar x-coordinate
 * form left/right groups; pins sharing a similar y form top/bottom groups.
 * Falls back to nearest-edge for isolated pins.
 */
export function assignSides(positions, boardW, boardH) {
  const CX_TOL = boardW * 0.06;
  const CY_TOL = boardH * 0.06;
  const entries = Object.entries(positions);
  const sides = {};
  entries.forEach(([id, { cx, cy }]) => {
    const sameCol = entries.filter(([, p]) => Math.abs(p.cx - cx) <= CX_TOL);
    const sameRow = entries.filter(([, p]) => Math.abs(p.cy - cy) <= CY_TOL);
    if (sameCol.length >= sameRow.length && sameCol.length >= 3) {
      sides[id] = cx <= boardW / 2 ? 'left' : 'right';
    } else if (sameRow.length >= 3) {
      sides[id] = cy <= boardH / 2 ? 'top' : 'bottom';
    } else {
      const dists = [
        ['left',   cx / boardW],
        ['right',  (boardW - cx) / boardW],
        ['top',    cy / boardH],
        ['bottom', (boardH - cy) / boardH],
      ];
      sides[id] = dists.reduce((a, b) => (a[1] < b[1] ? a : b))[0];
    }
  });
  return sides;
}

export function getPrimaryLabel(pin) {
  if (!pin.description) return pin.name;
  const first = pin.description.split('/')[0].trim();
  return first.split(' ')[0];
}

export function trunc(str, maxLen) {
  if (!str || str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}
