/**
 * MpuPinDiagram — visual SVG-based pin mapper.
 *
 * Displays a Fritzing breadboard SVG with clickable pin labels arranged
 * spatially around the board image, connected to their actual pin locations
 * by small lines.  Works with any MPU that has svg_raw data.
 *
 * Side detection: clusters pins by shared cx/cy to identify horizontal rows
 * (top/bottom) vs vertical columns (left/right), which handles both tall
 * boards (Pico W) and wide boards (Arduino Uno) correctly.
 */
import { usePinDiagramLayout } from '../hooks/usePinDiagramLayout';
import {
  getPrimaryLabel, trunc, ZOOM,
  SIDE_LABEL_H, SIDE_LABEL_HALF_H, SIDE_LABEL_W, 
  TB_LABEL_W, TB_LABEL_H, TB_NEAR, TB_FAR,
} from '../utils/pinDiagram';
import { getMappingEntries } from '../services/hardwareConfig';
import './MpuPinDiagram.css';

const MpuPinDiagram = ({
  svgRaw,
  svgUrl,
  pins,
  mappings,
  activePinId,
  hoveredPinId,
  onPinClick,
  onPinHover,
  onClearMapping,
}) => {
  const {
    resolvedSvgRaw, boardUrl,
    svgRef, lens, setLens, handleMouseMove, lensClipId, contentId,
    boardW, boardH, tbStagger, pinLayout,
    svgW, svgH, boardX, boardY, leftLabelRight, leftLabelX, rightLabelLeft, lensR,
  } = usePinDiagramLayout({ svgRaw, svgUrl, pins });

  const getMappingPreview = (mappingEntries, maxLen = 18) => {
    if (!mappingEntries.length) return '';
    const firstLabel = mappingEntries[0].label || mappingEntries[0].componentPinId;
    if (mappingEntries.length === 1) return trunc(firstLabel, maxLen);
    return trunc(`${firstLabel} +${mappingEntries.length - 1}`, maxLen);
  };

  if (!resolvedSvgRaw) {
    return <p className="mpu-diagram-placeholder">Loading board diagram…</p>;
  }
  if (!boardW || !boardH) {
    return <p className="mpu-diagram-placeholder">No SVG data available for this MPU.</p>;
  }

  return (
    <svg
      ref={svgRef}
      viewBox={`0 0 ${svgW} ${svgH}`}
      className="mpu-pin-diagram"
      xmlns="http://www.w3.org/2000/svg"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setLens(null)}
    >
      {/* ── Content group — also referenced by the magnifier lens ── */}
      <g id={contentId}>
        {boardUrl && (
          <image
            href={boardUrl}
            x={boardX}
            y={boardY}
            width={boardW}
            height={boardH}
            preserveAspectRatio="xMidYMid meet"
          />
        )}

        {(pins || []).map((pin) => {
          const layout = pinLayout[pin.id];
          if (!layout) return null;

          const { cx: pinX, cy: pinY, side } = layout;
          const isActive  = activePinId === pin.id;
          const isHovered = hoveredPinId === pin.id;
          const mappingEntries = getMappingEntries(mappings?.[pin.id]);
          const isMapped  = mappingEntries.length > 0;
          const mappingPreview = getMappingPreview(mappingEntries);

          const fillColor   = isActive ? '#dbeafe' : isMapped ? '#dcfce7' : isHovered ? '#f1f5f9' : '#f8fafc';
          const strokeColor = isActive ? '#3b82f6' : isMapped ? '#16a34a' : '#cbd5e1';
          const textColor   = isActive ? '#1d4ed8' : isMapped ? '#15803d' : '#374151';
          const lineColor   = isActive ? '#93c5fd' : isMapped ? '#86efac' : '#e2e8f0';
          const lineW       = isActive || isMapped ? 0.65 : 0.45;
          const dotFill     = isActive ? '#3b82f6' : isMapped ? '#16a34a' : '#94a3b8';
          const primary     = getPrimaryLabel(pin);

          const handlers = {
            style: { cursor: 'pointer' },
            onClick: () => onPinClick(pin.id),
            onMouseEnter: () => onPinHover?.(pin.id),
            onMouseLeave: () => onPinHover?.(null),
          };

          // ── Left ───────────────────────────────────────────────────────────
          if (side === 'left') {
            const labelY   = pinY - SIDE_LABEL_HALF_H;
            const pinNameX = leftLabelX + SIDE_LABEL_W - 2;
            const mappingX = leftLabelX + 2;
            const clearCx  = leftLabelX + 3.6;

            return (
              <g key={pin.id} {...handlers}>
                <line x1={leftLabelRight} y1={pinY} x2={pinX} y2={pinY} stroke={lineColor} strokeWidth={lineW} />
                <rect x={leftLabelX} y={labelY} width={SIDE_LABEL_W} height={SIDE_LABEL_H} rx="1.3" fill={fillColor} stroke={strokeColor} strokeWidth="0.5" />
                <text x={pinNameX} y={pinY + 0.3} fontSize="2.9" fontWeight="600" fill={textColor} textAnchor="end" dominantBaseline="middle" fontFamily="ui-monospace,monospace">{primary}</text>
                {isActive ? (
                  <text x={mappingX} y={pinY + 0.3} fontSize="2.5" fill="#2563eb" textAnchor="start" dominantBaseline="middle">← select component pin</text>
                ) : isMapped ? (
                  <text x={mappingX + 6} y={pinY + 0.3} fontSize="2.6" fill={textColor} textAnchor="start" dominantBaseline="middle">{mappingPreview}</text>
                ) : null}
                {isMapped && !isActive && (
                  <g onClick={(e) => { e.stopPropagation(); onClearMapping?.(pin.id); }} style={{ cursor: 'pointer' }}>
                    <circle cx={clearCx} cy={pinY} r={2.3} fill="#fee2e2" stroke="#fca5a5" strokeWidth="0.4" />
                    <text x={clearCx} y={pinY + 0.4} fontSize="3.8" fill="#dc2626" textAnchor="middle" dominantBaseline="middle" fontWeight="bold">×</text>
                  </g>
                )}
                <circle cx={pinX} cy={pinY} r={1.3} fill={dotFill} stroke="white" strokeWidth="0.4" />
              </g>
            );
          }

          // ── Right ──────────────────────────────────────────────────────────
          if (side === 'right') {
            const labelY   = pinY - SIDE_LABEL_HALF_H;
            const pinNameX = rightLabelLeft + 2;
            const mappingX = rightLabelLeft + SIDE_LABEL_W - 2;
            const clearCx  = rightLabelLeft + SIDE_LABEL_W - 3.6;

            return (
              <g key={pin.id} {...handlers}>
                <line x1={pinX} y1={pinY} x2={rightLabelLeft} y2={pinY} stroke={lineColor} strokeWidth={lineW} />
                <rect x={rightLabelLeft} y={labelY} width={SIDE_LABEL_W} height={SIDE_LABEL_H} rx="1.3" fill={fillColor} stroke={strokeColor} strokeWidth="0.5" />
                <text x={pinNameX} y={pinY + 0.3} fontSize="2.9" fontWeight="600" fill={textColor} textAnchor="start" dominantBaseline="middle" fontFamily="ui-monospace,monospace">{primary}</text>
                {isActive ? (
                  <text x={mappingX} y={pinY + 0.3} fontSize="2.5" fill="#2563eb" textAnchor="end" dominantBaseline="middle">select component pin →</text>
                ) : isMapped ? (
                  <text x={mappingX - 6} y={pinY + 0.3} fontSize="2.6" fill={textColor} textAnchor="end" dominantBaseline="middle">{mappingPreview}</text>
                ) : null}
                {isMapped && !isActive && (
                  <g onClick={(e) => { e.stopPropagation(); onClearMapping?.(pin.id); }} style={{ cursor: 'pointer' }}>
                    <circle cx={clearCx} cy={pinY} r={2.3} fill="#fee2e2" stroke="#fca5a5" strokeWidth="0.4" />
                    <text x={clearCx} y={pinY + 0.4} fontSize="3.8" fill="#dc2626" textAnchor="middle" dominantBaseline="middle" fontWeight="bold">×</text>
                  </g>
                )}
                <circle cx={pinX} cy={pinY} r={1.3} fill={dotFill} stroke="white" strokeWidth="0.4" />
              </g>
            );
          }

          // ── Top / Bottom ───────────────────────────────────────────────────
          if (side === 'top' || side === 'bottom') {
            const staggerIdx = tbStagger[pin.id] ?? 0;
            const dist       = staggerIdx === 0 ? TB_NEAR : TB_FAR;
            const labelX     = pinX - TB_LABEL_W / 2;
            let labelY, lineY1, lineY2;
            if (side === 'top') {
              labelY = boardY - dist - TB_LABEL_H;
              lineY1 = labelY + TB_LABEL_H;
              lineY2 = pinY;
            } else {
              labelY = boardY + boardH + dist;
              lineY1 = pinY;
              lineY2 = labelY;
            }
            const labelCY = labelY + TB_LABEL_H / 2;

            return (
              <g key={pin.id} {...handlers}>
                <line x1={pinX} y1={lineY1} x2={pinX} y2={lineY2} stroke={lineColor} strokeWidth={lineW} />
                <rect x={labelX} y={labelY} width={TB_LABEL_W} height={TB_LABEL_H} rx="1.2" fill={fillColor} stroke={strokeColor} strokeWidth="0.5" />
                <text x={pinX} y={labelCY + 0.3} fontSize="2.6" fontWeight="600" fill={textColor} textAnchor="middle" dominantBaseline="middle" fontFamily="ui-monospace,monospace">
                  {trunc(primary, 7)}
                </text>
                {isMapped && !isActive && (
                  <g onClick={(e) => { e.stopPropagation(); onClearMapping?.(pin.id); }} style={{ cursor: 'pointer' }}>
                    <circle cx={pinX + TB_LABEL_W / 2 - 2} cy={labelCY} r={2} fill="#fee2e2" stroke="#fca5a5" strokeWidth="0.35" />
                    <text x={pinX + TB_LABEL_W / 2 - 2} y={labelCY + 0.3} fontSize="3.2" fill="#dc2626" textAnchor="middle" dominantBaseline="middle" fontWeight="bold">×</text>
                  </g>
                )}
                <circle cx={pinX} cy={pinY} r={1.3} fill={dotFill} stroke="white" strokeWidth="0.4" />
              </g>
            );
          }

          return null;
        })}
      </g>

      {/* ── Magnifier lens — zooms the full content group ── */}
      {lens && (
        <g style={{ pointerEvents: 'none' }}>
          <defs>
            <clipPath id={lensClipId}>
              <circle cx={lens.x} cy={lens.y} r={lensR} />
            </clipPath>
          </defs>
          {/* White background covers the original content beneath the lens */}
          <circle cx={lens.x} cy={lens.y} r={lensR * ZOOM} fill="white" />
          <g
            clipPath={`url(#${lensClipId})`}
            transform={`translate(${lens.x * (1 - ZOOM)},${lens.y * (1 - ZOOM)}) scale(${ZOOM})`}
          >
            <use href={`#${contentId}`} />
          </g>
          <circle cx={lens.x} cy={lens.y} r={lensR * ZOOM} fill="none" stroke="#475569" strokeWidth="1.2" opacity="0.8" />
        </g>
      )}
    </svg>
  );
};

export default MpuPinDiagram;
