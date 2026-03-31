// visualPatterns.js
// Rich visual type system for nodes and edges.
// Loaded after base.js; overrides TYPES (for edges) and drawNodeShape (for nodes).

// ─── Node shape catalogue ─────────────────────────────────────────────────────
// Cycled independently with Ctrl+F3. n.shapeType overrides n.type for shape.
const NODE_SHAPES = [
	'circle',   // 0 (default)
	'square',   // 1
	'hexagon',  // 2
	'ellipse',  // 3
	'diamond',  // 4
	'rounded',  // 5
];

// ─── Node colour catalogue ────────────────────────────────────────────────────
// Cycled independently with Shift+F3. n.colorType overrides n.type for colour.
const NODE_COLORS = [
	() => cssVar('--type1-color'),  //  0 — blue
	() => cssVar('--type2-color'),  //  1 — green
	() => cssVar('--type3-color'),  //  2 — red
	() => cssVar('--type4-color'),  //  3 — purple
	() => cssVar('--type5-color'),  //  4 — orange
	() => cssVar('--type6-color'),  //  5 — olive
	() => cssVar('--type7-color'),  //  6 — cyan
	() => cssVar('--type8-color'),  //  7 — pink
	() => cssVar('--type9-color'),  //  8 — brown
	() => cssVar('--type10-color'), //  9 — mint
	() => cssVar('--type11-color'), // 10 — grey
	() => cssVar('--type12-color'), // 11 — yellow
	() => cssVar('--type13-color'), // 12 — periwinkle
	() => cssVar('--type14-color'), // 13 — amber
	() => cssVar('--type15-color'), // 14 — lime
	() => cssVar('--type16-color'), // 15 — mauve
];

// ─── Combined node types (used by F3 and NODE_TYPES label) ───────────────────
// Kept for reference; drawNodeShape reads NODE_SHAPES / NODE_COLORS separately.
const NODE_TYPES = NODE_SHAPES.map((shape, i) => ({ shape, color: NODE_COLORS[i] }));

// ─── Edge Types ───────────────────────────────────────────────────────────────
// Each entry: { color: fn, dash: number[] }
const EDGE_TYPES = [
	{ color: () => cssVar('--type1-color'), dash: []              }, // 0 — solid
	{ color: () => cssVar('--type2-color'), dash: [8, 4]          }, // 1 — dashed
	{ color: () => cssVar('--type3-color'), dash: [2, 4]          }, // 2 — dotted
	{ color: () => cssVar('--type4-color'), dash: [12, 4]         }, // 3 — long dash
	{ color: () => cssVar('--type5-color'), dash: [8, 4, 2, 4]   }, // 4 — dash-dot
	{ color: () => cssVar('--type6-color'), dash: [4, 2]          }, // 5 — short dash
];

// Replace the TYPES array used by drawArrow() in base.js.
window.graph.TYPES = EDGE_TYPES;

// Override getEdgeType hook (declared in base.js) to apply category-based edge styles.
// Priority: category style from config > edge.type set by F3 > 0 (default).
window.graph.getEdgeType = function (edge) {
	if (!edge.category) return null; // no category → fall back to edge.type
	const catStyle = window.categoryStyles?.edge?.[edge.category];
	return catStyle != null && catStyle.typeIndex != null ? catStyle.typeIndex : null;
};

// ─── Shape helpers ────────────────────────────────────────────────────────────

function _hexPath(ctx, x, y, r) {
	// Pointy-top hexagon
	for (let i = 0; i < 6; i++) {
		const angle = (Math.PI / 3) * i - Math.PI / 6;
		const px = x + r * Math.cos(angle);
		const py = y + r * Math.sin(angle);
		i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
	}
	ctx.closePath();
}

function _roundedRectPath(ctx, cx, cy, w, h, r) {
	const x = cx - w / 2;
	const y = cy - h / 2;
	ctx.moveTo(x + r, y);
	ctx.lineTo(x + w - r, y);
	ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
	ctx.lineTo(x + w, y + h - r);
	ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
	ctx.lineTo(x + r, y + h);
	ctx.quadraticCurveTo(x, y + h,     x, y + h - r);
	ctx.lineTo(x, y + r);
	ctx.quadraticCurveTo(x, y,         x + r, y);
	ctx.closePath();
}

// ─── Override drawNodeShape ───────────────────────────────────────────────────
// Replace the default circle renderer on the main graph instance.
window.graph.drawNodeShape = function (ctx, n, isSelected) {
	const baseType = n.type ?? 0;
	const catStyle = n.category ? window.categoryStyles?.node?.[n.category] : null;

	// Color priority: explicit Shift+F3 override > category style > base type
	const colorIdx = n.colorType != null
		? n.colorType % NODE_COLORS.length
		: catStyle?.colorIndex != null
			? catStyle.colorIndex % NODE_COLORS.length
			: baseType % NODE_COLORS.length;

	// Shape priority: explicit Ctrl+F3 override > category style > base type
	const shapeIdx = n.shapeType != null
		? n.shapeType % NODE_SHAPES.length
		: catStyle?.shapeIndex != null
			? catStyle.shapeIndex % NODE_SHAPES.length
			: baseType % NODE_SHAPES.length;

	const color = NODE_COLORS[colorIdx]();
	const shape = NODE_SHAPES[shapeIdx];

	ctx.fillStyle   = color;
	ctx.strokeStyle = 'rgba(0,0,0,0.7)';
	ctx.lineWidth   = isSelected ? 4 : 1.5;

	if (isSelected) {
		ctx.shadowColor = color;
		ctx.shadowBlur  = 14;
	}

	ctx.beginPath();
	switch (shape) {
		case 'square':
			ctx.rect(n.x - R, n.y - R, R * 2, R * 2);
			break;
		case 'hexagon':
			_hexPath(ctx, n.x, n.y, R);
			break;
		case 'ellipse':
			ctx.ellipse(n.x, n.y, R * 1.5, R * 0.75, 0, 0, Math.PI * 2);
			break;
		case 'diamond':
			ctx.moveTo(n.x,     n.y - R * 1.2);
			ctx.lineTo(n.x + R, n.y);
			ctx.lineTo(n.x,     n.y + R * 1.2);
			ctx.lineTo(n.x - R, n.y);
			ctx.closePath();
			break;
		case 'rounded':
			_roundedRectPath(ctx, n.x, n.y, R * 2.8, R * 1.6, 6);
			break;
		default: // 'circle'
			ctx.arc(n.x, n.y, R, 0, Math.PI * 2);
			break;
	}

	ctx.fill();
	ctx.stroke();
	ctx.shadowBlur = 0;
};

// ─── Independent shape / colour cycling ──────────────────────────────────────
// Ctrl+F3  → cycle shape only  (sets n.shapeType)
// Shift+F3 → cycle colour only (sets n.colorType)
// Plain F3 is handled by base.js and resets both overrides.
window.addEventListener('keydown', (e) => {
	if (!e.ctrlKey && !e.shiftKey) return;            // only act on modified F3
	if (e.key !== (window.keyBindings?.cycleShape ?? 'F3')) return;
	const tag = e.target.tagName;
	if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

	const targets = window.graph.selectedNodes?.length
		? window.graph.selectedNodes
		: window.graph.selectedNode ? [window.graph.selectedNode] : [];
	if (!targets.length) return;
	e.preventDefault();

	targets.forEach(sel => {
		if (e.ctrlKey) {
			const cur = sel.shapeType ?? sel.type ?? 0;
			sel.shapeType = (cur + 1) % NODE_SHAPES.length;
		} else {
			const cur = sel.colorType ?? sel.type ?? 0;
			sel.colorType = (cur + 1) % NODE_COLORS.length;
		}
	});

	window.graph.draw();
});
