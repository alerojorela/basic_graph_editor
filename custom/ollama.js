// custom/ollama.js
// F12 on a selected node → editable prompt modal → Ollama API → insert nodes + edges

(function () {
	'use strict';

	const OLLAMA_BASE  = 'http://localhost:11434';
	const OLLAMA_MODEL = 'qwen3:14b';

	const PROMPT_TPL =
		`For the word "{label}", generate 5 poetic metaphors and 5 metonymies in Spanish.\n` +
		`Each must be a short expression. From each expression, extract one single word that best captures its essence — this word must NOT be "{label}" itself.\n` +
		`Respond ONLY with a raw JSON array — no markdown, no explanation, no code blocks.\n` +
		`Format: [{"word": "single word extracted from the expression", "expression": "the full expression"}]`;


	// ── Modal ──────────────────────────────────────────────────────────────────

	let _modal = null;

	function _buildModal(node) {
		// Overlay — same visual pattern as #helpModal
		const overlay = document.createElement('div');
		Object.assign(overlay.style, {
			position: 'fixed', inset: '0',
			background: 'rgba(0,0,0,0.5)',
			display: 'flex', alignItems: 'center', justifyContent: 'center',
			zIndex: '300',
		});

		// Box — same visual pattern as #helpBox
		const box = document.createElement('div');
		Object.assign(box.style, {
			background: 'var(--ui-bg)',
			border: '1px solid var(--ui-border)',
			borderRadius: '10px',
			padding: '18px 22px',
			width: '520px',
			maxWidth: '90vw',
			display: 'flex',
			flexDirection: 'column',
			gap: '12px',
			boxShadow: '0 8px 32px rgba(0,0,0,0.55)',
			color: 'var(--ui-text)',
		});

		// Title
		const title = document.createElement('div');
		title.textContent = `Ollama — "${node.label || node.id}"`;
		title.style.fontWeight = 'bold';

		// Model selector row
		const modelRow = document.createElement('div');
		Object.assign(modelRow.style, { display: 'flex', alignItems: 'center', gap: '8px' });

		const modelLabel = document.createElement('label');
		modelLabel.textContent = 'Model:';
		modelLabel.style.fontSize = '0.85em';

		const modelSelect = document.createElement('select');
		Object.assign(modelSelect.style, {
			flex: '1',
			background: 'var(--ui-bg)', color: 'var(--ui-text)',
			border: '1px solid var(--ui-border)', borderRadius: '4px',
			padding: '4px 6px', fontFamily: 'inherit', fontSize: '0.85em',
		});

		// Seed with the default while the API loads
		const defaultOpt = document.createElement('option');
		defaultOpt.value = OLLAMA_MODEL;
		defaultOpt.textContent = OLLAMA_MODEL;
		modelSelect.appendChild(defaultOpt);

		// Fetch available models and populate the select
		fetch(`${OLLAMA_BASE}/api/tags`)
			.then(r => r.ok ? r.json() : Promise.reject())
			.then(data => {
				const models = (data.models ?? []).map(m => m.name).sort();
				if (!models.length) return;
				modelSelect.innerHTML = '';
				models.forEach(name => {
					const opt = document.createElement('option');
					opt.value = name;
					opt.textContent = name;
					if (name === OLLAMA_MODEL) opt.selected = true;
					modelSelect.appendChild(opt);
				});
				// If the default isn't in the list, select first
				if (!models.includes(OLLAMA_MODEL)) modelSelect.selectedIndex = 0;
			})
			.catch(() => { /* keep default option */ });

		modelRow.append(modelLabel, modelSelect);

		// Prompt textarea
		const textarea = document.createElement('textarea');
		textarea.value = PROMPT_TPL.replaceAll('{label}', node.label || node.id);
		Object.assign(textarea.style, {
			width: '100%', height: '110px', resize: 'vertical',
			background: 'var(--ui-bg)', color: 'var(--ui-text)',
			border: '1px solid var(--ui-border)', borderRadius: '4px',
			padding: '8px', fontFamily: 'inherit', fontSize: '0.85em',
			boxSizing: 'border-box',
		});

		// Status line
		const status = document.createElement('div');
		Object.assign(status.style, { fontSize: '0.82em', opacity: '0.7', minHeight: '1.2em' });

		// Button row — same pattern as #helpCloseRow
		const btnRow = document.createElement('div');
		Object.assign(btnRow.style, { display: 'flex', justifyContent: 'flex-end', gap: '8px' });

		const btnCancel = document.createElement('button');
		btnCancel.textContent = 'Cancel';
		btnCancel.addEventListener('click', _close);

		const btnRun = document.createElement('button');
		btnRun.textContent = 'Run';
		btnRun.addEventListener('click', () => _run(node, modelSelect, textarea, status, btnRun));

		// Ctrl+Enter also submits
		textarea.addEventListener('keydown', e => {
			if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); btnRun.click(); }
		});

		btnRow.append(btnCancel, btnRun);
		box.append(title, modelRow, textarea, status, btnRow);
		overlay.appendChild(box);
		overlay.addEventListener('mousedown', e => { if (e.target === overlay) _close(); });

		overlay._textarea    = textarea;
		overlay._modelSelect = modelSelect;
		overlay._status      = status;
		overlay._btnRun      = btnRun;
		return overlay;
	}

	function _open(node) {
		_close();
		_modal = _buildModal(node);
		document.body.appendChild(_modal);
		_modal._textarea.focus();
		_modal._textarea.select();
	}

	function _close() {
		if (_modal) { _modal.remove(); _modal = null; }
	}


	// ── API call ───────────────────────────────────────────────────────────────

	async function _run(sourceNode, modelSelect, textarea, status, btnRun) {
		const prompt = textarea.value.trim();
		if (!prompt) return;

		const model = modelSelect.value || OLLAMA_MODEL;

		status.textContent = 'Calling Ollama…';
		btnRun.disabled = true;

		let raw;
		try {
			const res = await fetch(`${OLLAMA_BASE}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model, prompt, stream: false }),
			});
			const data = await res.json();
			raw = data.response ?? '';
		} catch (err) {
			status.textContent = `Network error: ${err.message}`;
			btnRun.disabled = false;
			return;
		}

		console.log('[ollama] raw response:', raw);

		// Extract JSON array — tolerates markdown fences and surrounding text
		let items;
		try {
			const match = raw.match(/\[[\s\S]*\]/);
			if (!match) throw new Error('No JSON array found in response');
			items = JSON.parse(match[0]);
			if (!Array.isArray(items) || !items.length) throw new Error('Empty or invalid array');
		} catch (err) {
			status.textContent = `Parse error: ${err.message}`;
			console.warn('[ollama] parse failed:', raw);
			btnRun.disabled = false;
			return;
		}

		console.log('[ollama] parsed items:', items);
		_insertNodes(sourceNode, items);
		_close();
	}


	// ── Graph insertion ────────────────────────────────────────────────────────

	function _insertNodes(sourceNode, items) {
		const g       = window.graph;
		g.recordAction();
		const spacing = g.R * 4;
		const offsetX = g.R * 9;
		const startY  = sourceNode.y - ((items.length - 1) * spacing) / 2;

		items.forEach((item, i) => {
			const newNode = {
				id:    g.randomId(),
				label: String(item.word ?? ''),
				x:     sourceNode.x + offsetX,
				y:     startY + i * spacing,
				category: 'form', type: 0, lock: false,
			};
			g.nodes.push(newNode);
			g.touchElement(newNode, true);

			const newEdge = {
				from:  sourceNode,
				to:    newNode,
				label: String(item.expression ?? ''),
				type: 0, lock: false,
			};
			g.edges.push(newEdge);
			g.touchElement(newEdge, true);
		});

		g.selectedNode  = null;
		g.selectedEdge  = null;
		g.draw();
	}


	// ── Key bindings ───────────────────────────────────────────────────────────

	window.addEventListener('keydown', e => {
		if (e.key !== (window.keyBindings?.ollamaQuery ?? 'F12')) return;
		const tag = e.target.tagName;
		if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
		const node = window.graph?.selectedNode;
		if (!node) return;
		e.preventDefault();
		_open(node);
	});

	// Escape closes (capture phase — fires before other handlers)
	window.addEventListener('keydown', e => {
		if (e.key === 'Escape' && _modal) { e.stopPropagation(); _close(); }
	}, true);

})();
