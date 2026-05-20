/**
 * usePinDiagramLayout — shared logic for MpuPinDiagram and ComponentPinDiagram.
 *
 * Handles SVG fetching, blob-URL creation, pin-position parsing, side
 * assignment, top/bottom stagger, canvas layout, and magnifier state.
 */
import { useMemo, useEffect, useState, useRef } from 'react';
import DOMPurify from 'dompurify';
import { parseSvgPinPositions } from '../utils/fritzing';
import {
  assignSides,
  PAD_LEFT, PAD_TOP, PAD_RIGHT, PAD_BOTTOM,
  SIDE_LABEL_W, SIDE_BOARD_GAP,
  LENS_SCREEN_R,
} from '../utils/pinDiagram';

export function usePinDiagramLayout({ svgRaw, svgUrl, pins }) {
  // ── SVG text ───────────────────────────────────────────────────────────────
  const [resolvedSvgRaw, setResolvedSvgRaw] = useState(svgRaw || null);
  useEffect(() => {
    if (svgRaw) { setResolvedSvgRaw(svgRaw); return; }
    if (!svgUrl) return;
    let cancelled = false;
    fetch(svgUrl)
      .then((r) => r.text())
      .then((text) => { if (!cancelled) setResolvedSvgRaw(text); })
      .catch((err) => console.error('Failed to fetch SVG:', err));
    return () => { cancelled = true; };
  }, [svgRaw, svgUrl]);

  // ── Blob URL for the board <image> ────────────────────────────────────────
  const [boardUrl, setBoardUrl] = useState(null);
  useEffect(() => {
    if (!resolvedSvgRaw) return;
    const sanitized = DOMPurify.sanitize(resolvedSvgRaw, {
      USE_PROFILES: { svg: true, svgFilters: true },
    });
    const blob = new Blob([sanitized], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    setBoardUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [resolvedSvgRaw]);

  // ── Magnifier ─────────────────────────────────────────────────────────────
  const svgRef     = useRef(null);
  const [lens, setLens] = useState(null);
  // Stable unique IDs so multiple diagrams on the same page don't clash.
  const lensClipId = useMemo(() => `lens-${Math.random().toString(36).slice(2, 8)}`, []);
  const contentId  = useMemo(() => `dc-${Math.random().toString(36).slice(2, 8)}`, []);

  const handleMouseMove = (e) => {
    const svg = svgRef.current;
    if (!svg) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX;
    pt.y = e.clientY;
    const pos = pt.matrixTransform(ctm.inverse());
    // Convert constant CSS-pixel radius to SVG user units for this SVG's current scale.
    setLens({ x: pos.x, y: pos.y, r: LENS_SCREEN_R / ctm.a });
  };

  // ── Pin geometry ──────────────────────────────────────────────────────────
  const svgIds = useMemo(
    () => (pins || []).map((p) => p.svgId).filter(Boolean),
    [pins],
  );

  const { positions, boardW, boardH } = useMemo(
    () => parseSvgPinPositions(resolvedSvgRaw || '', svgIds),
    [resolvedSvgRaw, svgIds],
  );

  const sides = useMemo(() => {
    if (!boardW || !boardH || !Object.keys(positions).length) return {};
    return assignSides(positions, boardW, boardH);
  }, [positions, boardW, boardH]);

  const tbStagger = useMemo(() => {
    const stagger = {};
    ['top', 'bottom'].forEach((side) => {
      const pinsOnSide = (pins || [])
        .filter((p) => p.svgId && sides[p.svgId] === side)
        .map((p) => ({ id: p.id, svgId: p.svgId, cx: positions[p.svgId]?.cx ?? 0 }))
        .sort((a, b) => a.cx - b.cx);
      pinsOnSide.forEach((p, i) => { stagger[p.id] = i % 2; });
    });
    return stagger;
  }, [pins, sides, positions]);

  const pinLayout = useMemo(() => {
    if (!boardW || !boardH) return {};
    const layout = {};
    (pins || []).forEach((pin) => {
      if (!pin.svgId) return;
      const pos = positions[pin.svgId];
      if (!pos) return;
      const side = sides[pin.svgId];
      if (!side) return;
      layout[pin.id] = { cx: PAD_LEFT + pos.cx, cy: PAD_TOP + pos.cy, side };
    });
    return layout;
  }, [pins, positions, sides, boardW, boardH]);

  // ── Canvas geometry ───────────────────────────────────────────────────────
  const svgW          = PAD_LEFT + boardW + PAD_RIGHT;
  const svgH          = PAD_TOP  + boardH + PAD_BOTTOM;
  const boardX        = PAD_LEFT;
  const boardY        = PAD_TOP;
  const leftLabelRight = boardX - SIDE_BOARD_GAP;
  const leftLabelX    = leftLabelRight - SIDE_LABEL_W;
  const rightLabelLeft = boardX + boardW + SIDE_BOARD_GAP;
  // lensR comes from lens.r (computed per-mousemove from the CTM).
  // Expose as a convenience so components don't need to null-check inside {lens && ...}.
  const lensR         = lens?.r ?? 0;

  return {
    resolvedSvgRaw, boardUrl,
    svgRef, lens, setLens, handleMouseMove, lensClipId, contentId,
    positions, boardW, boardH, sides, tbStagger, pinLayout,
    svgW, svgH, boardX, boardY, leftLabelRight, leftLabelX, rightLabelLeft, lensR,
  };
}
