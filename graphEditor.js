const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;

const R = 20;

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

/* ================== DOUBLE CLICK CUSTOMIZING ================== */
const DOUBLECLICK_MODE = 1; // 1 = renombrar, 2 = customDoubleClick

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
let draggingEdge = null;
let draggingEdgeEnd = null;
let edgeBackup = null;

let mouse = { x: 0, y: 0 };

/* ================== PAN & ZOOM ================== */
let offsetX = 0;
let offsetY = 0;
let scale = 1;

let panning = false;
let panStart = { x: 0, y: 0 };

canvas.addEventListener("contextmenu", e => e.preventDefault());

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

  // Indicar bloqueo
  if (edge.lock) {
    ctx.fillStyle = "gold";
    ctx.beginPath();
    ctx.arc((from.x + to.x) / 2, (from.y + to.y) / 2, 5, 0, Math.PI * 2);
    ctx.fill();
  }
}

function draw() {
  // aplica pan y zoom
  ctx.setTransform(scale, 0, 0, scale, offsetX, offsetY);
  ctx.clearRect(-offsetX / scale, -offsetY / scale, canvas.width / scale, canvas.height / scale);

  edges.forEach(e => drawArrow(e.from, e.to, e));

  if (draggingFrom) {
    ctx.setLineDash([5, 5]);
    drawArrow(draggingFrom, mouse, { type: 0, label: "" });
    ctx.setLineDash([]);
  }

  nodes.forEach(n => {
    const color = TYPES[n.type].color();

    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(n.x, n.y, R, 0, Math.PI * 2);
    ctx.fill();

    ctx.lineWidth = n === selectedNode ? 4 : 1.5;
    ctx.strokeStyle = "rgba(0,0,0,0.7)";

    if (n === selectedNode) { ctx.shadowColor = color; ctx.shadowBlur = 12; }
    ctx.stroke();
    ctx.shadowBlur = 0;

    if (n.label) {
      ctx.fillStyle = "white";
      ctx.font = "12px Arial";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(n.label, n.x, n.y);
    }

    // bloqueo visual
    if (n.lock) {
      ctx.fillStyle = "gold";
      ctx.beginPath();
      ctx.arc(n.x, n.y, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  ctx.setTransform(1, 0, 0, 1, 0, 0);
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

  mouse.x = (mouseX - offsetX) / scale;
  mouse.y = (mouseY - offsetY) / scale;

  if (e.button === 2) { // right botton
    const n = nodeAt(mouse.x, mouse.y);
    if (n) draggingFrom = n;
    else nodes.push({ id: Date.now(), x: mouse.x, y: mouse.y, label: "", type: 0, lock: false });
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
  if (e.button === 1) { panning = false; return; }

  if (e.button === 2 && draggingFrom) {
    let target = nodeAt(mouse.x, mouse.y);
    if (!target) {
      target = { id: Date.now(), x: mouse.x, y: mouse.y, label: "", type: 0, lock: false };
      nodes.push(target);
    }
    if (target !== draggingFrom && !edgeExists(draggingFrom, target)) {
      edges.push({ from: draggingFrom, to: target, label: "", type: 0, lock: false });
    }
    draggingFrom = null;
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
  const mouseX = (e.offsetX - offsetX) / scale;
  const mouseY = (e.offsetY - offsetY) / scale;

  const n = nodeAt(mouseX, mouseY);
  if (n) {
    if (DOUBLECLICK_MODE === 1) {
      const t = prompt("Node label:", n.label);
      if (t !== null) n.label = t;
    } else if (DOUBLECLICK_MODE === 2) {
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
  const mouseX = (e.offsetX - offsetX) / scale;
  const mouseY = (e.offsetY - offsetY) / scale;

  const delta = e.deltaY < 0 ? 1.1 : 0.9;
  scale *= delta;

  offsetX = e.offsetX - mouseX * scale;
  offsetY = e.offsetY - mouseY * scale;

  draw();
});



/* ================== DOCUMENT ACTIONS ================== */
function emptyGraph() {
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


const greekLetters = [
  "α", "β", "γ", "δ", "ε", "ζ", "η", "θ",
  "ι", "κ", "λ", "μ", "ν", "ξ", "ο", "π",
  "ρ", "σ", "τ", "υ", "φ", "χ", "ψ", "ω"
];

function loadExampleGraph(items = greekLetters) {
  nodes = [];
  edges = [];

  const startX = 0;
  const startY = 0;
  const dy = 85;

  let prev = null;

  items.forEach((label, i) => {
    const node = {
      id: Date.now() + i,
      x: startX,
      y: startY + i * dy,
      label,
      type: i % TYPES.length,
      lock: false
    };

    nodes.push(node);

    if (prev) {
      edges.push({
        from: prev,
        to: node,
        label: "",
        type: i % TYPES.length,
        lock: false
      });
    }

    prev = node;
  });

  // centrar vista
  offsetX = canvas.width / 2;
  offsetY = 50;
  scale = 1;

  selectedNode = null;
  selectedEdge = null;

  draw();
}


draw();
