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

		// ── Mouse / pan / zoom ────────────────────────────────────────────────
		this.mouse    = { x: 0, y: 0 };
		this.hoverNode = null;
		this.offsetX  = 0;
		this.offsetY  = 0;
		this.scale    = 1;
		this.panning  = false;
		this.panStart = { x: 0, y: 0 };
		this._lastMiddleClickTime = 0;

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
		}
	}


	// ── Viewport ──────────────────────────────────────────────────────────────

	resizeCanvas() {
		this.canvas.width  = window.innerWidth;
		this.canvas.height = window.innerHeight;
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
		const mode = document.getElementById('layoutMode')?.value ?? window.defaultLayout ?? 'elk-mrtree';
		applyLayout(this.nodes, this.edges, mode);
		this.centerGraph();
	}


	// ── Drawing ───────────────────────────────────────────────────────────────

	drawArrow(from, to, edge) {
		const ctx    = this.ctx;
		const typeIdx = (typeof this.getEdgeType === 'function' ? this.getEdgeType(edge) : null) ?? (edge.type ?? 0);
		const color  = this.TYPES[typeIdx].color();
		const R      = this.R;

		const angle = Math.atan2(to.y - from.y, to.x - from.x);
		const head  = 10;

		const tx = to.x - Math.cos(angle) * R;
		const ty = to.y - Math.sin(angle) * R;

		ctx.strokeStyle = color;
		ctx.fillStyle   = color;
		ctx.lineWidth   = edge === this.selectedEdge ? 4 : 2;
		ctx.setLineDash(this.TYPES[typeIdx].dash);

		ctx.beginPath();
		ctx.moveTo(from.x, from.y);
		ctx.lineTo(tx, ty);
		ctx.stroke();

		ctx.setLineDash([]);
		ctx.beginPath();
		ctx.moveTo(tx, ty);
		ctx.lineTo(tx - head * Math.cos(angle - Math.PI / 6), ty - head * Math.sin(angle - Math.PI / 6));
		ctx.lineTo(tx - head * Math.cos(angle + Math.PI / 6), ty - head * Math.sin(angle + Math.PI / 6));
		ctx.closePath();
		ctx.fill();

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
		this.draw();
	}

	saveGraph() {
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

		const data = {
			nodes: this.nodes.map(n => _strip({ ...n }, NODE_DEF)),
			edges: this.edges.map(e => {
				const { from, to, ...rest } = e;
				return _strip({ ...rest, from: from.id, to: to.id }, EDGE_DEF);
			}),
		};

		const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
		const a = document.createElement('a');
		a.href     = URL.createObjectURL(blob);
		a.download = this._loadedFilename;
		a.click();
	}

	loadGraph(e) {
		const file = e.target.files[0];
		if (!file) return;
		this._loadedFilename = file.name;

		const reader = new FileReader();
		reader.onload = () => {
			const data = JSON.parse(reader.result);
			this.nodes = data.nodes.map(n => ({ x: 0, y: 0, label: '', type: 0, lock: false, ...n }));
			this.edges = data.edges.map(e => ({
				label: '', type: 0, lock: false,
				...e,
				from: this.nodes.find(n => n.id === e.from),
				to:   this.nodes.find(n => n.id === e.to),
			})).filter(e => e.from && e.to);
			this.draw();
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
			if (e.ctrlKey) {
				e.preventDefault();
				const wx = (e.offsetX - this.offsetX) / this.scale;
				const wy = (e.offsetY - this.offsetY) / this.scale;
				_openSubgraphModal(wx, wy);
				return;
			}
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
					const tmp    = hitEdge.from;
					hitEdge.from = hitEdge.to;
					hitEdge.to   = tmp;
				} else {
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
		}

		if (this.draggingEdge) {
			if (this.draggingEdgeEnd === 'from') this.draggingEdge.from = { x: this.mouse.x, y: this.mouse.y };
			else                                  this.draggingEdge.to   = { x: this.mouse.x, y: this.mouse.y };
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
				if (t !== null) n.label = t;
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
				if (t !== null) edge.label = t;
			}
			if (typeof this.onSelectionChange === 'function') {
				this.onSelectionChange(this.selectedNode, this.selectedEdge);
			}
			this.draw();
		}
	}

	_handleWheel(e) {
		e.preventDefault();
		const x = (e.offsetX - this.offsetX) / this.scale;
		const y = (e.offsetY - this.offsetY) / this.scale;

		const delta = e.deltaY < 0 ? 1.1 : 0.9;
		this.scale  *= delta;

		this.offsetX = e.offsetX - x * this.scale;
		this.offsetY = e.offsetY - y * this.scale;

		this.draw();
	}

	_handleKeyDown(e) {
		const tag = e.target.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

		const kb = this._keyBindings;

		if (this.editableText && e.key === kb.rename) {
			e.preventDefault();
			if (this.selectedNodes.length > 0) {
				const t = prompt('Node label (applies to all selected):', this.selectedNode?.label ?? '');
				if (t !== null) this.selectedNodes.forEach(n => { n.label = t; this.touchElement(n, false); });
			} else if (this.selectedNode) {
				const t = prompt('Node label:', this.selectedNode.label);
				if (t !== null) { this.selectedNode.label = t; this.touchElement(this.selectedNode, false); }
			} else if (this.selectedEdge) {
				const t = prompt('Edge label:', this.selectedEdge.label);
				if (t !== null) { this.selectedEdge.label = t; this.touchElement(this.selectedEdge, false); }
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
			const _cycleF3 = (el, isNode) => {
				if (window.f3CyclesCategory) {
					const schema  = isNode ? window.nodeSchema : window.edgeSchema;
					const catEnum = schema?.category?.enum;
					if (catEnum && catEnum.length) {
						const cur = catEnum.indexOf(el.category);
						el.category = catEnum[(cur + 1) % catEnum.length];
						if (isNode) { delete el.shapeType; delete el.colorType; }
						this.touchElement(el, false);
						return;
					}
				}
				el.type = ((el.type ?? 0) + 1) % this.TYPES.length;
				if (isNode) { delete el.shapeType; delete el.colorType; }
				this.touchElement(el, false);
			};
			if (this.selectedNodes.length > 0) {
				this.selectedNodes.forEach(n => _cycleF3(n, true));
			} else if (this.selectedNode) {
				_cycleF3(this.selectedNode, true);
			} else if (this.selectedEdge) {
				_cycleF3(this.selectedEdge, false);
			}
			if (typeof this.onSelectionChange === 'function') {
				this.onSelectionChange(this.selectedNode, this.selectedEdge);
			}
			this.draw();
		}

		if (e.key === kb.toggleLock) {
			e.preventDefault();
			if (this.selectedNodes.length > 0) {
				const allLocked = this.selectedNodes.every(n => n.lock);
				this.selectedNodes.forEach(n => { n.lock = !allLocked; });
			} else if (this.selectedNode) {
				this.selectedNode.lock = !this.selectedNode.lock;
			} else if (this.selectedEdge) {
				this.selectedEdge.lock = !this.selectedEdge.lock;
			}
			if (typeof this.onSelectionChange === 'function') {
				this.onSelectionChange(this.selectedNode, this.selectedEdge);
			}
			this.draw();
		}

		if (e.key === kb.delete || e.key === 'Supr') {
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
			if (typeof this.onSelectionChange === 'function') {
				this.onSelectionChange(this.selectedNode, this.selectedEdge);
			}
			this.draw();
		}
	}
}


// ── Main instance ─────────────────────────────────────────────────────────────

const graph = new GraphEditor(canvas);
window.graph = graph;


// ── Function aliases for index.html and config.js ────────────────────────────
// index.html button handlers and config.js hot-reload call these by name.
// All other modules access the instance directly via window.graph.
function draw()        { graph.draw(); }
function redraw()      { graph.redraw(); }
function newGraph()    { graph.newGraph(); }
function saveGraph()   { graph.saveGraph(); }
function loadGraph(e)  { graph.loadGraph(e); }
function isEmptyGraph(){ return graph.isEmptyGraph(); }
