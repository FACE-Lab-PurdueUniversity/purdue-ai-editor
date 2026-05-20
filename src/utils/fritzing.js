/**
 * Fritzing parsing helpers
 * Converts .fzp XML into normalized connector metadata.
 */

const CONNECTOR_VIEW_PRIORITY = ['breadboardView', 'schematicView', 'pcbView'];

function getFirstViewNode(connectorNode) {
  for (const viewName of CONNECTOR_VIEW_PRIORITY) {
    const view = connectorNode.querySelector(`views > ${viewName} > p`);
    if (view) return view;
  }
  return null;
}

export function parseFritzingModule(xmlText) {
  if (!xmlText || typeof xmlText !== 'string') return null;

  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'text/xml');

  const parserError = doc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Invalid Fritzing XML');
  }

  const moduleNode = doc.querySelector('module');
  if (!moduleNode) {
    throw new Error('Missing module node in Fritzing XML');
  }

  const title = doc.querySelector('title')?.textContent?.trim() || '';
  const label = doc.querySelector('label')?.textContent?.trim() || '';
  const moduleId = moduleNode.getAttribute('moduleId') || '';

  const connectors = Array.from(doc.querySelectorAll('connectors > connector')).map((connectorNode) => {
    const id = connectorNode.getAttribute('id') || '';
    const name = connectorNode.getAttribute('name') || id;
    const type = connectorNode.getAttribute('type') || '';
    const description = connectorNode.querySelector('description')?.textContent?.trim() || '';
    const viewNode = getFirstViewNode(connectorNode);
    const svgId = viewNode?.getAttribute('svgId') || '';

    return {
      id,
      name,
      type,
      description,
      svgId,
    };
  });

  return {
    moduleId,
    title,
    label,
    connectors,
  };
}

/**
 * Converts an SVG dimension attribute (e.g. "45.097mm", "0.75in") to mils.
 * Returns null if the unit is unknown or the value is not parseable.
 */
function parseDimToMils(attr) {
  if (!attr) return null;
  const val = parseFloat(attr);
  if (isNaN(val)) return null;
  if (attr.includes('mm')) return (val / 25.4) * 1000;
  if (attr.includes('cm')) return (val / 2.54) * 1000;
  if (attr.includes('in')) return val * 1000;
  if (attr.includes('px')) return (val / 96) * 1000; // 96 dpi
  if (attr.includes('pt')) return (val / 72) * 1000;
  return null;
}

/**
 * Returns the geometric center of an SVG element in its OWN local user space,
 * ignoring any transforms on the element or its ancestors.
 * Supports <circle>, <ellipse>, <rect>, <line>, <path>, and groups containing them.
 */
function getElementLocalCenter(el) {
  if (!el || !el.tagName) return null;
  const tag = el.tagName.toLowerCase();

  if (tag === 'circle' || tag === 'ellipse') {
    const cx = parseFloat(el.getAttribute('cx'));
    const cy = parseFloat(el.getAttribute('cy'));
    if (!isNaN(cx) && !isNaN(cy)) return { cx, cy };
  }

  if (tag === 'rect') {
    const x = parseFloat(el.getAttribute('x')) || 0;
    const y = parseFloat(el.getAttribute('y')) || 0;
    const w = parseFloat(el.getAttribute('width')) || 0;
    const h = parseFloat(el.getAttribute('height')) || 0;
    return { cx: x + w / 2, cy: y + h / 2 };
  }

  if (tag === 'line') {
    const x1 = parseFloat(el.getAttribute('x1')) || 0;
    const y1 = parseFloat(el.getAttribute('y1')) || 0;
    const x2 = parseFloat(el.getAttribute('x2')) || 0;
    const y2 = parseFloat(el.getAttribute('y2')) || 0;
    return { cx: (x1 + x2) / 2, cy: (y1 + y2) / 2 };
  }

  if (tag === 'path') {
    // Walk the path commands tracking current pen position so relative coords
    // resolve correctly. The first move-to is always absolute per SVG spec.
    const d = el.getAttribute('d') || '';
    const tokens = d.match(/[A-Za-z]|[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g);
    if (!tokens) return null;
    const pts = [];
    let curX = 0, curY = 0;
    let i = 0;
    let lastCmd = '';
    const readNum = () => parseFloat(tokens[i++]);
    while (i < tokens.length) {
      let t = tokens[i];
      if (/^[A-Za-z]$/.test(t)) { lastCmd = t; i++; }
      const cmd = lastCmd;
      const isRel = cmd === cmd.toLowerCase() && cmd !== 'M' && pts.length > 0;
      const c = cmd.toLowerCase();
      if (c === 'm' || c === 'l' || c === 't') {
        const x = readNum(); const y = readNum();
        curX = isRel ? curX + x : x;
        curY = isRel ? curY + y : y;
        pts.push([curX, curY]);
        if (c === 'm') lastCmd = isRel ? 'l' : 'L';
      } else if (c === 'h') {
        const x = readNum();
        curX = isRel ? curX + x : x;
        pts.push([curX, curY]);
      } else if (c === 'v') {
        const y = readNum();
        curY = isRel ? curY + y : y;
        pts.push([curX, curY]);
      } else if (c === 'c') {
        readNum(); readNum(); readNum(); readNum();
        const x = readNum(); const y = readNum();
        curX = isRel ? curX + x : x;
        curY = isRel ? curY + y : y;
        pts.push([curX, curY]);
      } else if (c === 's' || c === 'q') {
        readNum(); readNum();
        const x = readNum(); const y = readNum();
        curX = isRel ? curX + x : x;
        curY = isRel ? curY + y : y;
        pts.push([curX, curY]);
      } else if (c === 'a') {
        readNum(); readNum(); readNum(); readNum(); readNum();
        const x = readNum(); const y = readNum();
        curX = isRel ? curX + x : x;
        curY = isRel ? curY + y : y;
        pts.push([curX, curY]);
      } else if (c === 'z') {
        // close path — nothing to read
      } else {
        i++; // unknown token, skip
      }
    }
    if (pts.length === 0) return null;
    // Use bounding-box center of all traced points
    let minX = pts[0][0], maxX = pts[0][0], minY = pts[0][1], maxY = pts[0][1];
    for (const [px, py] of pts) {
      if (px < minX) minX = px; if (px > maxX) maxX = px;
      if (py < minY) minY = py; if (py > maxY) maxY = py;
    }
    return { cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
  }

  // Group or unknown tag — look at children for a shape we recognize
  if (el.children && el.children.length > 0) {
    for (const child of el.children) {
      const c = getElementLocalCenter(child);
      if (c) return c;
    }
  }
  return null;
}

/**
 * Parses an SVG transform="..." attribute into a DOMMatrix.
 * Handles translate, scale, rotate, matrix. Skew commands are uncommon in
 * Fritzing breadboard SVGs.
 */
function parseTransformToMatrix(transformStr) {
  const matrix = new DOMMatrix();
  if (!transformStr) return matrix;
  const re = /(\w+)\s*\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(transformStr)) !== null) {
    const fn = m[1].toLowerCase();
    const args = m[2].split(/[,\s]+/).filter((s) => s.length > 0).map(parseFloat);
    if (args.some(isNaN)) continue;
    if (fn === 'translate') {
      matrix.translateSelf(args[0] || 0, args[1] || 0);
    } else if (fn === 'scale') {
      const sx = args[0];
      const sy = args.length > 1 ? args[1] : sx;
      matrix.scaleSelf(sx, sy);
    } else if (fn === 'rotate') {
      const angle = args[0];
      if (args.length >= 3) {
        matrix.translateSelf(args[1], args[2]).rotateSelf(angle).translateSelf(-args[1], -args[2]);
      } else {
        matrix.rotateSelf(angle);
      }
    } else if (fn === 'matrix' && args.length >= 6) {
      matrix.multiplySelf(new DOMMatrix([args[0], args[1], args[2], args[3], args[4], args[5]]));
    }
  }
  return matrix;
}

/**
 * Composes the cumulative transform from the SVG root down to (and including)
 * the given element. The result maps a point in the element's local user space
 * to the SVG's user (viewBox) space.
 */
function composeAncestorTransform(el, rootSvg) {
  // Collect ancestor chain from root → element (inclusive)
  const chain = [];
  let node = el;
  while (node && node !== rootSvg) {
    chain.unshift(node);
    node = node.parentElement;
  }
  let matrix = new DOMMatrix();
  for (const n of chain) {
    const t = n.getAttribute && n.getAttribute('transform');
    if (t) matrix = matrix.multiply(parseTransformToMatrix(t));
  }
  return matrix;
}

/**
 * Parses a Fritzing breadboard SVG and returns pin positions keyed by svgId.
 *
 * Pass the list of svgIds from the parsed FZP connectors so each pin is looked
 * up by its exact element ID. Composes ancestor transforms manually so it
 * handles all element types and transform-heavy SVGs (e.g. MPU-6050, US-100).
 *
 * Returns { positions: { [svgId]: {cx, cy} }, boardW, boardH }.
 */
export function parseSvgPinPositions(svgRaw, svgIds = []) {
  if (!svgRaw || typeof svgRaw !== 'string') {
    return { positions: {}, boardW: 0, boardH: 0 };
  }

  const parser = new DOMParser();
  const doc = parser.parseFromString(svgRaw, 'image/svg+xml');
  const svgEl = doc.querySelector('svg');
  if (!svgEl) return { positions: {}, boardW: 0, boardH: 0 };

  const viewBoxParts = (svgEl.getAttribute('viewBox') || '').split(/[\s,]+/).map(Number);
  let vbW = viewBoxParts[2] || 0;
  let vbH = viewBoxParts[3] || 0;

  // Some Fritzing breadboard SVGs omit viewBox and only supply width/height
  // (e.g. US-100, MPU-6050 GY-521). Fall back so we still have a coord space.
  if (!vbW || !vbH) {
    const wAttr = svgEl.getAttribute('width');
    const hAttr = svgEl.getAttribute('height');
    const w = wAttr != null ? parseFloat(wAttr) : NaN;
    const h = hAttr != null ? parseFloat(hAttr) : NaN;
    if (!isNaN(w) && !isNaN(h) && w > 0 && h > 0) {
      vbW = w;
      vbH = h;
    }
  }

  if (!vbW || !vbH) return { positions: {}, boardW: 0, boardH: 0 };

  // Normalize to a consistent 10-mil coordinate unit so label/board proportions
  // look correct regardless of the SVG's internal viewBox scale.
  let scaleX = 1;
  let scaleY = 1;
  const widthMils = parseDimToMils(svgEl.getAttribute('width'));
  const heightMils = parseDimToMils(svgEl.getAttribute('height'));
  if (widthMils && vbW) scaleX = (widthMils / vbW) / 10;
  if (heightMils && vbH) scaleY = (heightMils / vbH) / 10;

  const boardW = vbW * scaleX;
  const boardH = vbH * scaleY;

  const positions = {};
  const idsToFind = svgIds.length > 0 ? [...new Set(svgIds.filter(Boolean))] : null;

  const measurePin = (el) => {
    if (!el) return null;
    const local = getElementLocalCenter(el);
    if (!local) return null;
    const matrix = composeAncestorTransform(el, svgEl);
    const pt = new DOMPoint(local.cx, local.cy).matrixTransform(matrix);
    return { cx: pt.x * scaleX, cy: pt.y * scaleY };
  };

  if (idsToFind) {
    idsToFind.forEach((svgId) => {
      const el = doc.getElementById(svgId);
      const pos = measurePin(el);
      if (pos) positions[svgId] = pos;
    });
  } else {
    doc.querySelectorAll('[id]').forEach((el) => {
      const rawId = el.getAttribute('id') || '';
      const match = rawId.match(/^(connector\d+)pin$/);
      if (!match) return;
      const pinKey = `${match[1]}pin`;
      if (pinKey in positions) return;
      const pos = measurePin(el);
      if (pos) positions[pinKey] = pos;
    });
  }

  return { positions, boardW, boardH };
}

export function makeConnectorLabel(componentName, connector) {
  if (!componentName || !connector) return '';
  if (connector.name) return `${componentName} ${connector.name}`;
  return `${componentName} ${connector.id || 'pin'}`;
}
