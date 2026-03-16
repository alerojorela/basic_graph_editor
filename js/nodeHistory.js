// nodeHistory.js
// Tracks the sequence of selected nodes and allows back / forward navigation
// with Alt+Left / Alt+Right.
//
// Must be loaded AFTER propertiesEditor.js so the onSelectionChange chain is
// set up in the correct order (propertiesEditor first, history wrapper second).

(function () {
	'use strict';

	const MAX = 50;
	const _hist = [];  // node references in visit order
	let _idx = -1;     // pointer into _hist
	let _navigating = false; // suppresses recording during programmatic jumps

	// Remove nodes that no longer exist in the live graph.
	function _clean() {
		for (let i = _hist.length - 1; i >= 0; i--) {
			if (!window.graph.nodes.includes(_hist[i])) _hist.splice(i, 1);
		}
		_idx = Math.min(_idx, _hist.length - 1);
	}

	function _push(node) {
		if (_navigating || !node) return;
		// Discard any "forward" entries when a new node is visited
		if (_idx < _hist.length - 1) _hist.splice(_idx + 1);
		// Don't record consecutive visits to the same node
		if (_hist[_hist.length - 1] !== node) {
			_hist.push(node);
			if (_hist.length > MAX) _hist.shift();
		}
		_idx = _hist.length - 1;
	}

	function _go(delta) {
		_clean();
		const newIdx = _idx + delta;
		if (newIdx < 0 || newIdx >= _hist.length) return;
		_idx = newIdx;

		_navigating = true;
		const n  = _hist[_idx];
		const g  = window.graph;

		g.selectedNode = n;
		g.selectedEdge = null;

		// Pan so the node is centred in the viewport
		g.offsetX = g.canvas.width  / 2 - n.x * g.scale;
		g.offsetY = g.canvas.height / 2 - n.y * g.scale;

		if (typeof g.onSelectionChange === 'function') g.onSelectionChange(g.selectedNode, g.selectedEdge);
		g.draw();

		_navigating = false;
	}

	// Chain onto whichever onSelectionChange is already set (propertiesEditor.js).
	window.addEventListener('load', () => {
		const _prev = window.graph.onSelectionChange;
		window.graph.onSelectionChange = (node, edge) => {
			if (typeof _prev === 'function') _prev(node, edge);
			if (node) _push(node);
		};
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
