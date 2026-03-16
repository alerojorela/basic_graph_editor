
// #region ================== CUSTOM ==================


function normalizeItem(item) {
	if (item && typeof item === 'object' && !Array.isArray(item)) {
		return {
			...item, // keep attributes
			id: item.id ?? window.graph.randomId(),
			label: item.label ?? String(item.id),
			tooltip: item.tooltip ?? null,
		};
	} else {
		// member is atomic (int or string)
		return {
			// id: item,
			id: window.graph.randomId(),
			label: String(item),
			tooltip: null,
		};
	}
}

function deepMap(value, fn) {
  if (Array.isArray(value)) {
    return value.map(item => deepMap(item, fn));
  }
  return fn(value);
}


// drawPatternToGraph([[1,2,3], 4, [5,6,7]]);
// drawPatternToGraph([ [ [1,2], [3,4], [5,6] ] ]);
// drawPatternToGraph( [1, [[2, 4], [3, [[5, 7], [6, 8] ], 9 ] ] ] );
function drawPatternToGraph(expression) {
	const normalizedPattern = deepMap(expression, normalizeItem);
	g = patternToGraph(normalizedPattern);
	
	console.log(g);
	// g.nodes = g.nodes.map(node => normalizeItem(node));	
	g.nodes.forEach((node, i) => {
		node.type = i % window.graph.TYPES.length;
	});
	g.edges.forEach((edge, i) => {
		edge.type = i % window.graph.TYPES.length;
	});
	console.log(g);
	window.graph.nodes = g.nodes;
	window.graph.edges = g.edges;
	window.graph.redraw();
}

function patternToGraph(expression) {
	/*
	Directed Acyclic Series–Parallel Graph
	The notation generates
	**directed acyclic series–parallel graphs (SP-DAGs)** 
	has recursive series and parallel composition.
	> The notation generates directed acyclic graphs constructed inductively through alternating sequential (series) and parallel composition.
	> The resulting graphs are hierarchical, reducible, may contain multiple sources, multiple sinks, or even disconnected components.

	samples = [
		[[1,2,3], 4],  // several roots
		[[1,2,3], 4, [5,6,7]],  // X diagram
		[ [ [1,2], [3,4], [5,6] ] ], // disconnected
		[1, 2, 3],  // sequential
		// one root one leaf
		[1, 2, [3, 4], 5],  
		[1, 2, [3, [4, 5], 6], 7],
		[1, [2, [3, [4, 5], 6]], 7],
		[1, 2, [3, 4], [5, 6], 7],
		[1, [[2, 4], [3, [[5, 7], [6, 8] ], 9 ] ] ]  // two branches
	]
	samples.forEach((x) => console.log(JSON.stringify(x), patternToGraph(x)));
	*/
	const nodes = new Set();
	const edges = new Set();

	function addEdge(a, b) {
		edges.add({ from: a, to: b });
		return;
		edges.add({ from: a, to: b, type: 0 });
		edges.add(JSON.stringify([a, b]));
	}

	function visit(expr, depth = 0) {
		// Caso base: nodo simple
		if (!Array.isArray(expr)) {
			nodes.add(expr);
			return {
				entry: [expr],
				exit: [expr],
			};
		}

		// Determinar si este nivel es secuencial o paralelo
		const isSequential = depth % 2 === 0;

		if (isSequential) {
			// SECUENCIAL
			let first = null;
			let previous = null;

			for (const element of expr) {
				const current = visit(element, depth + 1);

				if (!first) {
					first = current;
				}

				if (previous) {
					for (const p of previous.exit) {
						for (const c of current.entry) {
							addEdge(p, c);
						}
					}
				}

				previous = current;
			}

			return {
				entry: first.entry,
				exit: previous.exit,
			};
		} else {
			// PARALELO
			let allEntries = [];
			let allExits = [];

			for (const element of expr) {
				const branch = visit(element, depth + 1);
				allEntries.push(...branch.entry);
				allExits.push(...branch.exit);
			}

			return {
				entry: allEntries,
				exit: allExits,
			};
		}
	}

	const result = visit(expression, 0);

	return {
		nodes: Array.from(nodes),
		edges: Array.from(edges),
		// edges: Array.from(edges).map((e) => JSON.parse(e)),
	};
}


function diamond(list, groupSize) {
	// console.log(diamond([1,2,3,4,5,6,7,8,9], 3));
	// [1, [2,3,4], 5, [6,7,8], 9]

	if (list.length <= 2) return list;

	const result = [];
	let i = 0;

	// First element stays single
	result.push(list[i++]);

	while (i < list.length - 1) {
		const group = list.slice(i, i + groupSize);

		// Ensure the group is complete and doesn't include the last element
		if (group.length === groupSize && i + groupSize < list.length) {
			result.push(group);
			i += groupSize;

			// Add next single element
			if (i < list.length - 1) {
				result.push(list[i]);
				i++;
			}
		} else {
			break;
		}
	}

	// Last element stays single
	if (i < list.length) {
		result.push(list[list.length - 1]);
	}

	return result;
}


function sampleLayout(
	mode = 'serial', // 'serial' | 'parallel'
	items = greekLetters
) {
	items =  items.map((item, i) => {
		return normalizeItem(item);
	});

	/***********************
	 * LAYOUTS
	 ***********************/
	if (mode === 'ring') {
		g = patternToGraph(items);
		// forces cycle
		g.edges.push({ from: g.edges.at(-1).to, to: g.edges[0].from });
	} else if (mode === 'serial') {
		g = patternToGraph(items);
	} else if (mode === 'parallel') {
		const startNode = {
			id: window.graph.randomId(),
			label: 'START',
			type: 0,
			lock: true,
		};
		const endNode = {
			id: window.graph.randomId(),
			label: 'END',
			type: 0,
			lock: true,
		};
		g = patternToGraph([startNode, items, endNode]);
	} else if (mode === 'central') {
		const centerNode = {
			id: window.graph.randomId(),
			label: 'CENTER',
			type: 0,
			lock: true,
		};
		g = patternToGraph([centerNode, items]);
	} else if (mode === 'diamond') {
		expression = diamond(items, 3);
		console.log(expression);
		g = patternToGraph(expression);
	}

	console.log(g);
	g.nodes.forEach((node, i) => {
		node.type = i % window.graph.TYPES.length;
	});
	g.edges.forEach((edge, i) => {
		edge.type = i % window.graph.TYPES.length;
	});
	return g;

}

const greekLetters = [
	'α',
	'β',
	'γ',
	'δ',
	'ε',
	'ζ',
	'η',
	'θ',
	'ι',
	'κ',
	'λ',
	'μ',
	'ν',
	'ξ',
	'ο',
	'π',
	'ρ',
	'σ',
	'τ',
	'υ',
	'φ',
	'χ',
	'ψ',
	'ω',
];

const multiline_text = `Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua
Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat
Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur
Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum`;


// #endregion


// #region ================== SUBGRAPH MODAL ==================
// Ctrl+right-click on the canvas opens a textarea for inserting graph content.
// Two modes are available, selectable via a <select>:
//   • indented  — each indented line becomes a node; hierarchy defines edges.
//   • list      — JSON array expression passed to patternToGraph().
//
// A live preview canvas (GraphEditor instance, interactive=false) shows the
// parsed graph topology as the user types.

let _subgraphModal  = null;
let _subgraphOrigin = { x: 0, y: 0 }; // world-space insertion point

let _previewGraph  = null; // GraphEditor instance for the preview canvas
let _pendingNodes  = null; // last successfully parsed nodes (0,0-relative positions)
let _pendingEdges  = null; // last successfully parsed edges
let _previewTimer  = null; // debounce handle

const _SUBGRAPH_HINTS = {
	indented: 'Each line is a node. Indentation defines the hierarchy: each element points (→) to the nearest ancestor with a smaller indent. Use spaces or tabs.',
	list:     'The notation generates directed acyclic graphs constructed inductively through alternating sequential (series) and parallel composition.',
};

const _SUBGRAPH_PLACEHOLDERS = {
	indented: 'root node\n  child 1\n    grandchild\n  child 2\nisolated node',
	list:     '[[1,2,3], 4, [5,6,7]]',
};

function _openSubgraphModal(wx, wy) {
	_subgraphOrigin = { x: wx, y: wy };
	if (!_subgraphModal) _buildSubgraphModal();
	_subgraphModal.style.display = 'flex';
	_pendingNodes = null;
	_pendingEdges = null;
	const ta = document.getElementById('subgraphInput');
	ta.value = '';
	ta.focus();
	// Clear preview
	if (_previewGraph) { _previewGraph.nodes = []; _previewGraph.edges = []; _previewGraph.draw(); }
	document.getElementById('subgraphInsert').disabled = true;
}

function _closeSubgraphModal() {
	if (_subgraphModal) _subgraphModal.style.display = 'none';
}

function _buildSubgraphModal() {
	_subgraphModal = document.createElement('div');
	_subgraphModal.id = 'subgraphModal';
	_subgraphModal.innerHTML = `
		<div id="subgraphBox">
			<div id="subgraphTitle">Insertar subgrafo</div>
			<select id="subgraphMode">
				<option value="indented">Indented notation</option>
				<option value="list">List notation</option>
			</select>
			<div id="subgraphHint">${_SUBGRAPH_HINTS.indented}</div>
			<div id="subgraphEditor">
				<textarea id="subgraphInput" spellcheck="false"
					placeholder="${_SUBGRAPH_PLACEHOLDERS.indented}"></textarea>
				<canvas id="subgraphPreview"></canvas>
			</div>
			<div id="subgraphButtons">
				<button id="subgraphCancel">Cancelar</button>
				<button id="subgraphInsert" disabled>Insertar</button>
			</div>
		</div>
	`;
	document.body.appendChild(_subgraphModal);

	// Instantiate the preview GraphEditor (non-interactive)
	const previewCanvas = document.getElementById('subgraphPreview');
	// eslint-disable-next-line no-undef
	_previewGraph = new GraphEditor(previewCanvas, { interactive: false });

	// Mode switch: update hint, placeholder, clear state
	document.getElementById('subgraphMode').addEventListener('change', (ev) => {
		const mode = ev.target.value;
		document.getElementById('subgraphHint').textContent = _SUBGRAPH_HINTS[mode] ?? '';
		const ta = document.getElementById('subgraphInput');
		ta.placeholder = _SUBGRAPH_PLACEHOLDERS[mode] ?? '';
		ta.value = '';
		_pendingNodes = null;
		_pendingEdges = null;
		document.getElementById('subgraphInsert').disabled = true;
		if (_previewGraph) { _previewGraph.nodes = []; _previewGraph.edges = []; _previewGraph.draw(); }
		ta.focus();
	});

	// Live preview: debounced on textarea input
	document.getElementById('subgraphInput').addEventListener('input', () => {
		clearTimeout(_previewTimer);
		_previewTimer = setTimeout(_updatePreview, 250);
	});

	document.getElementById('subgraphCancel').addEventListener('click', _closeSubgraphModal);
	document.getElementById('subgraphInsert').addEventListener('click', _doInsertSubgraph);

	// Ctrl+Enter to insert, Escape to cancel
	document.getElementById('subgraphInput').addEventListener('keydown', (ev) => {
		if (ev.key === 'Escape') { ev.preventDefault(); _closeSubgraphModal(); }
		if (ev.key === 'Enter' && ev.ctrlKey) { ev.preventDefault(); _doInsertSubgraph(); }
	});

	// Click on backdrop to cancel; prevent context menu on backdrop
	_subgraphModal.addEventListener('click', (ev) => {
		if (ev.target === _subgraphModal) _closeSubgraphModal();
	});
	_subgraphModal.addEventListener('contextmenu', (ev) => ev.preventDefault());
}

// ── Live preview ─────────────────────────────────────────────────────────────

function _updatePreview() {
	const mode = document.getElementById('subgraphMode').value;
	const text = document.getElementById('subgraphInput').value;
	const hint = document.getElementById('subgraphHint');
	const btn  = document.getElementById('subgraphInsert');

	const result = mode === 'list' ? _parseListPattern(text) : _parseIndented(text);

	if (!result || result.nodes.length === 0) {
		_pendingNodes = null;
		_pendingEdges = null;
		btn.disabled  = true;
		if (result === null && text.trim()) {
			hint.textContent = '⚠ Invalid list notation. Use JSON array syntax, e.g. [[1,2,3], 4, [5,6,7]]';
		} else {
			hint.textContent = _SUBGRAPH_HINTS[mode];
		}
		if (_previewGraph) { _previewGraph.nodes = []; _previewGraph.edges = []; _previewGraph.draw(); }
		return;
	}

	hint.textContent  = _SUBGRAPH_HINTS[mode];
	_pendingNodes = result.nodes;
	_pendingEdges = result.edges;
	btn.disabled  = false;

	_previewGraph.nodes = result.nodes;
	_previewGraph.edges = result.edges;
	_previewGraph.centerGraph(12);
}

// ── Parsers (return nodes/edges with positions relative to origin 0,0) ───────

function _parseIndented(text) {
	const items = text.split('\n')
		.map(l => {
			const m = l.match(/^(\s*)(.*)/);
			const indent = m[1].replace(/\t/g, '  ').length;
			return { label: m[2].trim(), indent };
		})
		.filter(it => it.label !== '');

	if (!items.length) return { nodes: [], edges: [] };

	const newNodes = [];
	const newEdges = [];
	const stack    = [];

	items.forEach(item => {
		const node = { id: window.graph.randomId(), label: item.label, type: 0, lock: false, x: 0, y: 0 };
		newNodes.push(node);
		window.graph.touchElement(node, true);

		while (stack.length > 0 && stack[stack.length - 1].indent >= item.indent) {
			stack.pop();
		}

		if (stack.length > 0) {
			const parent = stack[stack.length - 1].node;
			const edge   = { from: node, to: parent, label: '', type: 0, lock: false };
			window.graph.touchElement(edge, true);
			newEdges.push(edge);
		}

		stack.push({ indent: item.indent, node });
	});

	// Tree layout at origin (0,0): left-to-right, depth=x, leaf rows=y
	const childrenOf = new Map(newNodes.map(n => [n, []]));
	newEdges.forEach(e => childrenOf.get(e.to).push(e.from));

	const hasParent    = new Set(newEdges.map(e => e.from));
	const roots        = newNodes.filter(n => !hasParent.has(n));
	const spacing      = 60;
	const depthSpacing = 80;
	let leafRow = 0;

	function layoutNode(node, depth) {
		const children = childrenOf.get(node) || [];
		if (children.length === 0) {
			node.x = depth * depthSpacing;
			node.y = leafRow * spacing;
			leafRow++;
		} else {
			const startRow = leafRow;
			children.forEach(c => layoutNode(c, depth + 1));
			const endRow = leafRow;
			node.x = depth * depthSpacing;
			node.y = (startRow + endRow - 1) / 2 * spacing;
		}
	}

	roots.forEach(r => layoutNode(r, 0));
	return { nodes: newNodes, edges: newEdges };
}

function _parseListPattern(text) {
	if (!text.trim()) return { nodes: [], edges: [] };

	let expression;
	try {
		expression = JSON.parse(text);
	} catch (_) {
		return null; // signals parse error
	}

	const normalized = deepMap(expression, normalizeItem);
	const g          = patternToGraph(normalized);

	const newNodes = Array.from(g.nodes);
	const newEdges = Array.from(g.edges);

	// Grid layout at origin (0,0)
	const cols = Math.max(1, Math.ceil(Math.sqrt(newNodes.length)));
	newNodes.forEach((n, i) => {
		n.x    = (i % cols) * 80;
		n.y    = Math.floor(i / cols) * 60;
		n.type = n.type ?? 0;
		n.lock = n.lock ?? false;
		window.graph.touchElement(n, true);
	});
	newEdges.forEach(e => {
		e.label = e.label ?? '';
		e.type  = e.type  ?? 0;
		e.lock  = e.lock  ?? false;
		window.graph.touchElement(e, true);
	});

	return { nodes: newNodes, edges: newEdges };
}

// ── Insert / commit ───────────────────────────────────────────────────────────

function _doInsertSubgraph() {
	if (!_pendingNodes || !_pendingNodes.length) return;

	// Translate 0,0-relative positions to the world-space insertion point
	_pendingNodes.forEach(n => {
		n.x += _subgraphOrigin.x;
		n.y += _subgraphOrigin.y;
	});

	_commitSubgraph(_pendingNodes, _pendingEdges);

	_pendingNodes = null;
	_pendingEdges = null;
	_closeSubgraphModal();
}

function _commitSubgraph(newNodes, newEdges) {
	const g = window.graph;
	newNodes.forEach(n => g.nodes.push(n));
	newEdges.forEach(e => g.edges.push(e));

	g.selectedNodes = [...newNodes];
	g.selectedNode  = newNodes[newNodes.length - 1] ?? null;
	g.selectedEdge  = null;

	if (typeof g.onSelectionChange === 'function') g.onSelectionChange(g.selectedNode, g.selectedEdge);
	g.draw();
}

// #endregion

