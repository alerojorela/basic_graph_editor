// search.js
// Floating search panel: Ctrl+F to open / Escape to close.
// Basic mode: filter by label.
// Advanced mode (⊕ toggle): per-property filter fields built from the schema.

(function () {
	'use strict';

	let _results = [];
	let _cursor  = -1;
	let _advOpen = false;

	// ── Build panel ───────────────────────────────────────────────────────────
	const _panel = document.createElement('div');
	_panel.id = 'searchPanel';
	_panel.style.display = 'none';
	_panel.innerHTML = `
		<div id="searchBar">
			<input  id="searchInput"     type="text" placeholder="Search label…" autocomplete="off" spellcheck="false">
			<select id="searchScope"     title="Search in">
				<option value="nodes">Nodes</option>
				<option value="edges">Edges</option>
				<option value="both" selected>Both</option>
			</select>
			<button id="searchPrev"      title="Previous (Shift+Enter)">◀</button>
			<button id="searchNext"      title="Next (Enter)">▶</button>
			<span   id="searchCount"></span>
			<button id="searchAdvToggle" title="Advanced search">⊕</button>
			<button id="searchClose"     title="Close (Escape)">✕</button>
		</div>
		<div id="searchAdvanced"></div>
		<ul id="searchResults"></ul>
	`;
	document.body.appendChild(_panel);

	const _input    = document.getElementById('searchInput');
	const _scope    = document.getElementById('searchScope');
	const _count    = document.getElementById('searchCount');
	const _list     = document.getElementById('searchResults');
	const _btnPrev  = document.getElementById('searchPrev');
	const _btnNext  = document.getElementById('searchNext');
	const _btnAdv   = document.getElementById('searchAdvToggle');
	const _btnClose = document.getElementById('searchClose');
	const _advPanel = document.getElementById('searchAdvanced');

	_advPanel.style.display = 'none';

	// ── Helpers ───────────────────────────────────────────────────────────────
	function _labelFromKey(key) {
		return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase());
	}

	// ── Advanced panel ────────────────────────────────────────────────────────
	// Builds per-property filter fields from the relevant schema.
	// 'label' is handled by the basic input; auto fields are skipped.

	function _buildAdvFields() {
		_advPanel.innerHTML = '';
		const scope = _scope.value;
		// eslint-disable-next-line no-undef
		const schema = scope === 'edges'
			? (typeof edgeSchema  !== 'undefined' ? edgeSchema  : {})
			: (typeof nodeSchema  !== 'undefined' ? nodeSchema  : {});

		let count = 0;
		for (const [key, def] of Object.entries(schema)) {
			if (def.auto || key === 'label') continue; // label = basic input; auto = read-only

			// Build control: select for enum/array, text input for strings/numbers
			const opts = def.enum ?? def.items?.enum ?? (def.type === 'array' ? [] : null);
			let ctrl;
			if (opts && opts.length) {
				ctrl = document.createElement('select');
				ctrl.dataset.advKey = key;
				const blank = document.createElement('option');
				blank.value = '';
				blank.textContent = '—';
				ctrl.appendChild(blank);
				opts.forEach(opt => {
					const o = document.createElement('option');
					o.value = String(opt);
					o.textContent = opt;
					ctrl.appendChild(o);
				});
			} else if (def.type !== 'datetime') {
				ctrl = document.createElement('input');
				ctrl.type = 'text';
				ctrl.placeholder = '…';
				ctrl.dataset.advKey = key;
			}
			if (!ctrl) continue;

			const row = document.createElement('div');
			row.className = 'search-adv-row';
			const lbl = document.createElement('label');
			lbl.textContent = _labelFromKey(key);
			row.appendChild(lbl);
			row.appendChild(ctrl);
			_advPanel.appendChild(row);
			count++;
		}

		if (!count) {
			const msg = document.createElement('div');
			msg.className = 'search-adv-empty';
			msg.textContent = 'No searchable fields.';
			_advPanel.appendChild(msg);
		}
	}

	function _getAdvCriteria() {
		const criteria = {};
		_advPanel.querySelectorAll('[data-adv-key]').forEach(ctrl => {
			const val = ctrl.value.trim().toLowerCase();
			if (val) criteria[ctrl.dataset.advKey] = val;
		});
		return criteria;
	}

	// ── Search logic ──────────────────────────────────────────────────────────

	// Returns true if any schema-defined property of `el` matches `q` (for
	// the given key, where q is already lower-case).
	function _matchAdv(el, criteria) {
		for (const [key, q] of Object.entries(criteria)) {
			const val = el[key];
			if (val == null) return false;
			const s = Array.isArray(val) ? val.join(' ') : String(val);
			if (!s.toLowerCase().includes(q)) return false;
		}
		return true;
	}

	function _doSearch() {
		const q     = _input.value.trim().toLowerCase();
		const scope = _scope.value;
		const adv   = _advOpen ? _getAdvCriteria() : {};
		const hasAdv = Object.keys(adv).length > 0;
		_results = [];
		_cursor  = -1;

		if (!q && !hasAdv) { _renderList(); return; }

		if (scope !== 'edges') {
			window.graph.nodes.forEach(n => {
				const okLabel = !q   || String(n.label ?? '').toLowerCase().includes(q);
				const okAdv   = !hasAdv || _matchAdv(n, adv);
				if (okLabel && okAdv) _results.push({ el: n, type: 'node' });
			});
		}
		if (scope !== 'nodes') {
			window.graph.edges.forEach(e => {
				// When scope is 'edges', match only the edge's own label.
				// When scope is 'both', also check endpoint node labels.
				const okLabel = !q || (
					String(e.label ?? '').toLowerCase().includes(q) ||
					(scope === 'both' && (
						String(e.from?.label ?? '').toLowerCase().includes(q) ||
						String(e.to?.label   ?? '').toLowerCase().includes(q)
					))
				);
				const okAdv = !hasAdv || _matchAdv(e, adv);
				if (okLabel && okAdv) _results.push({ el: e, type: 'edge' });
			});
		}

		_renderList();
		if (_results.length) _jumpTo(0);
	}

	// ── Results list ──────────────────────────────────────────────────────────

	function _nodeText(n) { return n.label ? n.label : `#${n.id}`; }
	function _edgeText(e) {
		const a = _nodeText(e.from), b = _nodeText(e.to);
		return e.label ? `${a} → ${b}  (${e.label})` : `${a} → ${b}`;
	}

	function _renderList() {
		_list.innerHTML = '';
		_count.textContent = _results.length
			? `${_cursor >= 0 ? _cursor + 1 : 0} / ${_results.length}`
			: '';

		_results.forEach((r, i) => {
			const li  = document.createElement('li');
			const tag = document.createElement('span');
			tag.className   = 'search-tag';
			tag.textContent = r.type === 'node' ? 'N' : 'E';
			const lbl = document.createElement('span');
			lbl.className   = 'search-label';
			lbl.textContent = r.type === 'node' ? _nodeText(r.el) : _edgeText(r.el);
			li.appendChild(tag);
			li.appendChild(lbl);
			if (i === _cursor) li.classList.add('search-active');
			li.addEventListener('click', () => _jumpTo(i));
			_list.appendChild(li);
		});
	}

	// ── Navigate to a result ──────────────────────────────────────────────────

	function _panTo(x, y) {
		const g = window.graph;
		g.offsetX = g.canvas.width  / 2 - x * g.scale;
		g.offsetY = g.canvas.height / 2 - y * g.scale;
	}

	function _jumpTo(idx) {
		if (!_results.length) return;
		_cursor = ((idx % _results.length) + _results.length) % _results.length;
		const r = _results[_cursor];
		const g = window.graph;

		if (r.type === 'node') {
			g.selectedNode = r.el; g.selectedEdge = null;
			_panTo(r.el.x, r.el.y);
		} else {
			g.selectedNode = null; g.selectedEdge = r.el;
			_panTo(
				(r.el.from.x + r.el.to.x) / 2,
				(r.el.from.y + r.el.to.y) / 2
			);
		}

		if (typeof g.onSelectionChange === 'function') g.onSelectionChange(g.selectedNode, g.selectedEdge);
		g.draw();
		_renderList();
		const active = _list.querySelector('.search-active');
		if (active) active.scrollIntoView({ block: 'nearest' });
	}

	const _prev = () => { if (_results.length) _jumpTo(_cursor - 1); };
	const _next = () => { if (_results.length) _jumpTo(_cursor + 1); };

	// ── Open / close / toggle advanced ───────────────────────────────────────

	function _open() {
		_panel.style.display = 'flex';
		_input.focus();
		_input.select();
		if (_input.value.trim()) _doSearch();
	}

	function _close() {
		_panel.style.display = 'none';
		_advOpen = false;
		_btnAdv.classList.remove('search-adv-active');
		_advPanel.style.display = 'none';
		_results = []; _cursor = -1;
		_list.innerHTML = '';
		_count.textContent = '';
	}

	function _toggleAdv() {
		_advOpen = !_advOpen;
		if (_advOpen) {
			_buildAdvFields();
			_advPanel.style.display = 'block';
			_btnAdv.classList.add('search-adv-active');
		} else {
			_advPanel.style.display = 'none';
			_btnAdv.classList.remove('search-adv-active');
			_doSearch(); // re-run without advanced filters
		}
	}

	// ── Event wiring ──────────────────────────────────────────────────────────

	_input.addEventListener('input', _doSearch);
	_scope.addEventListener('change', () => {
		if (_advOpen) _buildAdvFields(); // rebuild fields for the new scope's schema
		_doSearch();
	});

	// Delegated listeners for the advanced panel (covers dynamically-built fields)
	_advPanel.addEventListener('input',  _doSearch);
	_advPanel.addEventListener('change', _doSearch);

	_input.addEventListener('keydown', (e) => {
		if (e.key === 'Enter')  { e.preventDefault(); e.shiftKey ? _prev() : _next(); }
		if (e.key === 'Escape') { e.preventDefault(); _close(); }
	});

	_btnPrev.addEventListener('click', _prev);
	_btnNext.addEventListener('click', _next);
	_btnAdv.addEventListener('click',  _toggleAdv);
	_btnClose.addEventListener('click', _close);

	// Ctrl+F: open (or re-focus if already open)
	window.addEventListener('keydown', (e) => {
		if (e.ctrlKey && e.key === (window.keyBindings?.search ?? 'f')) {
			e.preventDefault();
			_open();
		}
	});
})();
