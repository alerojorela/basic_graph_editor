/* https://github.com/alerojorela/basic_graph_editor */

// ── Module-level constants (outside class) ────────────────────────────────────
const canvas = document.getElementById('canvas');
const DBLCLICK_DELAY = 300; // ms — double-click detection for middle button

/** Pure CSS-variable helper; stays global so visualPatterns.js can call it. */
function cssVar(name) {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}


// ── GraphEditor class ─────────────────────────────────────────────────────────

class GraphEditor {
	/**
	 * @param {HTMLCanvasElement} canvas
	 * @param {{ interactive?: boolean }} options
	 *   interactive=true  → attach mouse/keyboard event handlers (main editor)
	 *   interactive=false → render-only instance (e.g. preview canvas)
	 */
	constructor(canvas, { interactive = true } = {}) {
		this.canvas = canvas;
		this.ctx    = canvas.getContext('2d');
		this.R      = window.R ?? 20;

		// Config flags (read once from window.* set by config.js)
		this.editableText  = window.editableText  ?? true;
		this.enableTooltip = window.enableTooltip ?? true;
		this.tooltipAlign  = window.tooltipAlign  ?? 'left';
		this._keyBindings  = window.keyBindings   ?? { rename: 'F2', cycleType: 'F3', toggleLock: 'F4', delete: 'Delete' };

		// Default edge-type catalogue (visualPatterns.js replaces via alias setter)
		this.TYPES = [
			{ color: () => cssVar('--type1-color'), dash: [] },
			{ color: () => cssVar('--type2-color'), dash: [6, 4] },
			{ color: () => cssVar('--type3-color'), dash: [2, 4] },
			{ color: () => cssVar('--type4-color'), dash: [10, 4] },
			{ color: () => cssVar('--type5-color'), dash: [] },
			{ color: () => cssVar('--type6-color'), dash: [4, 1] },
		];

		// ── Graph data ────────────────────────────────────────────────────────
		this.nodes = [];
		this.edges = [];
		this.dirty = false; // true whenever unsaved changes exist

		// ── Selection ─────────────────────────────────────────────────────────
		this.selectedNode  = null;
		this.selectedEdge  = null;
		this.selectedNodes = []; // multi-selection set

		// ── Drag / creation state ─────────────────────────────────────────────
		this.draggingNode  = null;
		this.draggingFrom  = null;
		this.creatingNode  = null;
		this.creatingEdge  = false;
		this._newSourceNode = false; // true when a brand-new node was created as edge source

		// ── Rubber-band selection ─────────────────────────────────────────────
		this._rubberBandStart  = null; // world-space start {x, y}
		this._rubberBandActive = false;

		// ── Persistence ───────────────────────────────────────────────────────
		this._loadedFilename = 'graph.json';

		// ── Edge drag ─────────────────────────────────────────────────────────
		this.draggingEdge    = null;
		this.draggingEdgeEnd = null;
		this.edgeBackup      = null;

		// ── Undo / Redo ───────────────────────────────────────────────────────
		this._undoStack = []; // max 6 snapshots
		this._redoStack = [];

		// ── Clipboard ─────────────────────────────────────────────────────────
		this._clipboard = null;

		// ── Mouse / pan / zoom ────────────────────────────────────────────────
		this.mouse    = { x: 0, y: 0 };
		this.hoverNode = null;
		this.offsetX  = 0;
		this.offsetY  = 0;
		this.scale    = 1;
		this.panning  = false;
		this.panStart = { x: 0, y: 0 };
		this._lastMiddleClickTime = 0;

		// ── Embedding and read-only ───────────────────────────────────────────
		// Element the canvas should size itself to. Null → the canvas's own
		// parent, or the window when that parent is <body>. See resizeCanvas().
		this.container = null;
		// Whole-graph read-only. This is NOT `node.lock` / `edge.lock`, which
		// pin one element each: this freezes the graph as a whole, so a panel
		// can show a source that must not be edited while its twin is edited.
		// **Off by default and nothing in this repository turns it on**: the
		// machinery is here so an embedder does not have to bolt it on from
		// outside, which is what the transformation fork had to do — capturing
		// mousedown, contextmenu, dblclick and keydown before they arrived.
		this.readOnly = false;

		// ── Hooks (external modules assign these) ─────────────────────────────
		// Called whenever selected node/edge changes.
		this.onSelectionChange       = null;
		// Called at the end of every draw(). Use to reposition overlays.
		this.onPostDraw              = null;
		// Called on node double-click. Overrides default prompt.
		this.doubleclickFunction     = null;
		// Called on edge double-click. Overrides default prompt.
		this.doubleclickEdgeFunction = null;
		// Resolves visual type index for an edge. Return null → fall back to edge.type.
		this.getEdgeType             = null;
		// string[] | null — set by an external module to enable right-click context menu on nodes.
		// Each string becomes a menu item; selecting one creates an outgoing connected node.
		this.nodeContextOptions      = null;
		this._ctxMenu                = null; // active context menu DOM element

		// ── Overridable node renderer (visualPatterns.js replaces this) ───────
		this.drawNodeShape = (ctx, n, isSel) => this._defaultDrawNodeShape(ctx, n, isSel);

		if (interactive) {
			this._bindEvents();
			this.resizeCanvas();
			window.addEventListener('resize', () => { this.resizeCanvas(); this.draw(); });
		}
	}


	// ── Viewport ──────────────────────────────────────────────────────────────

	/**
	 * Size the canvas to whatever holds it.
	 *
	 * This used to be `window.innerWidth/innerHeight` flat out, which said, in
	 * effect, that this editor **is** the page. It works while there is one of
	 * them and nothing else on screen, and it is the single reason the editor
	 * could not be embedded: the transformation fork had to monkey-patch this
	 * method from outside just to fit the editor into one half of a split view.
	 *
	 * Resolution order, most explicit first:
	 *   1. `this.container`, if an embedder set one. Say what you mean.
	 *   2. The canvas's **own** CSS box, when the canvas is not a direct child
	 *      of `<body>` — someone who put it inside a layout meant the layout to
	 *      decide. Its own box and not its parent's: two panels share a parent,
	 *      so measuring the parent gives them both the full width and they end
	 *      up drawing on top of each other.
	 *   3. The window, which is what a full-page editor wants and what every
	 *      page written against the old editor gets, unchanged: the canvas hangs
	 *      off `<body>` there, so rule 2 does not fire.
	 *
	 * A canvas with no CSS size falls back to its intrinsic 300×150, which is
	 * never what anyone wants here; that is what the last guard is for.
	 */
	resizeCanvas() {
		let width, height;
		if (this.container) {
			width  = this.container.clientWidth;
			height = this.container.clientHeight;
		} else if (this.canvas.parentElement && this.canvas.parentElement !== document.body) {
			width  = this.canvas.clientWidth;
			height = this.canvas.clientHeight;
		}
		this.canvas.width  = width  || window.innerWidth;
		this.canvas.height = height || window.innerHeight;
	}

	/**
	 * Bring one node to the middle of the viewport, keeping the current zoom.
	 *
	 * `centerGraph()` frames everything; this frames one thing, which is what a
	 * second panel needs in order to follow the first, and what a search result
	 * or a history jump wants too. Nothing in this repository calls it yet.
	 */
	centerOn(nodeId) {
		const node = this.nodes.find(n => n.id === nodeId);
		if (!node) return;
		this.offsetX = this.canvas.width  / 2 - node.x * this.scale;
		this.offsetY = this.canvas.height / 2 - node.y * this.scale;
		this.draw();
	}

	reset() {
		this.offsetX = 0;
		this.offsetY = 0;
		this.scale   = 1;
		this.panning  = false;
		this.panStart = { x: 0, y: 0 };
	}

	centerGraph(margin = 80) {
		if (this.nodes.length === 0) return;

		this.resizeCanvas();
		const R = this.R;
		let minX = Infinity, maxX = -Infinity;
		let minY = Infinity, maxY = -Infinity;

		this.nodes.forEach(n => {
			minX = Math.min(minX, n.x - R);
			maxX = Math.max(maxX, n.x + R);
			minY = Math.min(minY, n.y - R);
			maxY = Math.max(maxY, n.y + R);
		});

		const graphWidth  = maxX - minX;
		const graphHeight = maxY - minY;
		if (graphWidth === 0 || graphHeight === 0) return;

		const scaleX = (this.canvas.width  - margin * 2) / graphWidth;
		const scaleY = (this.canvas.height - margin * 2) / graphHeight;
		this.scale = Math.min(scaleX, scaleY);

		const graphCenterX = (minX + maxX) / 2;
		const graphCenterY = (minY + maxY) / 2;
		this.offsetX = this.canvas.width  / 2 - graphCenterX * this.scale;
		this.offsetY = this.canvas.height / 2 - graphCenterY * this.scale;

		this.draw();
	}

	redraw() {
		this.reset();
		const mode = window.activeLayout ?? 'elk-mrtree';
		applyLayout(this.nodes, this.edges, mode);
		this.centerGraph();
	}


	// ── Drawing ───────────────────────────────────────────────────────────────

	drawArrow(from, to, edge) {
		const ctx    = this.ctx;
		const typeIdx = (typeof this.getEdgeType === 'function' ? this.getEdgeType(edge) : null) ?? (edge.type ?? 0);
		const typeObj = this.TYPES[typeIdx];
		const color  = typeObj.color();
		const R      = this.R;
		const directed = edge.directed ?? typeObj.directed ?? true;

		const angle = Math.atan2(to.y - from.y, to.x - from.x);
		const head  = 10;

		const tx = directed ? to.x - Math.cos(angle) * R : to.x;
		const ty = directed ? to.y - Math.sin(angle) * R : to.y;

		ctx.strokeStyle = color;
		ctx.fillStyle   = color;
		ctx.lineWidth   = edge === this.selectedEdge ? 4 : 2;
		ctx.setLineDash(typeObj.dash);

		ctx.beginPath();
		ctx.moveTo(from.x, from.y);
		ctx.lineTo(tx, ty);
		ctx.stroke();

		ctx.setLineDash([]);
		if (directed) {
			ctx.beginPath();
			ctx.moveTo(tx, ty);
			ctx.lineTo(tx - head * Math.cos(angle - Math.PI / 6), ty - head * Math.sin(angle - Math.PI / 6));
			ctx.lineTo(tx - head * Math.cos(angle + Math.PI / 6), ty - head * Math.sin(angle + Math.PI / 6));
			ctx.closePath();
			ctx.fill();
		}

		const _eLabel = (window.edgeLabelFields || ['label'])
			.map(f => edge[f]).find(v => v != null && v !== '');
		if (_eLabel) {
			ctx.font         = '12px Arial';
			ctx.textAlign    = 'center';
			ctx.textBaseline = 'middle';
			ctx.lineWidth    = 3;
			ctx.strokeStyle  = cssVar('--bg-color');
			ctx.strokeText(_eLabel, (from.x + to.x) / 2, (from.y + to.y) / 2 - 5);
			ctx.fillStyle    = cssVar('--ui-text');
			ctx.fillText(_eLabel,   (from.x + to.x) / 2, (from.y + to.y) / 2 - 5);
		}

		if (edge.lock) {
			ctx.fillStyle = 'gold';
			ctx.beginPath();
			ctx.arc((from.x + to.x) / 2, (from.y + to.y) / 2, 5, 0, Math.PI * 2);
			ctx.fill();
		}
	}

	drawTooltip(node) {
		let text;
		const tooltipFields = window.nodeTooltipFields;
		if (tooltipFields && tooltipFields.length) {
			const parts = tooltipFields.map(f => node[f]).filter(v => v != null && v !== '');
			text = parts.length ? parts.join('\n') : null;
		} else {
			text = node.tooltip || null;
		}
		if (!this.enableTooltip || !text) return;

		const ctx    = this.ctx;
		const lines  = text.split('\n');
		ctx.font = '12px Arial';

		const padding    = 6;
		const lineHeight = 14;
		const textWidth  = Math.max(...lines.map(l => ctx.measureText(l).width));
		const boxWidth   = textWidth + padding * 2;

		const baseX = this.mouse.x * this.scale + this.offsetX;
		const baseY = this.mouse.y * this.scale + this.offsetY;

		let x, textX;
		switch (this.tooltipAlign) {
			case 'right':
				x     = baseX - boxWidth - 10;
				textX = x + boxWidth - padding;
				ctx.textAlign = 'right';
				break;
			case 'center':
				x     = baseX - boxWidth / 2;
				textX = x + boxWidth / 2;
				ctx.textAlign = 'center';
				break;
			default: // 'left'
				x     = baseX + 10;
				textX = x + padding;
				ctx.textAlign = 'left';
		}

		const y = baseY + 10;
		ctx.setTransform(1, 0, 0, 1, 0, 0);

		// Fondo del tooltip. Sin él el texto va en blanco sobre nada, y sobre un
		// grafo claro no se lee. Viene del fork de transformation, 2026-06-03.
		const boxHeight = lines.length * lineHeight + padding * 2;
		ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
		ctx.fillRect(x, y, boxWidth, boxHeight);

		ctx.fillStyle    = 'white';
		ctx.textBaseline = 'top';
		lines.forEach((line, i) => {
			ctx.fillText(line, textX, y + padding + i * lineHeight);
		});
	}

	_defaultDrawNodeShape(ctx, n, isSelected) {
		const color = this.TYPES[n.type ?? 0].color();

		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.arc(n.x, n.y, this.R, 0, Math.PI * 2);
		ctx.fill();

		ctx.lineWidth   = isSelected ? 4 : 1.5;
		ctx.strokeStyle = 'rgba(0,0,0,0.7)';

		if (isSelected) {
			ctx.shadowColor = color;
			ctx.shadowBlur  = 12;
		}
		ctx.stroke();
		ctx.shadowBlur = 0;
	}

	draw() {
		const ctx   = this.ctx;
		this.hoverNode = null;

		ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
		ctx.clearRect(
			-this.offsetX / this.scale,
			-this.offsetY / this.scale,
			this.canvas.width  / this.scale,
			this.canvas.height / this.scale,
		);

		this.edges.forEach(e => this.drawArrow(e.from, e.to, e));

		if (this.creatingEdge && this.creatingNode) {
			ctx.setLineDash([5, 5]);
			this.drawArrow(this.creatingNode, this.mouse, { type: 0, label: '' });
			ctx.setLineDash([]);
		}

		this.nodes.forEach(n => {
			if (Math.hypot(n.x - this.mouse.x, n.y - this.mouse.y) <= this.R) {
				this.hoverNode = n;
			}

			this.drawNodeShape(ctx, n, n === this.selectedNode || this.selectedNodes.includes(n));

			const _nLabel = (window.nodeLabelFields || ['label'])
				.map(f => n[f]).find(v => v != null && v !== '');
			if (_nLabel) {
				ctx.font         = '10px Arial';
				ctx.textAlign    = 'center';
				ctx.textBaseline = 'middle';
				ctx.shadowColor  = 'rgba(0,0,0,0.75)';
				ctx.shadowBlur   = 4;
				ctx.fillStyle    = 'white';
				ctx.fillText(_nLabel, n.x, n.y);
				ctx.shadowBlur = 0;
			}

			if (n.lock) {
				ctx.fillStyle = 'gold';
				ctx.beginPath();
				ctx.arc(n.x, n.y, 6, 0, Math.PI * 2);
				ctx.fill();
			}
		});

		// Rubber-band selection rectangle
		if (this._rubberBandActive && this._rubberBandStart) {
			const rbx = Math.min(this._rubberBandStart.x, this.mouse.x);
			const rby = Math.min(this._rubberBandStart.y, this.mouse.y);
			const rbw = Math.abs(this.mouse.x - this._rubberBandStart.x);
			const rbh = Math.abs(this.mouse.y - this._rubberBandStart.y);
			ctx.strokeStyle = cssVar('--ui-focus');
			ctx.lineWidth   = 1 / this.scale;
			ctx.setLineDash([4 / this.scale, 4 / this.scale]);
			ctx.strokeRect(rbx, rby, rbw, rbh);
			ctx.setLineDash([]);
			ctx.save();
			ctx.globalAlpha = 0.12;
			ctx.fillStyle   = cssVar('--ui-focus');
			ctx.fillRect(rbx, rby, rbw, rbh);
			ctx.restore();
		}

		ctx.setTransform(1, 0, 0, 1, 0, 0);

		if (this.hoverNode) this.drawTooltip(this.hoverNode);
		if (typeof this.onPostDraw === 'function') this.onPostDraw();
	}


	// ── Hit testing ───────────────────────────────────────────────────────────

	nodeAt(x, y) {
		return this.nodes.find(n => Math.hypot(n.x - x, n.y - y) <= this.R);
	}

	edgeAt(x, y) {
		function dist(px, py, x1, y1, x2, y2) {
			const A = px - x1, B = py - y1, C = x2 - x1, D = y2 - y1;
			const t = Math.max(0, Math.min(1, (A * C + B * D) / (C * C + D * D)));
			return Math.hypot(x1 + t * C - px, y1 + t * D - py);
		}
		return this.edges.find(e => dist(x, y, e.from.x, e.from.y, e.to.x, e.to.y) < 6);
	}

	edgeExists(from, to) {
		return this.edges.some(e => e.from === from && e.to === to);
	}

	closestEnd(edge, x, y) {
		const dFrom = Math.hypot(edge.from.x - x, edge.from.y - y);
		const dTo   = Math.hypot(edge.to.x   - x, edge.to.y   - y);
		return dFrom < dTo ? 'from' : 'to';
	}

	/** BFS over undirected adjacency — selects all nodes in the same connected component. */
	_selectComponent(node) {
		const visited = new Set([node]);
		const queue   = [node];
		while (queue.length > 0) {
			const cur = queue.shift();
			for (const edge of this.edges) {
				const neighbor = edge.from === cur ? edge.to
				               : edge.to   === cur ? edge.from
				               : null;
				if (neighbor && !visited.has(neighbor)) {
					visited.add(neighbor);
					queue.push(neighbor);
				}
			}
		}
		this.selectedNodes = [...visited];
		this.selectedNode  = node;
		this.selectedEdge  = null;
	}


	// ── Utilities ─────────────────────────────────────────────────────────────

	randomId() {
		let id;
		do {
			id = Math.random().toString(36).slice(2) + Date.now().toString(36);
		} while (this.nodes.some(n => n.id === id));
		return id;
	}

	// Sets insertionDate and modificationDate on a node or edge.
	// isNew=true → also initialises insertionDate.
	// Do NOT call for x/y/lock-only changes.
	touchElement(el, isNew) {
		const now = new Date().toISOString();
		if (isNew || !el.insertionDate) el.insertionDate = now;
		el.modificationDate = now;
		this.dirty = true;
	}


	// ── Undo / Redo ───────────────────────────────────────────────────────────

	/** Call BEFORE any discrete mutation to enable undo. */
	recordAction() {
		this._undoStack.push(this._serializeGraph());
		if (this._undoStack.length > 6) this._undoStack.shift();
		this._redoStack = [];
	}

	_serializeGraph() {
		return JSON.stringify({
			nodes: this.nodes.map(n => ({ ...n })),
			edges: this.edges.map(e => ({
				...e,
				from: e.from?.id ?? null,
				to:   e.to?.id   ?? null,
			})),
		});
	}

	_restoreSnapshot(json) {
		const data    = JSON.parse(json);
		const nodeMap = new Map(data.nodes.map(n => [n.id, n]));
		this.nodes = data.nodes;
		this.edges = data.edges
			.map(e => ({ ...e, from: nodeMap.get(e.from), to: nodeMap.get(e.to) }))
			.filter(e => e.from && e.to);

		const selId     = this.selectedNode?.id ?? null;
		const selFromId = this.selectedEdge?.from?.id ?? null;
		const selToId   = this.selectedEdge?.to?.id   ?? null;
		this.selectedNode  = selId
			? (this.nodes.find(n => n.id === selId) ?? null) : null;
		this.selectedEdge  = selFromId
			? (this.edges.find(e => e.from?.id === selFromId && e.to?.id === selToId) ?? null) : null;
		this.selectedNodes = this.selectedNodes
			.map(n => this.nodes.find(nd => nd.id === n.id)).filter(Boolean);

		this.dirty = true;
		if (typeof this.onSelectionChange === 'function') {
			this.onSelectionChange(this.selectedNode, this.selectedEdge);
		}
		this.draw();
	}

	undo() {
		if (!this._undoStack.length) return;
		this._redoStack.push(this._serializeGraph());
		this._restoreSnapshot(this._undoStack.pop());
	}

	redo() {
		if (!this._redoStack.length) return;
		this._undoStack.push(this._serializeGraph());
		this._restoreSnapshot(this._redoStack.pop());
	}


	// ── Clipboard ─────────────────────────────────────────────────────────────

	_copySelection() {
		const nodes = this.selectedNodes.length > 0 ? this.selectedNodes
		            : this.selectedNode ? [this.selectedNode] : [];
		if (!nodes.length) return;
		const nodeIds = new Set(nodes.map(n => n.id));
		const edges   = this.edges.filter(e => nodeIds.has(e.from.id) && nodeIds.has(e.to.id));
		this._clipboard = {
			nodes: nodes.map(n => ({ ...n })),
			edges: edges.map(e => ({ ...e, from: e.from.id, to: e.to.id })),
		};
		navigator.clipboard?.writeText(JSON.stringify(this._clipboard)).catch(() => {});
	}

	async _pasteClipboard() {
		let data = this._clipboard;
		try {
			const text   = await navigator.clipboard.readText();
			const parsed = JSON.parse(text);
			if (parsed?.nodes && parsed?.edges) data = parsed;
		} catch (_) {}
		if (!data) return;

		this.recordAction();
		const OFFSET   = 30;
		const idMap    = new Map();
		const newNodes = data.nodes.map(n => {
			const newId = this.randomId();
			idMap.set(n.id, newId);
			return { ...n, id: newId, x: n.x + OFFSET, y: n.y + OFFSET };
		});
		const newEdges = data.edges
			.map(e => ({
				...e,
				from: newNodes.find(n => n.id === idMap.get(e.from)),
				to:   newNodes.find(n => n.id === idMap.get(e.to)),
			}))
			.filter(e => e.from && e.to);

		newNodes.forEach(n => this.nodes.push(n));
		newEdges.forEach(e => this.edges.push(e));
		this.selectedNodes = [...newNodes];
		this.selectedNode  = newNodes[newNodes.length - 1] ?? null;
		this.selectedEdge  = null;
		this.dirty = true;
		if (typeof this.onSelectionChange === 'function') {
			this.onSelectionChange(this.selectedNode, this.selectedEdge);
		}
		this.draw();
	}


	// ── Graph operations ──────────────────────────────────────────────────────

	resetState() {
		this.nodes = [];
		this.edges = [];

		this.selectedNode  = null;
		this.selectedEdge  = null;
		this.selectedNodes = [];

		this.draggingNode  = null;
		this.draggingFrom  = null;
		this.creatingNode  = null;
		this.creatingEdge  = false;
		this._newSourceNode = false;

		this._rubberBandStart  = null;
		this._rubberBandActive = false;

		this.draggingEdge    = null;
		this.draggingEdgeEnd = null;
		this.edgeBackup      = null;

		this.mouse     = { x: 0, y: 0 };
		this.hoverNode = null;
	}

	isEmptyGraph() {
		return this.nodes.length === 0;
	}

	newGraph() {
		this.nodes = [];
		this.edges = [];
		this.selectedNode = null;
		this.selectedEdge = null;
		this.dirty = false;
		this.draw();
	}

	/**
	 * This graph as plain `{nodes, edges}`, with defaults left out.
	 *
	 * Split out of `saveGraph()` so that turning a graph into data and writing
	 * a file stop being the same act. They were, and it is why this editor
	 * could only ever hold one graph: the only way to serialise was to
	 * download. document.js needs the first half without the second, because a
	 * file may now carry several of these.
	 */
	toJSON() {
		const NODE_DEF = { type: 0, lock: false, tooltip: '', text: '', description: '', notes: '', links: '' };
		const EDGE_DEF = { type: 0, lock: false, label: '' };

		function _strip(obj, defaults) {
			const out = {};
			for (const [k, v] of Object.entries(obj)) {
				if (v === undefined || v === null) continue;
				if (k in defaults && v === defaults[k]) continue;
				out[k] = v;
			}
			return out;
		}

		return {
			nodes: this.nodes.map(n => _strip({ ...n }, NODE_DEF)),
			edges: this.edges.map(e => {
				const { from, to, ...rest } = e;
				return _strip({ ...rest, from: from.id, to: to.id }, EDGE_DEF);
			}),
		};
	}

	/**
	 * Fill this graph from plain `{nodes, edges}`. The other half of toJSON().
	 *
	 * Edges arrive holding node **ids** and end up holding node **objects**,
	 * which is what everything else here expects. An edge whose endpoints are
	 * not in the file is dropped rather than left dangling.
	 */
	fromJSON(data) {
		this.nodes = (data?.nodes ?? []).map(n => ({ x: 0, y: 0, label: '', type: 0, lock: false, ...n }));
		this.edges = (data?.edges ?? []).map(e => ({
			label: '', type: 0, lock: false,
			...e,
			from: this.nodes.find(n => n.id === e.from),
			to:   this.nodes.find(n => n.id === e.to),
		})).filter(e => e.from && e.to);
		this.dirty = false;
	}

	saveGraph() {
		const data = this.toJSON();

		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const a = document.createElement('a');
		a.href     = URL.createObjectURL(blob);
		a.download = this._loadedFilename;
		a.click();
		this.dirty = false;
	}

	loadGraph(e) {
		const file = e.target.files[0];
		if (!file) return;
		this._loadedFilename = file.name;

		const reader = new FileReader();
		reader.onload = () => {
			this.fromJSON(JSON.parse(reader.result));
			this.centerGraph();
		};
		reader.readAsText(file);
	}


	// ── Node context menu ─────────────────────────────────────────────────────

	_showContextMenu(sourceNode, screenX, screenY) {
		this._hideContextMenu();
		const menu = document.createElement('div');
		menu.className = 'graph-ctx-menu';
		menu.style.left = `${screenX}px`;
		menu.style.top  = `${screenY}px`;

		this.nodeContextOptions.forEach(option => {
			const item = document.createElement('div');
			item.className   = 'graph-ctx-item';
			item.textContent = option;
			item.addEventListener('mousedown', e => e.stopPropagation());
			item.addEventListener('click', () => {
				this._hideContextMenu();
				this._createConnectedNode(sourceNode, option);
			});
			menu.appendChild(item);
		});

		document.body.appendChild(menu);
		this._ctxMenu = menu;

		const dismiss = e => { if (!menu.contains(e.target)) this._hideContextMenu(); };
		const escape  = e => { if (e.key === 'Escape') this._hideContextMenu(); };
		setTimeout(() => document.addEventListener('mousedown', dismiss), 0);
		document.addEventListener('keydown', escape);
		menu._dismiss = dismiss;
		menu._escape  = escape;
	}

	_hideContextMenu() {
		if (!this._ctxMenu) return;
		const menu = this._ctxMenu;
		if (menu._dismiss) document.removeEventListener('mousedown', menu._dismiss);
		if (menu._escape)  document.removeEventListener('keydown',   menu._escape);
		menu.remove();
		this._ctxMenu = null;
	}

	_createConnectedNode(sourceNode, category) {
		this.recordAction();
		const newNode = {
			id: this.randomId(),
			x:  sourceNode.x + this.R * 6,
			y:  sourceNode.y,
			label: '', type: 0, lock: false, category,
		};
		this.nodes.push(newNode);
		this.touchElement(newNode, true);

		const newEdge = { from: sourceNode, to: newNode, label: '', type: 0, lock: false };
		this.edges.push(newEdge);
		this.touchElement(newEdge, true);

		this.selectedNode  = newNode;
		this.selectedEdge  = null;
		this.selectedNodes = [];
		if (typeof this.onSelectionChange === 'function') {
			this.onSelectionChange(this.selectedNode, this.selectedEdge);
		}
		this.draw();
	}


	// ── Event binding ─────────────────────────────────────────────────────────

	_bindEvents() {
		this.canvas.addEventListener('contextmenu', e => e.preventDefault());

		this.canvas.addEventListener('mousedown',  e => this._handleMouseDown(e));
		this.canvas.addEventListener('mousemove',  e => this._handleMouseMove(e));
		this.canvas.addEventListener('mouseup',    e => this._handleMouseUp(e));
		this.canvas.addEventListener('dblclick',   e => this._handleDblClick(e));
		this.canvas.addEventListener('wheel',      e => this._handleWheel(e), { passive: false });

		window.addEventListener('keydown', e => this._handleKeyDown(e));
	}


	// ── Mouse handlers ────────────────────────────────────────────────────────

	_handleMouseDown(e) {
		const mouseX = e.offsetX;
		const mouseY = e.offsetY;

		if (e.button === 1) { // middle button
			const now = Date.now();
			if (now - this._lastMiddleClickTime < DBLCLICK_DELAY) {
				this._lastMiddleClickTime = 0;
				this.centerGraph();
				return;
			}
			this._lastMiddleClickTime = now;
			this.panning  = true;
			this.panStart.x = mouseX;
			this.panStart.y = mouseY;
			return;
		}

		if (e.button === 2) { // right button
			// Read-only stops here, not earlier: panning with the middle button
			// and selecting with the left one stay alive, because looking at a
			// frozen graph and picking things out of it is the point of freezing
			// it. What is blocked is everything that changes it.
			if (this.readOnly) return;
			if (e.ctrlKey) {
				e.preventDefault();
				const wx = (e.offsetX - this.offsetX) / this.scale;
				const wy = (e.offsetY - this.offsetY) / this.scale;
				_openSubgraphModal(wx, wy);
				return;
			}
			this.recordAction();
			this.selectedNodes = [];
			const n = this.nodeAt(this.mouse.x, this.mouse.y);
			if (n) {
				this.creatingNode  = n;
				this._newSourceNode = false;
			} else {
				this.creatingNode = {
					id: this.randomId(),
					x: this.mouse.x, y: this.mouse.y,
					label: '', type: 0, lock: false,
				};
				this.nodes.push(this.creatingNode);
				this.touchElement(this.creatingNode, true);
				this._newSourceNode = true;
			}
			this.creatingEdge = true;
		}

		if (e.button === 0) { // left button
			const hitNode = this.nodeAt(this.mouse.x, this.mouse.y);
			const hitEdge = hitNode ? null : this.edgeAt(this.mouse.x, this.mouse.y);

			if (hitNode) {
				if (e.ctrlKey) {
					if (this.selectedNodes.length === 0 && this.selectedNode) {
						this.selectedNodes.push(this.selectedNode);
					}
					const idx = this.selectedNodes.indexOf(hitNode);
					if (idx >= 0) this.selectedNodes.splice(idx, 1);
					else          this.selectedNodes.push(hitNode);
					this.selectedNode = this.selectedNodes[this.selectedNodes.length - 1] ?? null;
					this.selectedEdge = null;
				} else {
					if (!this.selectedNodes.includes(hitNode)) this.selectedNodes = [];
					this.selectedNode  = hitNode;
					this.selectedEdge  = null;
					this.draggingNode  = hitNode;
				}
			} else if (hitEdge) {
				this.selectedNodes = [];
				this.selectedNode  = null;
				this.selectedEdge  = hitEdge;
				if (e.ctrlKey) {
					this.recordAction();
					const tmp    = hitEdge.from;
					hitEdge.from = hitEdge.to;
					hitEdge.to   = tmp;
					this.dirty = true;
				} else {
					this.recordAction();
					this.draggingEdge    = hitEdge;
					this.draggingEdgeEnd = this.closestEnd(hitEdge, this.mouse.x, this.mouse.y);
					this.edgeBackup      = { from: hitEdge.from, to: hitEdge.to };
				}
			} else {
				if (!e.ctrlKey) {
					this.selectedNode  = null;
					this.selectedEdge  = null;
					this.selectedNodes = [];
				}
				this._rubberBandStart  = { x: this.mouse.x, y: this.mouse.y };
				this._rubberBandActive = true;
			}

			if (typeof this.onSelectionChange === 'function') {
				this.onSelectionChange(this.selectedNode, this.selectedEdge);
			}
		}

		this.draw();
	}

	_handleMouseMove(e) {
		const mouseX = e.offsetX;
		const mouseY = e.offsetY;

		if (this.panning) {
			this.offsetX += mouseX - this.panStart.x;
			this.offsetY += mouseY - this.panStart.y;
			this.panStart.x = mouseX;
			this.panStart.y = mouseY;
			this.draw();
			return;
		}

		this.mouse.x = (mouseX - this.offsetX) / this.scale;
		this.mouse.y = (mouseY - this.offsetY) / this.scale;

		if (this.draggingNode) {
			if (this.selectedNodes.length > 0 && this.selectedNodes.includes(this.draggingNode)) {
				const dx = this.mouse.x - this.draggingNode.x;
				const dy = this.mouse.y - this.draggingNode.y;
				this.selectedNodes.forEach(n => { n.x += dx; n.y += dy; });
			} else {
				this.draggingNode.x = this.mouse.x;
				this.draggingNode.y = this.mouse.y;
			}
			this.dirty = true;
		}

		if (this.draggingEdge) {
			if (this.draggingEdgeEnd === 'from') this.draggingEdge.from = { x: this.mouse.x, y: this.mouse.y };
			else                                  this.draggingEdge.to   = { x: this.mouse.x, y: this.mouse.y };
			this.dirty = true;
		}

		this.draw();
	}

	_handleMouseUp(e) {
		if (e.button === 1) {
			this.panning = false;
			return;
		}

		// Finish rubber-band selection
		if (e.button === 0 && this._rubberBandActive) {
			if (this._rubberBandStart) {
				const x1 = Math.min(this._rubberBandStart.x, this.mouse.x);
				const x2 = Math.max(this._rubberBandStart.x, this.mouse.x);
				const y1 = Math.min(this._rubberBandStart.y, this.mouse.y);
				const y2 = Math.max(this._rubberBandStart.y, this.mouse.y);
				if (x2 - x1 > 4 || y2 - y1 > 4) {
					this.selectedNodes = this.nodes.filter(n => n.x >= x1 && n.x <= x2 && n.y >= y1 && n.y <= y2);
					this.selectedNode  = this.selectedNodes[this.selectedNodes.length - 1] ?? null;
					this.selectedEdge  = null;
					if (typeof this.onSelectionChange === 'function') {
						this.onSelectionChange(this.selectedNode, this.selectedEdge);
					}
				}
			}
			this._rubberBandActive = false;
			this._rubberBandStart  = null;
			this.draw();
			return;
		}

		if (e.button === 2 && this.creatingEdge && this.creatingNode) {
			let target     = this.nodeAt(this.mouse.x, this.mouse.y);
			const isNewTarget = !target;
			if (!target) {
				target = {
					id: this.randomId(),
					x: this.mouse.x, y: this.mouse.y,
					label: '', type: 0, lock: false,
				};
				this.nodes.push(target);
				this.touchElement(target, true);
			}
			if (target !== this.creatingNode && !this.edgeExists(this.creatingNode, target)) {
				const newEdge = { from: this.creatingNode, to: target, label: '', type: 0, lock: false };
				this.edges.push(newEdge);
				this.touchElement(newEdge, true);
				if (isNewTarget) {
					this.selectedNode = target;
					this.selectedEdge = null;
					if (typeof this.onSelectionChange === 'function') {
						this.onSelectionChange(this.selectedNode, this.selectedEdge);
					}
				}
			} else if (target === this.creatingNode && this._newSourceNode) {
				this.selectedNode = this.creatingNode;
				this.selectedEdge = null;
				if (typeof this.onSelectionChange === 'function') {
					this.onSelectionChange(this.selectedNode, this.selectedEdge);
				}
			} else if (target === this.creatingNode && !this._newSourceNode) {
				// Right-click released on the same existing node (no drag) → context menu
				if (this.nodeContextOptions?.length) {
					this._showContextMenu(target, e.clientX, e.clientY);
				}
			}
			this._newSourceNode = false;
			this.creatingNode   = null;
			this.creatingEdge   = false;
		}

		if (this.draggingEdge) {
			const target = this.nodeAt(this.mouse.x, this.mouse.y);
			if (target) {
				this.draggingEdge[this.draggingEdgeEnd] = target;
			} else {
				this.draggingEdge.from = this.edgeBackup.from;
				this.draggingEdge.to   = this.edgeBackup.to;
			}
			this.draggingEdge    = null;
			this.draggingEdgeEnd = null;
			this.edgeBackup      = null;
		}

		this.draggingNode = null;
		this.draw();
	}

	_handleDblClick(e) {
		if (this.readOnly) return;
		const x = (e.offsetX - this.offsetX) / this.scale;
		const y = (e.offsetY - this.offsetY) / this.scale;

		const n = this.nodeAt(x, y);
		if (n) {
			if (e.ctrlKey) {
				this._selectComponent(n);
			} else if (this.doubleclickFunction) {
				this.doubleclickFunction(n);
			} else {
				const t = prompt('Node label:', n.label);
				if (t !== null) { this.recordAction(); n.label = t; this.dirty = true; }
			}
			if (typeof this.onSelectionChange === 'function') {
				this.onSelectionChange(this.selectedNode, this.selectedEdge);
			}
			this.draw();
			return;
		}

		const edge = this.edgeAt(x, y);
		if (edge) {
			if (typeof this.doubleclickEdgeFunction === 'function') {
				this.doubleclickEdgeFunction(edge);
			} else {
				const t = prompt('Edge label:', edge.label);
				if (t !== null) { this.recordAction(); edge.label = t; this.dirty = true; }
			}
			if (typeof this.onSelectionChange === 'function') {
				this.onSelectionChange(this.selectedNode, this.selectedEdge);
			}
			this.draw();
		}
	}

	_handleWheel(e) {
		e.preventDefault();
		const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;

		if (e.ctrlKey) {
			// Scale node positions in world space about the mouse pivot
			const px = this.mouse.x;
			const py = this.mouse.y;
			const targets = this.selectedNodes.length ? this.selectedNodes : this.nodes;
			targets.forEach(n => {
				n.x = px + (n.x - px) * factor;
				n.y = py + (n.y - py) * factor;
			});
			this.dirty = true;
			this.draw();
		} else {
			// Viewport zoom — keep the point under the cursor fixed
			const x = (e.offsetX - this.offsetX) / this.scale;
			const y = (e.offsetY - this.offsetY) / this.scale;
			this.scale  *= factor;
			this.offsetX = e.offsetX - x * this.scale;
			this.offsetY = e.offsetY - y * this.scale;
			this.draw();
		}
	}

	_handleKeyDown(e) {
		// **Only the focused editor answers the keyboard.**
		//
		// This handler is bound to `window` and not to the canvas, because a
		// graph editor's keys have to work while the pointer sits anywhere on
		// the page. With one editor that is fine; with two there are two
		// listeners on the same window and **both** of them answered every
		// keystroke, so Ctrl+Z undid in both panels at once, and F2 renamed in
		// both if both had a selection.
		//
		// The undo stacks were already per editor. What was wrong was the
		// delivery, not the data. With MAX_PANELS = 1 this is always true.
		if (window.graph && window.graph !== this) return;
		const tag = e.target.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
		// Every binding below this line writes: undo, redo, paste, rename,
		// cycle type, lock, delete. Copy is the exception and it is let through,
		// since taking a copy out of a frozen graph harms nothing.
		if (this.readOnly && !(e.ctrlKey && e.code === 'KeyC')) return;

		// ── Undo / Redo / Copy / Paste ────────────────────────────────────────
		if (e.ctrlKey && !e.shiftKey && e.code === 'KeyZ') { e.preventDefault(); this.undo(); return; }
		if (e.ctrlKey && (e.code === 'KeyY' || (e.shiftKey && e.code === 'KeyZ'))) { e.preventDefault(); this.redo(); return; }
		if (e.ctrlKey && e.code === 'KeyC') { this._copySelection(); return; }
		if (e.ctrlKey && e.code === 'KeyV') { e.preventDefault(); this._pasteClipboard(); return; }

		const kb = this._keyBindings;

		if (this.editableText && e.key === kb.rename) {
			e.preventDefault();
			if (this.selectedNodes.length > 0) {
				const t = prompt('Node label (applies to all selected):', this.selectedNode?.label ?? '');
				if (t !== null) { this.recordAction(); this.selectedNodes.forEach(n => { n.label = t; this.touchElement(n, false); }); }
			} else if (this.selectedNode) {
				const t = prompt('Node label:', this.selectedNode.label);
				if (t !== null) { this.recordAction(); this.selectedNode.label = t; this.touchElement(this.selectedNode, false); }
			} else if (this.selectedEdge) {
				const t = prompt('Edge label:', this.selectedEdge.label);
				if (t !== null) { this.recordAction(); this.selectedEdge.label = t; this.touchElement(this.selectedEdge, false); }
			}
			if (typeof this.onSelectionChange === 'function') {
				this.onSelectionChange(this.selectedNode, this.selectedEdge);
			}
			this.draw();
		}

		// F3 without modifiers: cycle category or type index.
		// Ctrl+F3 / Shift+F3 are handled by visualPatterns.js.
		if (e.key === kb.cycleType && !e.ctrlKey && !e.shiftKey) {
			e.preventDefault();
			if (!this.selectedNodes.length && !this.selectedNode && !this.selectedEdge) return;
			this.recordAction();
			const _applyF3 = (el, isNode, newVal, useCategory) => {
				if (useCategory) {
					el.category = newVal;
				} else {
					el.type = newVal;
				}
				if (isNode) { delete el.shapeType; delete el.colorType; }
				this.touchElement(el, false);
			};
			if (this.selectedNodes.length > 0) {
				// Compute next value from the first node, apply to all
				const first = this.selectedNodes[0];
				const schema   = window.nodeSchema;
				const catEnum  = window.f3CyclesCategory && schema?.category?.enum;
				const useCategory = !!(catEnum && catEnum.length);
				const nextVal  = useCategory
					? catEnum[(catEnum.indexOf(first.category) + 1) % catEnum.length]
					: ((first.type ?? 0) + 1) % this.TYPES.length;
				this.selectedNodes.forEach(n => _applyF3(n, true, nextVal, useCategory));
			} else if (this.selectedNode) {
				const n = this.selectedNode;
				const schema   = window.nodeSchema;
				const catEnum  = window.f3CyclesCategory && schema?.category?.enum;
				const useCategory = !!(catEnum && catEnum.length);
				const nextVal  = useCategory
					? catEnum[(catEnum.indexOf(n.category) + 1) % catEnum.length]
					: ((n.type ?? 0) + 1) % this.TYPES.length;
				_applyF3(n, true, nextVal, useCategory);
			} else if (this.selectedEdge) {
				const ed = this.selectedEdge;
				ed.type = ((ed.type ?? 0) + 1) % this.TYPES.length;
				this.touchElement(ed, false);
			}
			if (typeof this.onSelectionChange === 'function') {
				this.onSelectionChange(this.selectedNode, this.selectedEdge);
			}
			this.draw();
		}

		if (e.key === kb.toggleLock) {
			e.preventDefault();
			if (!this.selectedNodes.length && !this.selectedNode && !this.selectedEdge) return;
			this.recordAction();
			if (this.selectedNodes.length > 0) {
				const allLocked = this.selectedNodes.every(n => n.lock);
				this.selectedNodes.forEach(n => { n.lock = !allLocked; });
			} else if (this.selectedNode) {
				this.selectedNode.lock = !this.selectedNode.lock;
			} else if (this.selectedEdge) {
				this.selectedEdge.lock = !this.selectedEdge.lock;
			}
			this.dirty = true;
			if (typeof this.onSelectionChange === 'function') {
				this.onSelectionChange(this.selectedNode, this.selectedEdge);
			}
			this.draw();
		}

		if (e.key === kb.delete || e.key === 'Supr') {
			if (!this.selectedNodes.length && !this.selectedNode && !this.selectedEdge) return;
			this.recordAction();
			if (this.selectedNodes.length > 0) {
				const toDelete = this.selectedNodes.filter(n => !n.lock);
				toDelete.forEach(n => {
					this.edges = this.edges.filter(ed => ed.from !== n && ed.to !== n);
					this.nodes = this.nodes.filter(nd => nd !== n);
				});
				this.selectedNodes = this.selectedNodes.filter(n => !toDelete.includes(n));
				if (this.selectedNode && toDelete.includes(this.selectedNode)) {
					this.selectedNode = this.selectedNodes[this.selectedNodes.length - 1] ?? null;
				}
			} else if (this.selectedNode) {
				if (!this.selectedNode.lock) {
					this.edges = this.edges.filter(ed => ed.from !== this.selectedNode && ed.to !== this.selectedNode);
					this.nodes = this.nodes.filter(n => n !== this.selectedNode);
					this.selectedNode = null;
				}
			} else if (this.selectedEdge) {
				if (!this.selectedEdge.lock) {
					this.edges = this.edges.filter(ed => ed !== this.selectedEdge);
					this.selectedEdge = null;
				}
			}
			this.dirty = true;
			if (typeof this.onSelectionChange === 'function') {
				this.onSelectionChange(this.selectedNode, this.selectedEdge);
			}
			this.draw();
		}
	}
}


// ── Panels ────────────────────────────────────────────────────────────────────
//
// How many editors this page may hold **at most**. The name says ceiling and
// means it: the document decides how many panels are actually in use, and it
// decides it from the file — a group holding one graph opens one panel on a
// page built for two. See `show()` in document.js.
//
// At one, and one is the whole of what changes at that value: a single
// instance, `window.graph` pointing at it and never moving, and not one extra
// listener bound. Raise it and the editor can show several graphs side by side.
//
// Two things have to agree for a second panel to appear, and that is on purpose:
// this constant sets the ceiling, and the page decides what actually exists by
// putting `<canvas id="canvas2">` in the HTML. The editor does not build its own
// layout — where the panels sit, and how wide, is the page's business and not
// this file's.
//
// Why the ceiling exists at all: the transformation fork
// (`graph_lab/transformation/`) already runs two of these, and it had to reach
// in from outside to do it — reusing `window.graph` as its panel A and calling
// `new GraphEditor(...)` by hand for panel B. It works, which is the evidence
// that the class was multi-instance all along; what was missing was the editor
// admitting it.
const MAX_PANELS = 2;

// Which canvases actually exist. The constant sets the ceiling; the page
// decides what is really there.
const panelCanvases = [];
for (let i = 0; i < MAX_PANELS; i++) {
	const element = i === 0 ? canvas : document.getElementById(`canvas${i + 1}`);
	if (!element) {
		console.warn(`MAX_PANELS is ${MAX_PANELS} but there is no <canvas id="canvas${i + 1}">.`);
		break;
	}
	panelCanvases.push(element);
}

// **This class goes on before a single editor is built, and the order is the
// whole point.** The stylesheet hides #canvas2 until it appears, so with it set
// afterwards every editor measured itself against a layout with one visible
// panel and they all came out full width, drawing on top of each other. The
// constructor calls resizeCanvas(), so the layout has to be final by then.
document.body.classList.add(`panels-${panelCanvases.length}`);

// The canvases the page offers but this build did not take. The stylesheet used
// to hide them by name, one rule per canvas; here the number is known, so the
// page can carry four and a build with two turns the other two off.
document.querySelectorAll('#panels canvas').forEach(element => {
	if (!panelCanvases.includes(element)) element.style.display = 'none';
});

/** Every live editor, in panel order. `editors[0]` is the historical one. */
const editors = panelCanvases.map(element => new GraphEditor(element));
window.editors = editors;

// A canvas that measures itself against a box has to watch that box, and the
// window's `resize` event is not enough for it: the panels also change width
// when the properties drawer collapses, when a late stylesheet lands, or when
// whoever embeds this decides to drag a splitter. None of those resize the
// window, and until something asks again the canvas keeps a buffer that no
// longer matches its box — which is the difference between a crisp drawing and
// a stretched one.
if (typeof ResizeObserver === 'function') {
	const watcher = new ResizeObserver(() => {
		editors.forEach(e => { e.resizeCanvas(); e.draw(); });
	});
	const box = document.getElementById('panels');
	if (box) watcher.observe(box); else editors.forEach(e => watcher.observe(e.canvas));
} else {
	// Old browser: at least catch the layout settling after load.
	window.addEventListener('load', () => {
		editors.forEach(e => { e.resizeCanvas(); e.draw(); });
	});
}

const graph = editors[0];

// **`window.graph` means "the editor with the focus", not "the editor".**
//
// With one panel there is no difference and it never gets reassigned. With more
// than one, this is what lets propertiesEditor.js, nodeHistory.js, search.js and
// the rest keep working untouched: between them they read `window.graph` some
// fifty times, and rather than thread an editor argument through all of it, the
// global follows the click. The properties panel edits what you just clicked,
// the search searches where you are looking.
window.graph = graph;

function setActiveEditor(editor) {
	if (!editor || editor === window.graph) return;
	window.graph = editor;
	editors.forEach(e => e.canvas.classList.toggle('is-active', e === editor));
	if (typeof window.onActiveEditorChange === 'function') window.onActiveEditorChange(editor);
}
window.setActiveEditor = setActiveEditor;

// Only worth binding when there is something to switch between. A single-panel
// page ends up with exactly the listeners it had before this block existed.
if (editors.length > 1) {
	// The first panel starts focused, and it has to be said out loud: the guard
	// in setActiveEditor() returns early when the editor is already the active
	// one, so calling it here would paint nothing and the page would open with
	// no panel marked.
	editors[0].canvas.classList.add('is-active');
	// mousedown and not click: it fires before the editor's own handlers, so by
	// the time they run the global already points at the right panel.
	editors.forEach(e => e.canvas.addEventListener('mousedown', () => setActiveEditor(e), true));
}


// ── Function aliases for index.html and config.js ────────────────────────────
// index.html button handlers and config.js hot-reload call these by name.
// All other modules access the instance directly via window.graph.
//
// These go through `window.graph` and not through the `graph` const so that
// Save, Load and New act on the focused panel once there is more than one. With
// MAX_PANELS = 1 the two are the same object and nothing changes.
// Save and Load go through the document layer, which knows the file may hold
// more than the panels are showing. `saveGraph()` and `loadGraph()` stay as
// they were, one graph in and out, and document.js is built on top of them.
// ── Opening and saving ───────────────────────────────────────────────────────
//
// **An `<input type="file">` cannot say where to open.** The browser decides,
// and what it decides is the last folder any page used, which is how you end up
// hunting for the same directory every time. The File System Access API can:
// given an `id`, Chromium-family browsers remember the last folder used under
// that name, kept apart from every other page's — so you find your files once
// and after that the dialog opens where you left it. Saving through the same id
// lands in the same place instead of in Downloads.
//
// **Firefox has none of this**, and there is nothing a page can do about it
// there: the fallback below is exactly the behaviour this editor always had, an
// `<input>` for opening and a download for saving. Everything is feature-
// detected, so a browser that removes or blocks the API falls back too rather
// than breaking. For the common case there is also File → Samples, which needs
// no dialog at all and therefore works the same everywhere.
const FILE_PICKER = {
	id: 'basicGraphEditor',
	types: [{ description: 'Graph document', accept: { 'application/json': ['.json'] } }],
};

/** The file we opened, when the browser gave us a handle to it. */
let _fileHandle = null;

function _readDocument(text, filename) {
	try {
		window.doc.load(JSON.parse(text), filename);
	} catch (err) {
		// Said out loud rather than guessed at: see the header of document.js.
		// And with the one thing the reader cannot work out from here: a file
		// this version does not understand may simply be newer than it.
		alert(`Could not open ${filename}\n\n${err.message}\n\n`
		    + `If this file was written by a newer version of the editor, `
		    + `download the latest one.`);
	}
}

async function openDocument() {
	if (!window.showOpenFilePicker) { document.getElementById('loadInput').click(); return; }
	let handle;
	try {
		[handle] = await window.showOpenFilePicker({ ...FILE_PICKER, multiple: false });
	} catch (err) {
		return;   // the dialog was dismissed, which is not an error
	}
	const file = await handle.getFile();
	_fileHandle = handle;
	_readDocument(await file.text(), file.name);
}

/** The fallback path, and what every browser did before this existed. */
function loadDocument(e) {
	const file = e.target.files[0];
	if (!file) return;
	_fileHandle = null;
	const reader = new FileReader();
	reader.onload = () => _readDocument(reader.result, file.name);
	reader.readAsText(file);
}

/** Open one of the files that ship with the editor. No dialog anywhere. */
async function loadSample(path) {
	try {
		const response = await fetch(path);
		if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
		_fileHandle = null;
		_readDocument(await response.text(), path.split('/').pop());
	} catch (err) {
		alert(`Could not read ${path}\n\n${err.message}`);
	}
}

/**
 * Save. With a handle from opening, straight back to that file; without one, a
 * dialog that starts where you last saved. `askWhere` forces the dialog, which
 * is what Save as… is for.
 */
async function saveDocument(askWhere) {
	const text = JSON.stringify(window.doc.serialize(), null, 2);

	if (window.showSaveFilePicker) {
		let handle = askWhere ? null : _fileHandle;
		// A handle survives a reload; the permission that came with it may not.
		if (handle && await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
			if (await handle.requestPermission({ mode: 'readwrite' }) !== 'granted') handle = null;
		}
		if (!handle) {
			try {
				handle = await window.showSaveFilePicker({
					...FILE_PICKER, suggestedName: window.doc.filename });
			} catch (err) {
				return;   // dismissed
			}
		}
		const writable = await handle.createWritable();
		await writable.write(text);
		await writable.close();
		_fileHandle = handle;
		window.doc.filename = handle.name;
		editors.forEach(e => { e.dirty = false; });
		return;
	}

	const blob = new Blob([text], { type: 'application/json' });
	const a = document.createElement('a');
	a.href     = URL.createObjectURL(blob);
	a.download = window.doc.filename;
	a.click();
	editors.forEach(e => { e.dirty = false; });
}

function draw()        { window.graph.draw(); }
function redraw()      { window.graph.redraw(); }
function newGraph()    { window.graph.newGraph(); if (window.doc) window.doc.reset(); }
function saveGraph()   { window.graph.saveGraph(); }
function loadGraph(e)  { window.graph.loadGraph(e); }
function isEmptyGraph(){ return window.graph.isEmptyGraph(); }
