// nodeHistory.js
// Tracks the sequence of selected nodes and allows back / forward navigation
// with Alt+Left / Alt+Right.
//
// Must be loaded AFTER propertiesEditor.js so the onSelectionChange chain is
// set up in the correct order (propertiesEditor first, history wrapper second).

(function () {
	'use strict';

	const MAX = 50;
	let _navigating = false; // suppresses recording during programmatic jumps

	// One history per editor, and not one shared by all of them.
	//
	// It used to be a single module-level array, which is right while there is
	// one editor and quietly destructive as soon as there are two: `_clean()`
	// drops every entry that is not in the current graph, so clicking into the
	// other panel would delete the first panel's history on the way past. Each
	// editor keeps its own trail, and switching panels changes which trail you
	// are walking, which is what anyone would expect.
	const _trails = new WeakMap();   // GraphEditor → { hist: [], idx: -1 }

	function _trail(editor) {
		let t = _trails.get(editor);
		if (!t) { t = { hist: [], idx: -1 }; _trails.set(editor, t); }
		return t;
	}

	// Remove nodes that no longer exist in that editor's graph.
	function _clean(editor) {
		const t = _trail(editor);
		for (let i = t.hist.length - 1; i >= 0; i--) {
			if (!editor.nodes.includes(t.hist[i])) t.hist.splice(i, 1);
		}
		t.idx = Math.min(t.idx, t.hist.length - 1);
	}

	function _push(editor, node) {
		if (_navigating || !node) return;
		const t = _trail(editor);
		// Discard any "forward" entries when a new node is visited
		if (t.idx < t.hist.length - 1) t.hist.splice(t.idx + 1);
		// Don't record consecutive visits to the same node
		if (t.hist[t.hist.length - 1] !== node) {
			t.hist.push(node);
			if (t.hist.length > MAX) t.hist.shift();
		}
		t.idx = t.hist.length - 1;
	}

	function _go(delta) {
		const g = window.graph;
		_clean(g);
		const t = _trail(g);
		const newIdx = t.idx + delta;
		if (newIdx < 0 || newIdx >= t.hist.length) return;
		t.idx = newIdx;

		_navigating = true;
		const n = t.hist[t.idx];

		g.selectedNode = n;
		g.selectedEdge = null;

		// Pan so the node is centred in the viewport. base.js grew `centerOn()`
		// for exactly this, and it also calls draw().
		g.centerOn(n.id);

		if (typeof g.onSelectionChange === 'function') g.onSelectionChange(g.selectedNode, g.selectedEdge);

		_navigating = false;
	}

	// Chain onto whichever onSelectionChange is already set (propertiesEditor.js),
	// **on every editor and not only on the one that had the focus at load**.
	// With a single panel `window.editors` holds exactly one and this is what it
	// always was.
	window.addEventListener('load', () => {
		(window.editors ?? [window.graph]).forEach(editor => {
			const _prev = editor.onSelectionChange;
			editor.onSelectionChange = (node, edge) => {
				if (typeof _prev === 'function') _prev(node, edge);
				if (node) _push(editor, node);
			};
		});
	});

	window.addEventListener('keydown', (e) => {
		if (!e.altKey) return;
		const _back = window.keyBindings?.historyBack ?? 'ArrowLeft';
		const _fwd  = window.keyBindings?.historyFwd  ?? 'ArrowRight';
		if (e.key !== _back && e.key !== _fwd) return;
		// Don't fire inside text fields
		const tag = e.target.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
		e.preventDefault();
		_go(e.key === _back ? -1 : +1);
	});
})();
