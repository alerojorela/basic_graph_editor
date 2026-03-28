// propertiesEditor.js
// Schema-driven floating properties panel.
// nodeSchema / edgeSchema are global vars — customise them freely.

// ─── Schemas ─────────────────────────────────────────────────────────────────
// Each key maps to a field descriptor:
//   type       : 'string' | 'number' | 'array' | 'datetime' | 'links'
//   enum       : string[]|number[]  → rendered as <select>
//   items.enum : string[]           → rendered as checkboxes  (for type:'array')
//   rows       : number             → use <textarea> instead of <input>
//   auto       : true | 'onCreate' → read-only; managed automatically
//   description: string             → tooltip on the label
//   multi      : true               → (type:'array' only) checkboxes, stores string[];
//                                     absent/false → radio buttons, stores single string
//
// The key name is auto-converted to a display label ("modificationDate" → "Modification Date").

// Schemas are loaded from config.json via js/config.js (which runs first).
// The || fallback is used when config.js is not present or config.json fails to load.
var nodeSchema = window.nodeSchema || {
	label:            { type: 'string',   description: 'Visible label' },
	text:             { type: 'string',   description: 'Main text', rows: 2 },
	category:         { type: 'array',    enum: ['A', 'B', 'C'] },
	language:         { type: 'array',    enum: ['D', 'E', 'F'] },
	description:      { type: 'string',   rows: 3 },
	notes:            { type: 'string',   rows: 3 },
	links:            { type: 'links' },
	state:            { type: 'string',   enum: ['ignored', 'pending', 'hard', 'done'] },
	importance:       { type: 'number',   enum: [0,1,2,3,4,5,6,7,8,9,10] },
	modificationDate: { type: 'datetime', auto: true,       description: 'Set automatically on every change' },
	insertionDate:    { type: 'datetime', auto: 'onCreate', description: 'Set automatically on first edit' },
};

var edgeSchema = window.edgeSchema || {
	label:            { type: 'string',   description: 'Visible label' },
	category:         { type: 'array',    enum: ['A', 'B', 'C'] },
	description:      { type: 'string',   rows: 3 },
	notes:            { type: 'string',   rows: 3 },
	state:            { type: 'string',   enum: ['ignored', 'pending', 'hard', 'done'] },
	importance:       { type: 'number',   enum: [0,1,2,3,4,5,6,7,8,9,10] },
	modificationDate: { type: 'datetime', auto: true,       description: 'Set automatically on every change' },
	insertionDate:    { type: 'datetime', auto: 'onCreate', description: 'Set automatically on first edit' },
};

// Widget used to render exclusive (non-multi) array fields.
// 'select' (default) → single <select> dropdown, inline with the label
// 'radio'            → radio-button group, block layout
var arrayExclusiveWidget = 'select';

// ─── Panel logic (IIFE keeps internals private) ───────────────────────────────
(function () {
	'use strict';

	// ── internal state ────────────────────────────────────────────────────────
	let _el        = null;   // current node or edge
	let _schema    = null;   // schema in use
	let _elType    = null;   // 'node' | 'edge'
	let _expanded  = true;

	// ── build outer panel ─────────────────────────────────────────────────────
	const panel = document.createElement('div');
	panel.id = 'propertiesPanel';
	panel.innerHTML = `
		<div id="propHeader">
			<span id="propTitle">Properties</span>
			<button id="propToggle" title="Minimise / Expand">▶</button>
		</div>
		<div id="propContent">
			<div id="propInfo">No selection</div>
			<div id="propForm"></div>
		</div>
	`;
	document.body.appendChild(panel);

	const propToggle = document.getElementById('propToggle');
	const propInfo   = document.getElementById('propInfo');
	const propForm   = document.getElementById('propForm');

	// ── collapse / expand ─────────────────────────────────────────────────────
	function expandPanel() {
		_expanded = true;
		panel.classList.remove('prop-collapsed');
		propToggle.textContent = '▶';
	}
	function collapsePanel() {
		_expanded = false;
		panel.classList.add('prop-collapsed');
		propToggle.textContent = '◀';
	}
	propToggle.addEventListener('click', () => _expanded ? collapsePanel() : expandPanel());

	// ── helpers ───────────────────────────────────────────────────────────────
	function labelFromKey(key) {
		return key
			.replace(/([A-Z])/g, ' $1')
			.replace(/^./, s => s.toUpperCase());
	}
	function fmtDate(iso) {
		if (!iso) return '—';
		const d = new Date(iso);
		return d.toLocaleDateString() + ' '
			+ d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
	}

	// Resolve the option list for an array-type field.
	// Supports both { type:'array', enum:[...] } and { type:'array', items:{enum:[...]} }
	function arrayOpts(def) {
		return def.enum ?? def.items?.enum ?? [];
	}

	// ── build a single form row from one schema entry ─────────────────────────
	// ns: namespace prefix for radio-group names — avoids collisions between
	//     the main panel and the inline popup when both are visible.
	function buildRow(key, def, ns = '') {
		// Exclusive-array with select widget renders inline (like other selects)
		const isExclusiveSelect = def.type === 'array' && !def.multi && arrayExclusiveWidget !== 'radio';
		const isInlineRow = isExclusiveSelect || ((def.enum || def.type === 'datetime') && def.type !== 'array');
		const wrap = document.createElement('div');
		wrap.className = isInlineRow ? 'pg pg-row' : 'pg';
		wrap.dataset.schemaKey = key;

		const lbl = document.createElement('label');
		lbl.textContent = labelFromKey(key);
		if (def.description) lbl.title = def.description;
		wrap.appendChild(lbl);

		let ctrl;

		if (def.auto) {
			// ── read-only date / value ──
			ctrl = document.createElement('span');
			ctrl.className = 'prop-auto';
			ctrl.textContent = '—';

		} else if (def.type === 'array' && !def.multi) {
			if (arrayExclusiveWidget === 'radio') {
				// ── radio buttons (exclusive — pick one) ──
				ctrl = document.createElement('div');
				ctrl.className = 'prop-radios';
				const radioName = `pe_radio_${ns}${key}`;
				arrayOpts(def).forEach(opt => {
					const id  = `pe_${ns}${key}_${opt}`;
					const rb  = document.createElement('input');
					rb.type  = 'radio';
					rb.name  = radioName;
					rb.value = String(opt);
					rb.id    = id;
					// Allow deselecting by clicking the already-selected option
					let _wasChecked = false;
					rb.addEventListener('mousedown', () => { _wasChecked = rb.checked; });
					rb.addEventListener('click', () => {
						if (_wasChecked) {
							rb.checked = false;
							rb.dispatchEvent(new Event('change', { bubbles: true }));
						}
					});
					const lab = document.createElement('label');
					lab.htmlFor = id;
					lab.textContent = opt;
					lab.className = 'prop-check-label';
					const item = document.createElement('span');
					item.className = 'prop-check-item';
					item.appendChild(rb);
					item.appendChild(lab);
					ctrl.appendChild(item);
				});
			} else {
				// ── select dropdown (exclusive — default) ──
				ctrl = document.createElement('select');
				ctrl.className = 'prop-ctrl';
				const blank = document.createElement('option');
				blank.value = '';
				blank.textContent = '—';
				ctrl.appendChild(blank);
				arrayOpts(def).forEach(opt => {
					const o = document.createElement('option');
					o.value = String(opt);
					o.textContent = opt;
					ctrl.appendChild(o);
				});
			}

		} else if (def.type === 'array') {
			// ── checkboxes (inclusive — pick many, multi: true) ──
			ctrl = document.createElement('div');
			ctrl.className = 'prop-checks';
			arrayOpts(def).forEach(opt => {
				const id  = `pe_${ns}${key}_${opt}`;
				const cb  = document.createElement('input');
				cb.type = 'checkbox';
				cb.value = String(opt);
				cb.id = id;
				const lab = document.createElement('label');
				lab.htmlFor = id;
				lab.textContent = opt;
				lab.className = 'prop-check-label';
				const item = document.createElement('span');
				item.className = 'prop-check-item';
				item.appendChild(cb);
				item.appendChild(lab);
				ctrl.appendChild(item);
			});

		} else if (def.enum) {
			// ── select ──
			ctrl = document.createElement('select');
			ctrl.className = 'prop-ctrl';
			const blank = document.createElement('option');
			blank.value = '';
			blank.textContent = '—';
			ctrl.appendChild(blank);
			def.enum.forEach(opt => {
				const o = document.createElement('option');
				o.value = String(opt);
				o.textContent = opt;
				ctrl.appendChild(o);
			});

		} else if (def.type === 'links') {
			// ── clickable URL list ──
			// Single click: select.  Double click: open URL.  × button: remove.
			ctrl = document.createElement('div');
			ctrl.className = 'prop-links';

			const _ul = document.createElement('ul');
			_ul.className = 'links-list';
			ctrl.appendChild(_ul);

			const _addRow = document.createElement('div');
			_addRow.className = 'links-add-row';
			const _addInput = document.createElement('input');
			_addInput.type = 'text';
			_addInput.placeholder = 'https://…';
			_addInput.className = 'links-input';
			const _addBtn = document.createElement('button');
			_addBtn.type = 'button';
			_addBtn.textContent = '+';
			_addBtn.title = 'Add link';
			_addBtn.className = 'links-add-btn';
			_addRow.appendChild(_addInput);
			_addRow.appendChild(_addBtn);
			ctrl.appendChild(_addRow);

			function _makeLinkItem(url) {
				url = url.trim();
				if (!url) return;
				const li = document.createElement('li');
				li.className = 'links-item';
				li.dataset.url = url;
				const urlSpan = document.createElement('span');
				urlSpan.className = 'links-url';
				urlSpan.textContent = url;
				const rmBtn = document.createElement('button');
				rmBtn.type = 'button';
				rmBtn.className = 'links-remove';
				rmBtn.textContent = '×';
				rmBtn.title = 'Remove';
				li.appendChild(urlSpan);
				li.appendChild(rmBtn);
				_ul.appendChild(li);
				li.addEventListener('click', (ev) => {
					if (ev.target === rmBtn) return;
					_ul.querySelectorAll('.links-item').forEach(el => el.classList.remove('links-selected'));
					li.classList.add('links-selected');
				});
				li.addEventListener('dblclick', (ev) => {
					if (ev.target === rmBtn) return;
					window.open(li.dataset.url, '_blank', 'noopener');
				});
				rmBtn.addEventListener('click', () => {
					_ul.removeChild(li);
					ctrl.dispatchEvent(new Event('change', { bubbles: true }));
				});
			}

			function _commitAdd() {
				const url = _addInput.value.trim();
				if (!url) return;
				_makeLinkItem(url);
				_addInput.value = '';
				ctrl.dispatchEvent(new Event('change', { bubbles: true }));
			}
			_addBtn.addEventListener('click', _commitAdd);
			_addInput.addEventListener('keydown', (ev) => {
				if (ev.key === 'Enter') { ev.preventDefault(); _commitAdd(); }
			});

			ctrl._fillLinks = (value) => {
				_ul.innerHTML = '';
				if (value) value.split('\n').filter(u => u.trim()).forEach(u => _makeLinkItem(u));
			};
			ctrl._readLinks = () =>
				[..._ul.querySelectorAll('.links-item')].map(li => li.dataset.url).join('\n');

		} else if (def.rows) {
			// ── textarea ──
			ctrl = document.createElement('textarea');
			ctrl.className = 'prop-ctrl';
			ctrl.rows = def.rows;

		} else {
			// ── single-line input ──
			ctrl = document.createElement('input');
			ctrl.type = 'text';
			ctrl.className = 'prop-ctrl';
		}

		wrap.appendChild(ctrl);
		return wrap;
	}

	// ── render form from schema ───────────────────────────────────────────────
	function renderForm(schema) {
		propForm.innerHTML = '';
		for (const [key, def] of Object.entries(schema)) {
			propForm.appendChild(buildRow(key, def));
		}
		propForm.addEventListener('input',  onFormChange);
		propForm.addEventListener('change', onFormChange);
	}

	// ── fill form fields from element ─────────────────────────────────────────
	function fillForm(schema, el) {
		for (const [key, def] of Object.entries(schema)) {
			const row = propForm.querySelector(`[data-schema-key="${key}"]`);
			if (!row) continue;
			const value = el[key];

			if (def.auto) {
				const span = row.querySelector('.prop-auto');
				if (span) span.textContent = fmtDate(value);

			} else if (def.type === 'array' && !def.multi) {
				// exclusive: stored as a single string (or first element of legacy array)
				const val = typeof value === 'string' ? value
					: (Array.isArray(value) ? (value[0] ?? '') : '');
				if (row.querySelector('input[type="radio"]')) {
					row.querySelectorAll('input[type="radio"]').forEach(rb => {
						rb.checked = rb.value === val;
					});
				} else {
					const ctrl = row.querySelector('.prop-ctrl');
					if (ctrl) ctrl.value = val;
				}

			} else if (def.type === 'array') {
				// inclusive (multi: true): stored as string[]
				const arr = Array.isArray(value) ? value : [];
				row.querySelectorAll('input[type="checkbox"]').forEach(cb => {
					cb.checked = arr.includes(cb.value);
				});

			} else if (def.type === 'links') {
				const lc = row.querySelector('.prop-links');
				if (lc?._fillLinks) lc._fillLinks(value ?? '');

			} else {
				const ctrl = row.querySelector('.prop-ctrl');
				if (ctrl) ctrl.value = (value != null) ? String(value) : '';
			}
		}
	}

	// ── read form → write back to element ────────────────────────────────────
	function onFormChange() {
		if (!_el || !_schema) return;
		const now = new Date().toISOString();

		for (const [key, def] of Object.entries(_schema)) {
			if (def.auto) continue;

			const row = propForm.querySelector(`[data-schema-key="${key}"]`);
			if (!row) continue;

			if (def.type === 'array' && !def.multi) {
				// exclusive: store single string or undefined
				if (row.querySelector('input[type="radio"]')) {
					const rb = row.querySelector('input[type="radio"]:checked');
					_el[key] = rb ? rb.value : undefined;
				} else {
					const ctrl = row.querySelector('.prop-ctrl');
					_el[key] = ctrl && ctrl.value ? ctrl.value : undefined;
				}

			} else if (def.type === 'array') {
				// inclusive (multi: true): store string[]
				const checked = [...row.querySelectorAll('input[type="checkbox"]:checked')]
					.map(cb => cb.value);
				_el[key] = checked.length ? checked : undefined;

			} else if (def.type === 'links') {
				const lc = row.querySelector('.prop-links');
				_el[key] = lc?._readLinks?.() || undefined;

			} else {
				const ctrl = row.querySelector('.prop-ctrl');
				if (!ctrl) continue;
				const val = ctrl.value;

				if (def.type === 'number') {
					_el[key] = val !== '' ? Number(val) : undefined;
				} else if (def.enum) {
					_el[key] = val || undefined; // blank option → undefined
				} else {
					_el[key] = val; // string: keep as-is (including empty)
				}
			}
		}

		// Manage auto dates
		_el.modificationDate = now;
		if (!_el.insertionDate) _el.insertionDate = now;

		// Refresh auto-field displays
		refreshAutoFields();

		// Update info line when label changes
		if (_elType === 'node') {
			propInfo.textContent = `Node: ${_el.label || '(unlabelled)'}  [${_el.id}]`;
		}

		window.graph?.draw?.();
	}

	function refreshAutoFields() {
		if (!_el || !_schema) return;
		for (const [key, def] of Object.entries(_schema)) {
			if (!def.auto) continue;
			const row = propForm.querySelector(`[data-schema-key="${key}"]`);
			const span = row?.querySelector('.prop-auto');
			if (span) span.textContent = fmtDate(_el[key]);
		}
	}

	// ── called by onSelectionChange hook from base.js ─────────────────────────
	function onSelection(node, edge) {
		_el     = node || edge || null;
		_elType = node ? 'node' : (edge ? 'edge' : null);

		if (!_el) {
			propInfo.textContent = 'No selection';
			propForm.innerHTML = '<div class="prop-empty">Select a node or edge to edit its properties.</div>';
			_schema = null;
			return;
		}

		const schema = _elType === 'node' ? nodeSchema : edgeSchema;

		// Rebuild form when type switches (node ↔ edge)
		if (schema !== _schema) {
			renderForm(schema);
			_schema = schema;
		}

		const info = _elType === 'node'
			? `Node: ${_el.label || '(unlabelled)'}  [${_el.id}]`
			: `Edge: ${_el.from?.label || '?'} → ${_el.to?.label || '?'}`;
		propInfo.textContent = info;

		fillForm(schema, _el);
	}

	// ── hook into base.js ─────────────────────────────────────────────────────
	window.addEventListener('load', () => {
		window.graph.onSelectionChange       = onSelection;
		window.graph.doubleclickFunction     = (node) => _showPopup(node, 'node');
		window.graph.doubleclickEdgeFunction = (edge) => _showPopup(edge, 'edge');
		window.graph.onPostDraw              = _repositionPopup;

		// Populate right-click context menu from the node category enum.
		const cats = nodeSchema?.category?.enum ?? nodeSchema?.category?.items?.enum ?? null;
		if (cats?.length) window.graph.nodeContextOptions = cats;
	});

	// ── F6: expand + focus first editable field ───────────────────────────────
	window.addEventListener('keydown', (e) => {
		if (e.key !== (window.keyBindings?.focusProps ?? 'F6')) return;
		e.preventDefault();
		const hasSel = window.graph?.selectedNode || window.graph?.selectedEdge;
		if (!hasSel) return;
		expandPanel();
		const first = propForm.querySelector('.prop-ctrl, input[type="checkbox"]');
		if (first) { first.focus(); if (first.select) first.select(); }
	});

	// ── Inline quick-edit popup ────────────────────────────────────────────────
	// Opens below a double-clicked node or edge; follows pan/zoom via onPostDraw.

	const NODE_QUICK = ['label', 'category', 'language'];
	const EDGE_QUICK = ['label', 'category'];

	let _popupEl   = null; // node or edge currently shown in popup
	let _popupType = null; // 'node' | 'edge'

	const _popup = document.createElement('div');
	_popup.id = 'inlinePopup';
	_popup.style.display = 'none';
	document.body.appendChild(_popup);

	// Convert graph-space coords to screen-space popup anchor (below the element).
	function _popupAnchor(el, type) {
		const { scale, offsetX, offsetY, R } = window.graph;
		if (type === 'node') {
			return { sx: el.x * scale + offsetX, sy: el.y * scale + offsetY + R * scale + 6 };
		}
		// edge: anchor to midpoint
		const mx = (el.from.x + el.to.x) / 2;
		const my = (el.from.y + el.to.y) / 2;
		return { sx: mx * scale + offsetX, sy: my * scale + offsetY + 14 };
	}

	function _repositionPopup() {
		if (!_popupEl) return;
		const { sx, sy } = _popupAnchor(_popupEl, _popupType);
		_popup.style.left = sx + 'px';
		_popup.style.top  = sy + 'px';
	}

	function _fillPopup(schema, el, fields) {
		fields.forEach(key => {
			const def = schema[key];
			if (!def) return;
			const row = _popup.querySelector(`[data-schema-key="${key}"]`);
			if (!row) return;
			const value = el[key];
			if (def.type === 'array' && !def.multi) {
				// exclusive: stored as single string (or first element of legacy array)
				const val = typeof value === 'string' ? value
					: (Array.isArray(value) ? (value[0] ?? '') : '');
				if (row.querySelector('input[type="radio"]')) {
					row.querySelectorAll('input[type="radio"]').forEach(rb => {
						rb.checked = rb.value === val;
					});
				} else {
					const ctrl = row.querySelector('.prop-ctrl');
					if (ctrl) ctrl.value = val;
				}
			} else if (def.type === 'array') {
				// inclusive (multi: true): stored as string[]
				const arr = Array.isArray(value) ? value : [];
				row.querySelectorAll('input[type="checkbox"]').forEach(cb => {
					cb.checked = arr.includes(cb.value);
				});
			} else {
				const ctrl = row.querySelector('.prop-ctrl');
				if (ctrl) ctrl.value = (value != null) ? String(value) : '';
			}
		});
	}

	function _onPopupChange() {
		if (!_popupEl) return;
		const schema = _popupType === 'node' ? nodeSchema : edgeSchema;
		const fields = _popupType === 'node' ? NODE_QUICK : EDGE_QUICK;
		const now = new Date().toISOString();

		fields.forEach(key => {
			const def = schema[key];
			if (!def || def.auto) return;
			const row = _popup.querySelector(`[data-schema-key="${key}"]`);
			if (!row) return;
			if (def.type === 'array' && !def.multi) {
				// exclusive: store single string or undefined
				if (row.querySelector('input[type="radio"]')) {
					const rb = row.querySelector('input[type="radio"]:checked');
					_popupEl[key] = rb ? rb.value : undefined;
				} else {
					const ctrl = row.querySelector('.prop-ctrl');
					_popupEl[key] = ctrl && ctrl.value ? ctrl.value : undefined;
				}
			} else if (def.type === 'array') {
				// inclusive (multi: true): store string[]
				const checked = [...row.querySelectorAll('input[type="checkbox"]:checked')]
					.map(cb => cb.value);
				_popupEl[key] = checked.length ? checked : undefined;
			} else {
				const ctrl = row.querySelector('.prop-ctrl');
				if (!ctrl) return;
				const val = ctrl.value;
				if (def.enum) _popupEl[key] = val || undefined;
				else _popupEl[key] = val;
			}
		});

		_popupEl.modificationDate = now;
		if (!_popupEl.insertionDate) _popupEl.insertionDate = now;

		// Keep main panel in sync if it shows the same element
		if (_el && _schema && _el === _popupEl) {
			fillForm(_schema, _el);
			refreshAutoFields();
			if (_elType === 'node') {
				propInfo.textContent = `Node: ${_el.label || '(unlabelled)'}  [${_el.id}]`;
			}
		}

		window.graph?.draw?.();
	}

	function _showPopup(el, type) {
		_popupEl   = el;
		_popupType = type;
		const schema = type === 'node' ? nodeSchema : edgeSchema;
		const fields = type === 'node' ? NODE_QUICK : EDGE_QUICK;

		_popup.innerHTML = '';
		_popup.removeEventListener('input',  _onPopupChange);
		_popup.removeEventListener('change', _onPopupChange);

		fields.forEach(key => {
			const def = schema[key];
			if (def) _popup.appendChild(buildRow(key, def, 'p_'));
		});
		_fillPopup(schema, el, fields);

		_popup.addEventListener('input',  _onPopupChange);
		_popup.addEventListener('change', _onPopupChange);

		_repositionPopup();
		_popup.style.display = 'flex';

		// Focus first editable field after paint
		setTimeout(() => {
			const first = _popup.querySelector('.prop-ctrl, input[type="checkbox"], input[type="radio"]');
			if (first) { first.focus(); if (first.select) first.select(); }
		}, 0);
	}

	function _hidePopup() {
		if (!_popupEl) return;
		_popupEl   = null;
		_popupType = null;
		_popup.style.display = 'none';
		_popup.removeEventListener('input',  _onPopupChange);
		_popup.removeEventListener('change', _onPopupChange);
	}

	// Close popup on Escape (even when a field inside it is focused)
	window.addEventListener('keydown', (e) => {
		if (e.key !== 'Escape' || !_popupEl) return;
		e.stopPropagation();
		_hidePopup();
	}, true); // capture phase so it fires before base.js handler

	// Close popup when clicking outside it
	document.addEventListener('mousedown', (e) => {
		if (_popupEl && !_popup.contains(e.target)) _hidePopup();
	});

	// Expose for external control if needed
	window.propertiesEditor = {
		expandPanel,
		collapsePanel,
		forceRebuild: () => { _schema = null; onSelection(
			window.graph?.selectedNode ?? null,
			window.graph?.selectedEdge ?? null
		); },
	};
})();
