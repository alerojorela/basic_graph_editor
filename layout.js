// Requires dagre.js to be loaded as an ES module



/**
 * Convert native graph to Dagre graph
 */
function toDagre(nodes, edges, options) {
    const g = new dagre.graphlib.Graph();

    // g.setGraph({
    //     rankdir: options.rankdir,
    //     nodesep: options.nodesep,
    //     ranksep: options.ranksep,
    //     marginx: options.marginx,
    //     marginy: options.marginy
    // });
    g.setGraph({});

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
            nodesep: 50,
            ranksep: 80,
            marginx: 20,
            marginy: 20
        },
        horizontal: {
            rankdir: "LR",
            nodesep: 50,
            ranksep: 80,
            marginx: 20,
            marginy: 20
        },
        compact: {
            rankdir: "TB",
            nodesep: 20,
            ranksep: 40,
            marginx: 10,
            marginy: 10
        },
        wide: {
            rankdir: "TB",
            nodesep: 100,
            ranksep: 150,
            marginx: 50,
            marginy: 50
        },
        inverted: {
            rankdir: "BT",
            nodesep: 50,
            ranksep: 80,
            marginx: 20,
            marginy: 20
        }
    };

    const preset = presets[mode] || presets.vertical;

    const options = {
        ...preset,
        nodeWidth: 120,
        nodeHeight: 50
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
