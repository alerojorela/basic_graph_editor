// Requires dagre.js to be loaded as an ES module



/**
 * Convert native graph to Dagre graph
 */
function toDagre(nodes, edges, options) {
    const g = new dagre.graphlib.Graph();

    g.setGraph({
        rankdir: options.rankdir,
        nodesep: options.nodesep,
        ranksep: options.ranksep,
        marginx: options.marginx,
        marginy: options.marginy,
        acyclicer: 'greedy',       // better cycle handling reduces crossings
        ranker:    'network-simplex', // minimises edge crossings (dagre default, explicit)
    });

    // g.setDefaultEdgeLabel(function() { return {}; });
    g.setDefaultEdgeLabel(() => ({}));

    // recenter layout
    const xs = nodes.map(n => n.x);
    const ys = nodes.map(n => n.y);

    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;

    nodes.forEach(n => {
        n.x -= cx;
        n.y -= cy;
    });

    // IMPORTANT: String(id) Dagre implicitly converts IDs to string type
    nodes.forEach(n => {
        g.setNode(String(n.id), {
            width: options.nodeWidth,
            height: options.nodeHeight,
            label: n.label
        });
    });

    edges.forEach(e => {
        // g.setEdge(e.from.id, e.to.id);
        g.setEdge(String(e.from.id), String(e.to.id));
    });




    return g;
}

/**
 * Apply Dagre layout and update native node positions
 */
function fromDagre(g, nodes) {
    const map = new Map(nodes.map(n => [String(n.id), n]));

    g.nodes().forEach(id => {
        const dagreNode = g.node(id);
        const n = map.get(String(id));
        if (!n) return;

        n.x = dagreNode.x;
        n.y = dagreNode.y;
    });
}



/**
 * Public API
 */
// export function applyDagreLayout(nodes, edges, mode = "vertical") {
function applyDagreLayout(nodes, edges, mode = "vertical") {
    const presets = {
        vertical: {
            rankdir: "TB",
            nodesep: 50,   // gap between node edges in same rank
            ranksep: 70,   // gap between ranks
            marginx: 20,
            marginy: 20,
        },
        horizontal: {
            rankdir: "LR",
            nodesep: 40,
            ranksep: 80,
            marginx: 20,
            marginy: 20,
        },
        compact: {
            rankdir: "TB",
            nodesep: 20,
            ranksep: 35,
            marginx: 10,
            marginy: 10,
        },
        wide: {
            rankdir: "TB",
            nodesep: 90,
            ranksep: 120,
            marginx: 40,
            marginy: 40,
        },
        inverted: {
            rankdir: "BT",
            nodesep: 50,
            ranksep: 70,
            marginx: 20,
            marginy: 20,
        },
    };

    const preset = presets[mode] || presets.vertical;

    const options = {
        ...preset,
        nodeWidth:  40,   // matches actual rendered diameter (R=20)
        nodeHeight: 40,
    };

    const g = toDagre(nodes, edges, options);

    dagre.layout(g);

    // console.log(g);
    // g.nodes().forEach(v => { console.log("Node " + v + ": " + JSON.stringify(g.node(v))); });
    // g.edges().forEach(function (e) {
    //     console.log("Edge " + e.v + " -> " + e.w + ": " + JSON.stringify(g.edge(e)));
    // });


    fromDagre(g, nodes);

    // console.log(nodes);
}


// ─── ELK layout ──────────────────────────────────────────────────────────────
// Requires elkjs to be loaded (elk.bundled.js CDN).
// Async: updates node positions and calls window.graph.centerGraph() when the Promise resolves.

/**
 * Apply ELK layout and update native node positions.
 * @param {Array}  nodes - graph nodes array
 * @param {Array}  edges - graph edges array
 * @param {string} mode  - 'layered' | 'horizontal' | 'stress' | 'mrtree'
 */
function applyElkLayout(nodes, edges, mode = 'layered') {
    const presets = {
        layered: {
            'elk.algorithm': 'layered',
            'elk.direction': 'DOWN',
            'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
            'elk.spacing.nodeNode': '50',
            'elk.layered.spacing.nodeNodeBetweenLayers': '80',
        },
        horizontal: {
            'elk.algorithm': 'layered',
            'elk.direction': 'RIGHT',
            'elk.layered.crossingMinimization.strategy': 'LAYER_SWEEP',
            'elk.spacing.nodeNode': '40',
            'elk.layered.spacing.nodeNodeBetweenLayers': '90',
        },
        stress: {
            'elk.algorithm': 'stress',
            'elk.stress.desiredEdgeLength': '100',
        },
        mrtree: {
            'elk.algorithm': 'mrtree',
            'elk.direction': 'DOWN',
            'elk.spacing.nodeNode': '50',
        },
    };

    const layoutOptions = presets[mode] ?? presets.layered;
    const nodeSize = R * 2; // R is the global radius from base.js

    const elk = new ELK();

    const graph = {
        id: 'root',
        layoutOptions,
        children: nodes.map(n => ({
            id: String(n.id),
            width:  nodeSize,
            height: nodeSize,
        })),
        edges: edges.map((e, i) => ({
            id: `e${i}`,
            sources: [String(e.from.id)],
            targets: [String(e.to.id)],
        })),
    };

    elk.layout(graph).then(result => {
        const nodeMap = new Map(nodes.map(n => [String(n.id), n]));
        result.children.forEach(child => {
            const n = nodeMap.get(child.id);
            if (!n) return;
            // ELK uses top-left corner; convert to centre
            n.x = child.x + child.width  / 2;
            n.y = child.y + child.height / 2;
        });
        window.graph.centerGraph(); // re-fit the view once positions are updated
    }).catch(err => {
        console.error('ELK layout failed:', err);
    });
}


// ─── Graphviz layout ─────────────────────────────────────────────────────────
// Requires @viz-js/viz (viz-standalone.js CDN).
// Async: initialises the Wasm module once, then runs synchronously per call.

let _vizInstance = null;

/** Convert native graph to a DOT language string. */
function _toDot(nodes, edges) {
    const lines = ['digraph G {', '  graph [overlap=false];'];
    nodes.forEach(n => {
        const label = (n.label || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
        lines.push(`  "${n.id}" [label="${label}"];`);
    });
    edges.forEach(e => {
        lines.push(`  "${e.from.id}" -> "${e.to.id}";`);
    });
    lines.push('}');
    return lines.join('\n');
}

/**
 * Parse the graphviz "plain" output format and apply positions to nodes.
 * Graphviz y=0 is at the bottom; we flip so y=0 is at the top.
 */
function _applyPlainPositions(plain, nodes) {
    const nodeMap = new Map(nodes.map(n => [String(n.id), n]));
    const SCALE   = 72; // 1 graphviz inch → 72 "pixel" units
    let graphH    = 0;
    const posMap  = new Map();

    for (const line of plain.split('\n')) {
        const tok = line.trim().split(/\s+/);
        if (tok[0] === 'graph') {
            graphH = parseFloat(tok[3]) * SCALE;
        } else if (tok[0] === 'node') {
            // plain format: node name x y width height label ...
            posMap.set(tok[1], {
                x: parseFloat(tok[2]) * SCALE,
                y: parseFloat(tok[3]) * SCALE,
            });
        }
    }
    posMap.forEach((pos, name) => {
        const n = nodeMap.get(name);
        if (!n) return;
        n.x = pos.x;
        n.y = graphH - pos.y; // flip y so top-down
    });
}

/**
 * Apply Graphviz layout and update native node positions.
 * @param {Array}  nodes  - graph nodes array
 * @param {Array}  edges  - graph edges array
 * @param {string} engine - 'dot'|'neato'|'fdp'|'sfdp'|'twopi'|'circo'
 */
async function applyGraphvizLayout(nodes, edges, engine = 'dot') {
    if (typeof Viz === 'undefined') {
        console.error('Graphviz (Viz) not loaded — add @viz-js/viz CDN script');
        return;
    }
    try {
        if (!_vizInstance) _vizInstance = await Viz.instance();
        const plain = _vizInstance.renderString(_toDot(nodes, edges), {
            format: 'plain',
            engine,
        });
        _applyPlainPositions(plain, nodes);
        window.graph.centerGraph();
    } catch (err) {
        console.error('Graphviz layout failed:', err);
    }
}


// ─── WebCola layout ──────────────────────────────────────────────────────────
// Requires webcola (cola.js CDN).  Runs synchronously.

/**
 * Apply WebCola layout and update native node positions.
 * @param {Array}  nodes - graph nodes array
 * @param {Array}  edges - graph edges array
 * @param {string} mode  - 'cola' | 'cola-down' | 'cola-right'
 */
function applyColaLayout(nodes, edges, mode = 'cola') {
    if (typeof cola === 'undefined') {
        console.error('WebCola not loaded — add webcola CDN script');
        return;
    }
    const nodeSize = R * 2; // R is the global radius from base.js
    const idxMap   = new Map(nodes.map((n, i) => [n.id, i]));

    // Cola modifies these objects in-place
    const colaNodes = nodes.map(n => ({
        x: n.x,
        y: n.y,
        width:  nodeSize,
        height: nodeSize,
        _orig:  n,
    }));
    const colaLinks = edges
        .map(e => ({ source: idxMap.get(e.from.id), target: idxMap.get(e.to.id) }))
        .filter(l => l.source != null && l.target != null);

    try {
        const layout = new cola.Layout()
            .nodes(colaNodes)
            .links(colaLinks)
            .linkDistance(90)
            .avoidOverlaps(true);

        if (mode === 'cola-down')  layout.flowLayout('y', 80);
        if (mode === 'cola-right') layout.flowLayout('x', 80);

        // keepRunning = false → run iterations synchronously and return
        layout.start(30, 15, 30, 0, false);

        colaNodes.forEach(cn => { cn._orig.x = cn.x; cn._orig.y = cn.y; });
        window.graph.centerGraph();
    } catch (err) {
        console.error('WebCola layout failed:', err);
    }
}


// ─── Unified dispatcher ───────────────────────────────────────────────────────

/**
 * Apply any supported layout mode to the current graph.
 * Called by the toolbar "Layout" button in index.html.
 * @param {Array}  nodes - graph nodes array
 * @param {Array}  edges - graph edges array
 * @param {string} mode  - e.g. 'dagre-vertical', 'elk-layered', 'gv-neato', 'cola-down'
 */
function applyLayout(nodes, edges, mode) {
    if (window.graph) window.graph.dirty = true;
    if (mode.startsWith('dagre-')) {
        applyDagreLayout(nodes, edges, mode.slice(6));
        window.graph.centerGraph();                              // dagre is synchronous
    } else if (mode.startsWith('elk-')) {
        applyElkLayout(nodes, edges, mode.slice(4)); // async, window.graph.centerGraph() called internally
    } else if (mode.startsWith('gv-')) {
        applyGraphvizLayout(nodes, edges, mode.slice(3)); // async, window.graph.centerGraph() called internally
    } else if (mode.startsWith('cola')) {
        applyColaLayout(nodes, edges, mode);        // sync, window.graph.centerGraph() called internally
    }
}
