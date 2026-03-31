// config.js
// Defines node/edge schemas and category→visual mappings.
// Edit this file (or config.json when served via HTTP) to customise the app.
//
// config.json is the canonical source; this file embeds the same values so the
// app works on file:// without any network request.
// When served via HTTP, config.json is fetched asynchronously and, if found,
// its values replace the ones below.

(function () {

	// ── Embedded configuration ─────────────────────────────────────────────────
	// Keep in sync with config.json.

	window.nodeSchema = {
		label:            { type: 'string',   description: 'Visible label' },
		text:             { type: 'string',   description: 'Main text', rows: 2 },
		category:         { type: 'array',    enum: ['concept', 'form', 'composition', 'predicate'] },
		language:         { type: 'array',    enum: ['lat', 'gr', 'PIE', 'ar', 'es', 'en', 'fr', 'de', 'pt'] },
		description:      { type: 'string',   rows: 3 },
		notes:            { type: 'string',   rows: 3 },
		links:            { type: 'links' },
		state:            { type: 'string',   enum: ['ignored', 'pending', 'hard', 'done'] },
		importance:       { type: 'number',   enum: [0,1,2,3,4,5,6,7,8,9,10] },
		modificationDate: { type: 'datetime', auto: true,         description: 'Set automatically on every change' },
		insertionDate:    { type: 'datetime', auto: 'onCreate',   description: 'Set automatically on first edit' },
	};

	window.edgeSchema = {
		label:            { type: 'string',   description: 'Visible label' },
		category:         { type: 'array',    enum: [
			"copied form",

			// lexical hyponymy, hypernymy
			// semantic drift: generalization, specialization 
			"is a",
			// "troponymy",
			"is a way to",

			// semantic drift: metaphor 
			"similarity",

			/*
			La metonimia consiste en llamar a una cosa con el nombre de otra con la que mantiene una relación de contigüidad: causa-efecto, contenedor-contenido, autor-obra, lugar-institución, parte-todo, etc.
			Si quieres evitar tecnicismos, también puedes decir:
			“Dos objetos o hechos que están próximos en la realidad o que coocurren (se dan juntos)”.
			“No se parecen, sino que están relacionados por cercanía, causa o pertenencia.”
			*/
			// semantic drift: metonymy
			// coocurrir coexistir *cooccurrence
			"contiguity",
			// meronymy holonymy
			"has part",
			// un criterio es que la fecha sea una implicación todo->parte, gorrión->ave
			"characteristic action",
			"causes",

			"otherwise related",
		] },
		// troponymy 	Each listed troponym denotes a particular way to do this entry’s referent. 	====Troponyms====
		// Comeronymy 	Each listed comeronym shares this entry's referent as a holonym with another word or phrase. 	====Comeronyms====
		// Coordinate term 	Each listed coordinate term shares a hypernym with this entry. 	====Coordinate terms====

		description:      { type: 'string',   rows: 3 },
		notes:            { type: 'string',   rows: 3 },
		state:            { type: 'string',   enum: ['ignored', 'pending', 'hard', 'done'] },
		importance:       { type: 'number',   enum: [0,1,2,3,4,5,6,7,8,9,10] },
		modificationDate: { type: 'datetime', auto: true,         description: 'Set automatically on every change' },
		insertionDate:    { type: 'datetime', auto: 'onCreate',   description: 'Set automatically on first edit' },
	};

	// ── Canvas / node geometry ──────────────────────────────────────────────────
	window.R = 20; // node radius in world-space pixels

	// ── Interaction flags ────────────────────────────────────────────────────────
	window.editableText  = true;   // F2 / double-click edits node/edge labels
	window.enableTooltip = true;   // show hover tooltip on nodes
	window.tooltipAlign  = 'left'; // 'left' | 'center' | 'right'

	// ── Keyboard shortcuts ───────────────────────────────────────────────────────
	// Each value is the e.key string checked in the corresponding handler.
	// Modifier keys (Alt, Ctrl, Shift) are NOT listed here — they stay in code.
	window.keyBindings = {
		rename:      'F2',         // base.js          — rename selected node / edge
		cycleType:   'F3',         // base.js          — cycle category / type (plain F3)
		cycleShape:  'F3',         // visualPatterns   — cycle node shape     (Ctrl+F3)
		cycleColor:  'F3',         // visualPatterns   — cycle node color     (Shift+F3)
		toggleLock:  'F4',         // base.js          — toggle lock
		focusProps:  'F6',         // propertiesEditor — focus properties panel
		delete:      'Delete',     // base.js          — remove selection
		historyBack: 'ArrowLeft',  // nodeHistory      — Alt+← navigate back
		historyFwd:  'ArrowRight', // nodeHistory      — Alt+→ navigate forward
		search:      'f',          // search.js        — Ctrl+F open search panel
		ollamaQuery: 'F12',        // ollama.js        — open Ollama prompt modal
	};

	// When true, F3 cycles through category values (from nodeSchema / edgeSchema)
	// instead of the raw type/shape-color index.
	window.f3CyclesCategory = true;

	// Default layout mode used by the "Redraw" button.
	// Supported: 'dagre-vertical' | 'dagre-horizontal' | 'dagre-compact' | 'dagre-wide' |
	//            'elk-layered' | 'elk-stress' | 'elk-mrtree' |
	//            'gv-dot' | 'gv-neato' | 'gv-fdp' | 'gv-sfdp' |
	//            'cola' | 'cola-down' | 'cola-right'
	window.defaultLayout = 'cola';

	// Fields tried in order for the canvas node label. First non-empty value is displayed.
	window.nodeLabelFields = ['label'];

	// Fields tried in order for the canvas edge label. First non-empty value is displayed.
	// Default: show label if set, otherwise fall back to category.
	window.edgeLabelFields = ['label', 'category'];

	// Fields whose values are joined with '\n' and shown as the canvas hover tooltip.
	// Set to [] to disable the dynamic tooltip (falls back to node.tooltip property).
	window.nodeTooltipFields = ['language', 'description'];

	window.categoryStyles = {
		node: {
			concept:     { colorIndex: 3, shapeIndex: 0 }, // purple   circle
			form:        { colorIndex: 1, shapeIndex: 1 }, // green  square
			composition: { colorIndex: 4, shapeIndex: 5 }, // orange rounded
			predicate:   { colorIndex: 2, shapeIndex: 4 }, //  diamond
		},
		edge: {
			// taxonomic
			'is a':                  { typeIndex: 0 }, // solid       blue
			'is a way to':           { typeIndex: 1 }, // dashed      green
			// structural
			'has part':              { typeIndex: 3 }, // long dash   purple
			'contiguity':            { typeIndex: 3 }, // long dash   purple
			// causal / dynamic
			'causes':                { typeIndex: 2 }, // dotted      red
			'characteristic action': { typeIndex: 5 }, // short dash  olive
			// associative / formal
			'similarity':            { typeIndex: 4 }, // dash-dot    orange
			'otherwise related':     { typeIndex: 4 }, // dash-dot    orange
			'copied form':           { typeIndex: 5 }, // short dash  olive
		},
	};

	// ── Optional: override from config.json when served via HTTP ───────────────
	// Uses fetch() (async) so file:// is never touched.
	// On success the panel and canvas are refreshed automatically.
	if (window.location.protocol !== 'file:') {
		fetch('config.json')
			.then(r => r.ok ? r.json() : Promise.reject())
			.then(cfg => {
				if (cfg.nodeSchema)     window.nodeSchema     = cfg.nodeSchema;
				if (cfg.edgeSchema)     window.edgeSchema     = cfg.edgeSchema;
				if (cfg.categoryStyles) window.categoryStyles = cfg.categoryStyles;
				// Rebuild the properties panel with the new schema
				if (window.propertiesEditor) window.propertiesEditor.forceRebuild();
				// Redraw so category styles apply immediately
				if (typeof draw === 'function') draw();
			})
			.catch(() => { /* config.json absent or invalid — use embedded values above */ });
	}

})();
