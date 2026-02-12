const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const R = 20;


// const enableTooltip = false;
// const editableText = false;
const editableText = true;
const enableTooltip = true;
const TOOLTIP_ALIGN = 'left';
// "left" | "center" | "right"
var doubleclickFunction = null;
/*
var doubleclickFunction = function (node) {
	alert("Custom double click on node: " + node.label);
};
*/

// #endregion


// #region ================== RESET ==================

function resizeCanvas() {
	const rect = canvas.parentElement.getBoundingClientRect();
	canvas.width = rect.width;
	canvas.height = rect.height;
	canvas.width = window.innerWidth;
	canvas.height = window.innerHeight;
}


function redraw() {
	reset();
	// resetState();
	// scale = 1;

	// offsetX = canvas.width / 2;
	// offsetY = 50;

	// selectedNode = null;
	// selectedEdge = null;

	applyDagreLayout(nodes, edges);
	centerGraph();
	// draw();
}

// test
function centerGraph(margin = 80) {
	if (nodes.length === 0) return;

	// bounding box
	let minX = Infinity;
	let maxX = -Infinity;
	let minY = Infinity;
	let maxY = -Infinity;

	nodes.forEach(n => {
		minX = Math.min(minX, n.x - R);
		maxX = Math.max(maxX, n.x + R);
		minY = Math.min(minY, n.y - R);
		maxY = Math.max(maxY, n.y + R);
	});

	const graphWidth = maxX - minX;
	const graphHeight = maxY - minY;

	if (graphWidth === 0 || graphHeight === 0) return;

	// scale
	const scaleX = (canvas.width - margin * 2) / graphWidth;
	const scaleY = (canvas.height - margin * 2) / graphHeight;

	scale = Math.min(scaleX, scaleY);

	// center
	const graphCenterX = (minX + maxX) / 2;
	const graphCenterY = (minY + maxY) / 2;

	offsetX = canvas.width / 2 - graphCenterX * scale;
	offsetY = canvas.height / 2 - graphCenterY * scale;

	draw();
}

// #endregion

// #region ================== PAN & ZOOM ==================
let offsetX = 0;
let offsetY = 0;
let scale = 1;

let panning = false;
let panStart = { x: 0, y: 0 };

function reset() {
	offsetX = 0;
	offsetY = 0;
	scale = 1;

	panning = false;
	panStart = { x: 0, y: 0 };
}

// #endregion


// #region ================== CSS TYPES ==================
function cssVar(name) {
	return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

const TYPES = [
	{ color: () => cssVar('--type1-color'), dash: [] },
	{ color: () => cssVar('--type2-color'), dash: [6, 4] },
	{ color: () => cssVar('--type3-color'), dash: [2, 4] },
	{ color: () => cssVar('--type4-color'), dash: [10, 4] },
	{ color: () => cssVar('--type5-color'), dash: [] },
	{ color: () => cssVar('--type6-color'), dash: [4, 1] },
];

// #endregion

// #region ================== STATE ==================
let nodes = [];
let edges = [];

let selectedNode = null;
let selectedEdge = null;

let draggingNode = null;
let draggingFrom = null;
let creatingNode = null;
let creatingEdge = false;

let draggingEdge = null;
let draggingEdgeEnd = null;
let edgeBackup = null;

let mouse = { x: 0, y: 0 };
let hoverNode = null;

function resetState() {
	nodes = [];
	edges = [];

	selectedNode = null;
	selectedEdge = null;

	draggingNode = null;
	draggingFrom = null;
	creatingNode = null;
	creatingEdge = false;

	draggingEdge = null;
	draggingEdgeEnd = null;
	edgeBackup = null;

	mouse = { x: 0, y: 0 };
	hoverNode = null;
}

// #endregion



// #region ================== DRAWING ==================

function drawArrow(from, to, edge) {
	// const color = TYPES[edge.type].color();
	// const color = TYPES[edge.type]?.color?.() ?? DEFAULT_COLOR;
	const color = TYPES[edge.type ?? 0].color();

	const angle = Math.atan2(to.y - from.y, to.x - from.x);
	const head = 10;

	const tx = to.x - Math.cos(angle) * R;
	const ty = to.y - Math.sin(angle) * R;

	ctx.strokeStyle = color;
	ctx.fillStyle = color;
	ctx.lineWidth = edge === selectedEdge ? 4 : 2;
	ctx.setLineDash(TYPES[edge.type ?? 0].dash);

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

	if (edge.label) {
		ctx.fillStyle = '#000';
		ctx.font = '12px Arial';
		ctx.textAlign = 'center';
		ctx.fillText(edge.label, (from.x + to.x) / 2, (from.y + to.y) / 2 - 5);
	}

	if (edge.lock) {
		ctx.fillStyle = 'gold';
		ctx.beginPath();
		ctx.arc((from.x + to.x) / 2, (from.y + to.y) / 2, 5, 0, Math.PI * 2);
		ctx.fill();
	}
}

function drawTooltip(node) {
	if (!enableTooltip || !node.tooltip) return;

	const lines = node.tooltip.split('\n');
	ctx.font = '12px Arial';

	const padding = 6;
	const lineHeight = 14;

	const textWidth = Math.max(...lines.map((l) => ctx.measureText(l).width));
	const boxWidth = textWidth + padding * 2;
	const boxHeight = lines.length * lineHeight + padding * 2;

	// posición del ratón en coordenadas de pantalla
	const baseX = mouse.x * scale + offsetX;
	const baseY = mouse.y * scale + offsetY;

	let x, textX;

	switch (TOOLTIP_ALIGN) {
		case 'right':
			x = baseX - boxWidth - 10;
			textX = x + boxWidth - padding;
			ctx.textAlign = 'right';
			break;

		case 'center':
			x = baseX - boxWidth / 2;
			textX = x + boxWidth / 2;
			ctx.textAlign = 'center';
			break;

		default:
			// "left"
			x = baseX + 10;
			textX = x + padding;
			ctx.textAlign = 'left';
	}

	const y = baseY + 10;

	ctx.setTransform(1, 0, 0, 1, 0, 0);

	// fondo
	// ctx.fillStyle = "rgba(0,0,0,0.85)";
	// ctx.fillRect(x, y, boxWidth, boxHeight);

	// texto
	ctx.fillStyle = 'white';
	ctx.textBaseline = 'top';

	lines.forEach((line, i) => {
		ctx.fillText(line, textX, y + padding + i * lineHeight);
	});
}

function draw() {
	hoverNode = null;
	// resetState();

	ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
	ctx.clearRect(-offsetX / scale, -offsetY / scale, canvas.width / scale, canvas.height / scale);

	edges.forEach((e) => drawArrow(e.from, e.to, e));

	if (creatingEdge && creatingNode) {
		ctx.setLineDash([5, 5]);
		drawArrow(creatingNode, mouse, { type: 0, label: '' });
		ctx.setLineDash([]);
	}

	nodes.forEach((n) => {
		if (Math.hypot(n.x - mouse.x, n.y - mouse.y) <= R) {
			hoverNode = n;
		}

		const color = TYPES[n.type ?? 0].color();

		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.arc(n.x, n.y, R, 0, Math.PI * 2);
		ctx.fill();

		ctx.lineWidth = n === selectedNode ? 4 : 1.5;
		ctx.strokeStyle = 'rgba(0,0,0,0.7)';

		if (n === selectedNode) {
			ctx.shadowColor = color;
			ctx.shadowBlur = 12;
		}

		ctx.stroke();
		ctx.shadowBlur = 0;

		if (n.label) {
			ctx.fillStyle = 'white';
			ctx.font = '10px Arial';
			ctx.textAlign = 'center';
			ctx.textBaseline = 'middle';
			ctx.fillText(n.label, n.x, n.y);
		}

		if (n.lock) {
			ctx.fillStyle = 'gold';
			ctx.beginPath();
			ctx.arc(n.x, n.y, 6, 0, Math.PI * 2);
			ctx.fill();
		}
	});

	ctx.setTransform(1, 0, 0, 1, 0, 0);

	if (hoverNode) drawTooltip(hoverNode);
}

// #endregion

// #region ================== HIT TEST ==================
function nodeAt(x, y) {
	return nodes.find((n) => Math.hypot(n.x - x, n.y - y) <= R);
}

function edgeAt(x, y) {
	function dist(px, py, x1, y1, x2, y2) {
		const A = px - x1;
		const B = py - y1;
		const C = x2 - x1;
		const D = y2 - y1;
		const t = Math.max(0, Math.min(1, (A * C + B * D) / (C * C + D * D)));
		return Math.hypot(x1 + t * C - px, y1 + t * D - py);
	}
	return edges.find((e) => dist(x, y, e.from.x, e.from.y, e.to.x, e.to.y) < 6);
}

function edgeExists(from, to) {
	return edges.some((e) => e.from === from && e.to === to);
}

function closestEnd(edge, x, y) {
	const dFrom = Math.hypot(edge.from.x - x, edge.from.y - y);
	const dTo = Math.hypot(edge.to.x - x, edge.to.y - y);
	return dFrom < dTo ? 'from' : 'to';
}

// #endregion

// #region ================== MOUSE ==================

canvas.addEventListener('contextmenu', (e) => e.preventDefault());


let lastMiddleClickTime = 0;
const DBLCLICK_DELAY = 300; // ms

canvas.addEventListener('mousedown', (e) => {
	const mouseX = e.offsetX;
	const mouseY = e.offsetY;

	// if (e.button === 3) { // back botton
	// if (e.button === 4) { // forward botton

	if (e.button === 1) { // middle button
		const now = Date.now();
		// Detectar doble click
		if (now - lastMiddleClickTime < DBLCLICK_DELAY) {
			lastMiddleClickTime = 0;
			centerGraph();
			return;
		}
		lastMiddleClickTime = now;

		// default behaviour
		panning = true;
		panStart.x = mouseX;
		panStart.y = mouseY;
		return;
	}



	if (e.button === 2) {
		// right botton
		const n = nodeAt(mouse.x, mouse.y);
		if (n) {
			creatingNode = n;
		} else {
			creatingNode = {
				id: randomId(),
				x: mouse.x,
				y: mouse.y,
				label: '',
				tooltip: '',
				type: 0,
				lock: false,
			};
			nodes.push(creatingNode);
		}
		creatingEdge = true;
	}

	if (e.button === 0) {
		// left botton
		selectedNode = nodeAt(mouse.x, mouse.y);
		selectedEdge = selectedNode ? null : edgeAt(mouse.x, mouse.y);

		if (selectedNode) draggingNode = selectedNode;
		else if (selectedEdge) {
			draggingEdge = selectedEdge;
			draggingEdgeEnd = closestEnd(selectedEdge, mouse.x, mouse.y);
			edgeBackup = { from: selectedEdge.from, to: selectedEdge.to };
		}
	}

	draw();
});

canvas.addEventListener('mousemove', (e) => {
	const mouseX = e.offsetX;
	const mouseY = e.offsetY;

	if (panning) {
		offsetX += mouseX - panStart.x;
		offsetY += mouseY - panStart.y;
		panStart.x = mouseX;
		panStart.y = mouseY;
		draw();
		return;
	}

	mouse.x = (mouseX - offsetX) / scale;
	mouse.y = (mouseY - offsetY) / scale;

	if (draggingNode) {
		draggingNode.x = mouse.x;
		draggingNode.y = mouse.y;
	}

	if (draggingEdge) {
		if (draggingEdgeEnd === 'from') draggingEdge.from = { x: mouse.x, y: mouse.y };
		else draggingEdge.to = { x: mouse.x, y: mouse.y };
	}

	draw();
});

canvas.addEventListener('mouseup', (e) => {
	if (e.button === 1) {
		panning = false;
		return;
	}

	if (e.button === 2 && creatingEdge && creatingNode) {
		let target = nodeAt(mouse.x, mouse.y);
		if (!target) {
			target = {
				id: randomId(),
				x: mouse.x,
				y: mouse.y,
				label: '',
				tooltip: '',
				type: 0,
				lock: false,
			};
			nodes.push(target);
		}
		if (target !== creatingNode && !edgeExists(creatingNode, target)) {
			edges.push({ from: creatingNode, to: target, label: '', type: 0, lock: false });
		}
		creatingNode = null;
		creatingEdge = false;
	}

	if (draggingEdge) {
		const target = nodeAt(mouse.x, mouse.y);
		if (target) draggingEdge[draggingEdgeEnd] = target;
		else {
			// rollback
			draggingEdge.from = edgeBackup.from;
			draggingEdge.to = edgeBackup.to;
		}
		draggingEdge = null;
		draggingEdgeEnd = null;
		edgeBackup = null;
	}

	draggingNode = null;
	draw();
});

// #endregion

// #region ================== DOUBLE CLICK ==================
canvas.addEventListener('dblclick', (e) => {
	const x = (e.offsetX - offsetX) / scale;
	const y = (e.offsetY - offsetY) / scale;

	const n = nodeAt(x, y);
	if (n) {

		if (doubleclickFunction) {
			doubleclickFunction(n);
		} else {
			const t = prompt('Node label:', n.label);
			if (t !== null) n.label = t;
		}
		/*
		if (DOUBLECLICK_MODE === 1) {
			const t = prompt('Node label:', n.label);
			if (t !== null) n.label = t;
		} else {
			customDoubleClick(n);
		}
			*/
		draw();
	}
});

// #endregion

// #region ================== WHEEL ZOOM ==================
canvas.addEventListener('wheel', (e) => {
	e.preventDefault();
	const x = (e.offsetX - offsetX) / scale;
	const y = (e.offsetY - offsetY) / scale;

	const delta = e.deltaY < 0 ? 1.1 : 0.9;
	scale *= delta;

	offsetX = e.offsetX - x * scale;
	offsetY = e.offsetY - y * scale;

	draw();
});

// #endregion

// #region ================== KEYBOARD ==================

const keyBindings = {
	'name': 'F2',
	'type': 'F3',
	'lock': 'F4',
};


window.addEventListener('keydown', (e) => {
	if (editableText && e.key === keyBindings['name']) {
		e.preventDefault();
		if (selectedNode) {
			const t = prompt('Node label:', selectedNode.label);
			if (t !== null) selectedNode.label = t;
		} else if (selectedEdge) {
			const t = prompt('Edge label:', selectedEdge.label);
			if (t !== null) selectedEdge.label = t;
		}
		draw();
	}

	if (e.key === keyBindings['type']) {
		e.preventDefault();
		if (selectedNode) selectedNode.type = (selectedNode.type + 1) % TYPES.length;
		else if (selectedEdge) selectedEdge.type = (selectedEdge.type + 1) % TYPES.length;
		draw();
	}

	if (e.key === keyBindings['lock']) {
		// toggle lock
		e.preventDefault();
		if (selectedNode) selectedNode.lock = !selectedNode.lock;
		else if (selectedEdge) selectedEdge.lock = !selectedEdge.lock;
		draw();
	}

	if (e.key === 'Delete' || e.key === 'Supr') {
		if (selectedNode) {
			if (!selectedNode.lock) {
				edges = edges.filter((e) => e.from !== selectedNode && e.to !== selectedNode);
				nodes = nodes.filter((n) => n !== selectedNode);
				selectedNode = null;
			}
		} else if (selectedEdge) {
			if (!selectedEdge.lock) {
				edges = edges.filter((e) => e !== selectedEdge);
				selectedEdge = null;
			}
		}
		draw();
	}
});

// #endregion

// #region ================== DOCUMENT ACTIONS ==================
function isEmptyGraph() {
	return nodes.length == 0;
}

function newGraph() {
	nodes = [];
	edges = [];

	selectedNode = null;
	selectedEdge = null;

	draw();
}

function saveGraph() {
	const data = {
		nodes: nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, label: n.label, type: n.type, lock: n.lock })),
		edges: edges.map((e) => ({ from: e.from.id, to: e.to.id, label: e.label, type: e.type, lock: e.lock })),
	};
	const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = 'graph.json';
	a.click();
}

function loadGraph(e) {
	const file = e.target.files[0];
	if (!file) return;

	const reader = new FileReader();
	reader.onload = () => {
		const data = JSON.parse(reader.result);
		nodes = data.nodes.map((n) => ({ ...n }));
		edges = data.edges.map((e) => ({
			...e,
			from: nodes.find((n) => n.id === e.from),
			to: nodes.find((n) => n.id === e.to),
		}));
		draw();
	};
	reader.readAsText(file);
}

// #endregion


// #region ================== CUSTOM ==================
function randomId() {
	// return Date.now();
	return Math.random().toString(36).slice(2) + Date.now().toString(36);
}


function normalizeItem(item) {
	if (item && typeof item === 'object' && !Array.isArray(item)) {
		return {
			...item, // keep attributes
			id: item.id ?? randomId(),
			label: item.label ?? String(item.id),
			tooltip: item.tooltip ?? null,
		};
	} else {
		// member is atomic (int or string)
		return {
			// id: item,
			id: randomId(),
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
		node.type = i % TYPES.length;
	});
	g.edges.forEach((edge, i) => {
		edge.type = i % TYPES.length;
	});
	console.log(g);
	nodes = g.nodes;
	edges = g.edges;
	redraw();
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
			id: randomId(),
			label: 'START',
			type: 0,
			lock: true,
		};
		const endNode = {
			id: randomId(),
			label: 'END',
			type: 0,
			lock: true,
		};
		g = patternToGraph([startNode, items, endNode]);
	} else if (mode === 'central') {
		const centerNode = {
			id: randomId(),
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
		node.type = i % TYPES.length;
	});
	g.edges.forEach((edge, i) => {
		edge.type = i % TYPES.length;
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


resizeCanvas();
