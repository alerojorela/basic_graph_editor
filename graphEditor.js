const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const R = 20;
// enable tooltip if desired
const enableTooltip = false;
const TOOLTIP_ALIGN = "left"; 
// "left" | "center" | "right"

/* ================== CSS TYPES ================== */
function cssVar(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name).trim();
}

const TYPES = [
  { color: () => cssVar("--type1-color"), dash: [] },
  { color: () => cssVar("--type2-color"), dash: [6, 4] },
  { color: () => cssVar("--type3-color"), dash: [2, 4] },
  { color: () => cssVar("--type4-color"), dash: [10, 4] },
  { color: () => cssVar("--type5-color"), dash: [] }
];

/* ================== DOUBLE CLICK ================== */
const DOUBLECLICK_MODE = 1;

function customDoubleClick(node) {
  alert("Custom double click on node: " + node.label);
}

/* ================== STATE ================== */
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

/* ================== PAN & ZOOM ================== */
let offsetX = 0;
let offsetY = 0;
let scale = 1;

let panning = false;
let panStart = { x: 0, y: 0 };

canvas.addEventListener("contextmenu", e => e.preventDefault());

/* ================== RESET ================== */
function resetState() {
  hoverNode = null;
}

/* ================== DRAWING ================== */
function drawArrow(from, to, edge) {
  const color = TYPES[edge.type].color();
  const angle = Math.atan2(to.y - from.y, to.x - from.x);
  const head = 10;

  const tx = to.x - Math.cos(angle) * R;
  const ty = to.y - Math.sin(angle) * R;

  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = edge === selectedEdge ? 4 : 2;
  ctx.setLineDash(TYPES[edge.type].dash);

  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(tx, ty);
  ctx.stroke();

  ctx.setLineDash([]);
  ctx.beginPath();
  ctx.moveTo(tx, ty);
  ctx.lineTo(
    tx - head * Math.cos(angle - Math.PI / 6),
    ty - head * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    tx - head * Math.cos(angle + Math.PI / 6),
    ty - head * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();

  if (edge.label) {
    ctx.fillStyle = "#000";
    ctx.font = "12px Arial";
    ctx.textAlign = "center";
    ctx.fillText(
      edge.label,
      (from.x + to.x) / 2,
      (from.y + to.y) / 2 - 5
    );
  }

  if (edge.lock) {
    ctx.fillStyle = "gold";
    ctx.beginPath();
    ctx.arc((from.x + to.x) / 2, (from.y + to.y) / 2, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}


function drawTooltip(node) {
  if (!enableTooltip || !node.tooltip) return;

  const lines = node.tooltip.split("\n");
  ctx.font = "12px Arial";

  const padding = 6;
  const lineHeight = 14;

  const textWidth = Math.max(...lines.map(l => ctx.measureText(l).width));
  const boxWidth = textWidth + padding * 2;
  const boxHeight = lines.length * lineHeight + padding * 2;

  // posición del ratón en coordenadas de pantalla
  const baseX = mouse.x * scale + offsetX;
  const baseY = mouse.y * scale + offsetY;

  let x, textX;

  switch (TOOLTIP_ALIGN) {
    case "right":
      x = baseX - boxWidth - 10;
      textX = x + boxWidth - padding;
      ctx.textAlign = "right";
      break;

    case "center":
      x = baseX - boxWidth / 2;
      textX = x + boxWidth / 2;
      ctx.textAlign = "center";
      break;

    default: // "left"
      x = baseX + 10;
      textX = x + padding;
      ctx.textAlign = "left";
  }

  const y = baseY + 10;

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  // fondo
  // ctx.fillStyle = "rgba(0,0,0,0.85)";
  // ctx.fillRect(x, y, boxWidth, boxHeight);

  // texto
  ctx.fillStyle = "white";
  ctx.textBaseline = "top";

  lines.forEach((line, i) => {
    ctx.fillText(
      line,
      textX,
      y + padding + i * lineHeight
    );
  });
}



function draw() {
  resetState();

  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  ctx.clearRect(
    -offsetX / scale,
    -offsetY / scale,
    canvas.width / scale,
    canvas.height / scale
  );

  edges.forEach(e => drawArrow(e.from, e.to, e));

  if (creatingEdge && creatingNode) {
    ctx.setLineDash([5, 5]);
    drawArrow(creatingNode, mouse, { type: 0, label: "" });
    ctx.setLineDash([]);
  }

  nodes.forEach(n => {
    if (Math.hypot(n.x - mouse.x, n.y - mouse.y) <= R) {
      hoverNode = n;
    }

    const color = TYPES[n.type].color();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(n.x, n.y, R, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = n === selectedNode ? 4 : 1.5;
    ctx.strokeStyle = "rgba(0,0,0,0.7)";

    if (n === selectedNode) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 12;
    }

    ctx.stroke();
    ctx.shadowBlur = 0;

    if (n.label) {
      ctx.fillStyle = "white";
      ctx.font = "12px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(n.label, n.x, n.y);
    }

    if (n.lock) {
      ctx.fillStyle = "gold";
      ctx.beginPath();
      ctx.arc(n.x, n.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  ctx.setTransform(1, 0, 0, 1, 0, 0);

  if (hoverNode) drawTooltip(hoverNode);
}

/* ================== HIT TEST ================== */
function nodeAt(x, y) {
  return nodes.find(n => Math.hypot(n.x - x, n.y - y) <= R);
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
  return edges.find(e => dist(x, y, e.from.x, e.from.y, e.to.x, e.to.y) < 6);
}

function edgeExists(from, to) {
  return edges.some(e => e.from === from && e.to === to);
}

function closestEnd(edge, x, y) {
  const dFrom = Math.hypot(edge.from.x - x, edge.from.y - y);
  const dTo = Math.hypot(edge.to.x - x, edge.to.y - y);
  return dFrom < dTo ? "from" : "to";
}

/* ================== MOUSE ================== */
canvas.addEventListener("mousedown", e => {
  const mouseX = e.offsetX;
  const mouseY = e.offsetY;

  // if (e.button === 3) { // back botton
  // if (e.button === 4) { // forward botton

  if (e.button === 1) { // middle botton
    panning = true;
    panStart.x = mouseX;
    panStart.y = mouseY;
    return;
  }

  if (e.button === 2) { // right botton
    const n = nodeAt(mouse.x, mouse.y);
    if (n) {
      creatingNode = n;
    } else {
      creatingNode = {
        id: Date.now(),
        x: mouse.x,
        y: mouse.y,
        label: "",
        tooltip: "",
        type: 0,
        lock: false
      };
      nodes.push(creatingNode);
    }
    creatingEdge = true;
  }

  if (e.button === 0) { // left botton
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

canvas.addEventListener("mousemove", e => {
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
    if (draggingEdgeEnd === "from") draggingEdge.from = { x: mouse.x, y: mouse.y };
    else draggingEdge.to = { x: mouse.x, y: mouse.y };
  }


  draw();
});

canvas.addEventListener("mouseup", e => {
  if (e.button === 1) {
    panning = false;
    return;
  }

  if (e.button === 2 && creatingEdge && creatingNode) {
    let target = nodeAt(mouse.x, mouse.y);
    if (!target) {
      target = {
        id: Date.now(),
        x: mouse.x,
        y: mouse.y,
        label: "",
        tooltip: "",
        type: 0,
        lock: false
      };
      nodes.push(target);
    }
    if (target !== creatingNode && !edgeExists(creatingNode, target)) {
      edges.push({ from: creatingNode, to: target, label: "", type: 0, lock: false });
    }
    creatingNode = null;
    creatingEdge = false;
  }

    if (draggingEdge) {
    const target = nodeAt(mouse.x, mouse.y);
    if (target) draggingEdge[draggingEdgeEnd] = target;
    else { // rollback
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

/* ================== DOUBLE CLICK ================== */
canvas.addEventListener("dblclick", e => {
  const x = (e.offsetX - offsetX) / scale;
  const y = (e.offsetY - offsetY) / scale;

  const n = nodeAt(x, y);
  if (n) {
    if (DOUBLECLICK_MODE === 1) {
      const t = prompt("Node label:", n.label);
      if (t !== null) n.label = t;
    } else {
      customDoubleClick(n);
    }
    draw();
  }
});


/* ================== KEYBOARD ================== */
window.addEventListener("keydown", e => {
  if (e.key === "F2") {
    e.preventDefault();
    if (selectedNode) {
      const t = prompt("Node label:", selectedNode.label);
      if (t !== null) selectedNode.label = t;
    } else if (selectedEdge) {
      const t = prompt("Edge label:", selectedEdge.label);
      if (t !== null) selectedEdge.label = t;
    }
    draw();
  }

  if (e.key === "F3") {
    e.preventDefault();
    if (selectedNode) selectedNode.type = (selectedNode.type + 1) % TYPES.length;
    else if (selectedEdge) selectedEdge.type = (selectedEdge.type + 1) % TYPES.length;
    draw();
  }

  if (e.key === "F4") { // toggle lock
    e.preventDefault();
    if (selectedNode) selectedNode.lock = !selectedNode.lock;
    else if (selectedEdge) selectedEdge.lock = !selectedEdge.lock;
    draw();
  }

  if (e.key === "Delete" || e.key === "Supr") {
    if (selectedNode) {
      if (!selectedNode.lock) {
        edges = edges.filter(e => e.from !== selectedNode && e.to !== selectedNode);
        nodes = nodes.filter(n => n !== selectedNode);
        selectedNode = null;
      }
    } else if (selectedEdge) {
      if (!selectedEdge.lock) {
        edges = edges.filter(e => e !== selectedEdge);
        selectedEdge = null;
      }
    }
    draw();
  }
});

/* ================== WHEEL ZOOM ================== */
canvas.addEventListener("wheel", e => {
  e.preventDefault();
  const x = (e.offsetX - offsetX) / scale;
  const y = (e.offsetY - offsetY) / scale;

  const delta = e.deltaY < 0 ? 1.1 : 0.9;
  scale *= delta;

  offsetX = e.offsetX - x * scale;
  offsetY = e.offsetY - y * scale;

  draw();
});





/* ================== DOCUMENT ACTIONS ================== */
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
    nodes: nodes.map(n => ({ id: n.id, x: n.x, y: n.y, label: n.label, type: n.type, lock: n.lock })),
    edges: edges.map(e => ({ from: e.from.id, to: e.to.id, label: e.label, type: e.type, lock: e.lock }))
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "graph.json";
  a.click();
}

function loadGraph(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    const data = JSON.parse(reader.result);
    nodes = data.nodes.map(n => ({ ...n }));
    edges = data.edges.map(e => ({
      ...e,
      from: nodes.find(n => n.id === e.from),
      to: nodes.find(n => n.id === e.to)
    }));
    draw();
  };
  reader.readAsText(file);
}



function randomId() {
    return Date.now();
    // return Date.now() + i;
}

function normalizeItems(items) {
    return items.map((item, i) => {
      // Caso objeto: preservar todo
      if (item && typeof item === 'object' && !Array.isArray(item)) {
        return {
          ...item,                           // 👈 conserva atributos extra
          id: item.id ?? item.label ?? Date.now() + i,
          label: item.label ?? String(item.id),
          tooltip: item.tooltip ?? null,
        };
      }
  
      // Caso atómico
      return {
        id: item,
        label: String(item),
        tooltip: null,
      };
    });
  }

  


const greekLetters = [
  "α", "β", "γ", "δ", "ε", "ζ", "η", "θ",
  "ι", "κ", "λ", "μ", "ν", "ξ", "ο", "π",
  "ρ", "σ", "τ", "υ", "φ", "χ", "ψ", "ω"
];

function someLayout(
	mode = 'serial', // 'serial' | 'parallel'
	items = greekLetters
) {

	nodes = [];
	edges = [];
	let dy = 85;

	const data = normalizeItems(items);
  const multiline_text = `Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua
Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat
Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur
Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum`;

	/***********************
  * SERIAL LAYOUT
	***********************/
	if (mode === 'serial') {
		// const startX = 0;
		// const startY = 0;
		let prev = null;

		data.forEach((item, i) => {
			const node = {
                ...item,                
				id: item.id,
				label: item.label,
				tooltip: item.tooltip,
				type: i % TYPES.length,
				lock: false,
				// x: startX,
				// y: startY + i * dy,
        tooltip: multiline_text
			};

			nodes.push(node);

			if (prev) {
				edges.push({
					from: prev,
					to: node,
					type: i % TYPES.length,
					lock: false,
				});
			}

			prev = node;
		});
	}

	/***********************
  * PARALLEL LAYOUT
	***********************/
	if (mode === 'parallel') {
		const startNode = {
			id: randomId(),
			label: 'START',
			type: 0,
			lock: true,
		};
		const endNode = {
			id: randomId() + 1,
			label: 'END',
			type: 0,
			lock: true,
		};
		nodes.push(startNode, endNode);

		data.forEach((item, i) => {
			const node = {
                ...item,
				id: item.id,
				label: item.label,
				tooltip: item.tooltip,
				type: i % TYPES.length,
				lock: false,
        tooltip: multiline_text
			};

			nodes.push(node);

			edges.push({
				from: startNode,
				to: node,
				type: i % TYPES.length,
			});

			edges.push({
				from: node,
				to: endNode,
				type: i % TYPES.length,
			});
		});
	}

	/* =========================
       VISTA
       ========================= */
	offsetX = canvas.width / 2;
	offsetY = 50;
	scale = 1;

	selectedNode = null;
	selectedEdge = null;

  applyDagreLayout(nodes, edges);
	draw();
}




draw();
