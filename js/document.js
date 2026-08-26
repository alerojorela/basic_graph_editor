// document.js
// The document: what a file holds, and what the panels are a view of.
//
// **The editor used to be the document.** `window.graph.nodes` *were* the file,
// and that works exactly as long as a file holds one graph. It stopped being
// true the moment a file could hold several, because then you show one and keep
// the rest — and if the editor is the document, "the rest" lives nowhere and
// disappears the first time you save.
//
// ── The shape ───────────────────────────────────────────────────────────────
//
//     document = { …metadata, graphs: [ element, … ] }
//
//     element  = graph                          one graph, one panel
//              | { …metadata, graphs: [ … ] }   several, side by side
//
//     graph    = { …metadata, nodes: [ … ], edges: [ … ] }
//
// **`graphs` is always a list**, at both levels, so the key means one thing and
// reading it never asks which of two shapes this is. A lone graph is a
// collection of one, which costs two brackets and buys a rule with no
// exception.
//
// **Every level is an object with its own metadata and the list below it**, and
// each is known by its own keys — `nodes` for a graph, `graphs` for anything
// that holds graphs — never by how many brackets it sits under. A file edited by
// hand cannot be misread, and no level is a bare array, so any of them can gain
// a field later without breaking what is already written.
//
// Two levels of container and no more, on purpose: the interface has exactly two
// dimensions, panels side by side and groups you page through. A third level
// would have nowhere to be shown, and depth you cannot display is depth you lose
// on save. An element inside an element is refused, and said so.
//
// ── What is read, and what is written ───────────────────────────────────────
//
// Read: this shape, plus two older ones that must keep opening — a bare
// `{nodes, edges}`, which is every file this editor wrote before today, and a
// bare `[ {…, graphs:[…]}, … ]`, which is what the transformation fork writes.
//
// Written: **this shape and nothing else**, in the shortest form that loses
// nothing. The output is a function of the content and not of what you happened
// to open, so the same document always gives the same text. An old file opened
// and saved comes back converted, which is the price of having one format
// instead of three.
//
// And whatever this editor does not show, it still writes: a group's
// description and timestamps, a graph's `validated` flag, the document's own
// metadata, and any graph past the last panel. **The rule is that you never lose
// data you could not display**, so metadata is kept by exclusion — everything
// that is not `graphs`, `nodes` or `edges` — and not by a list of the six names
// somebody thought of.

(function () {
	'use strict';

	const doc = {
		/** @type {Array<{graphs: Array<object>}>} */
		groups: [],
		/** The document's own metadata: everything in the file besides `graphs`. */
		meta: {},
		/** Which group the panels are showing. */
		cursor: 0,
		/** Name of the file this came from, reused when saving. */
		filename: 'graph.json',
		/**
		 * How many panels the current group is actually using.
		 *
		 * A plain property and not a getter over a module variable, because
		 * `Object.assign` **calls** a getter and assigns what it returns: the
		 * value would have frozen at whatever it was when this file loaded, and
		 * anyone reading it would have been told "one panel" while two were on
		 * screen. The class on <body> was right the whole time, which is what
		 * made it look like it worked.
		 */
		visible: 1,

		get group() { return this.groups[this.cursor] ?? null; },
	};


	// ── Telling the three things apart ────────────────────────────────────────

	const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
	const isGraph  = value => isObject(value) && Array.isArray(value.nodes);
	const isHolder = value => isObject(value) && value.graphs !== undefined;

	/** Everything that is not the list this level holds. */
	function meta(object, ...own) {
		const out = {};
		for (const [key, value] of Object.entries(object)) {
			if (!own.includes(key)) out[key] = value;
		}
		return out;
	}

	function hasMeta(object, ...own) { return Object.keys(meta(object, ...own)).length > 0; }


	// ── Reading ───────────────────────────────────────────────────────────────

	/** One element of a collection, normalised into a group. */
	function group(element, index) {
		const where = `Entry ${index + 1} of this file`;

		if (isGraph(element) && isHolder(element)) {
			throw new Error(`${where} has both "nodes" and "graphs", so there is no telling ` +
			                `whether it is one graph or several.`);
		}
		if (isGraph(element)) return { graphs: [element] };

		if (isHolder(element)) {
			const graphs = element.graphs;
			if (!Array.isArray(graphs)) {
				throw new Error(`${where} has a "graphs" that is not a list.`);
			}
			const stray = graphs.findIndex(g => !isGraph(g));
			if (stray !== -1) {
				throw new Error(isHolder(graphs[stray])
					? `${where} holds another group inside it. Graphs go two levels deep at ` +
					  `most — a collection of groups, and a group of graphs — because there ` +
					  `is nowhere to show a third.`
					: `${where}, graph ${stray + 1} has no "nodes".`);
			}
			return element;
		}

		throw new Error(Array.isArray(element)
			? `${where} is a bare list. A group of graphs is written ` +
			  `{"graphs": [ … ]}, with room for its name.`
			: `${where} is neither a graph nor a group: it has no "nodes" and no "graphs".`);
	}

	/**
	 * Turn parsed JSON into groups. Throws, with a readable reason, on anything
	 * that is none of the shapes.
	 */
	function parse(data) {
		// Every file this editor wrote before the document layer existed.
		if (isGraph(data) && !isHolder(data)) {
			doc.meta = {};
			return [{ graphs: [data] }];
		}
		// What the transformation fork writes: the collection without its wrapper.
		if (Array.isArray(data)) {
			doc.meta = {};
			return data.map(group);
		}
		if (isHolder(data)) {
			doc.meta = meta(data, 'graphs');
			if (!Array.isArray(data.graphs)) {
				throw new Error('This file\'s "graphs" is not a list. It always is, at ' +
				                'every level, even when it holds one graph.');
			}
			return data.graphs.map(group);
		}
		throw new Error('Unrecognised file: expected {graphs: …}.');
	}

	/** Load parsed JSON into the document and show its first group. */
	function load(data, filename) {
		doc.groups   = parse(data);
		doc.cursor   = 0;
		doc.filename = filename || doc.filename;
		show(0);
	}


	// ── Showing ───────────────────────────────────────────────────────────────

	/**
	 * Point the panels at group `index`.
	 *
	 * A group may hold more graphs than there are panels. It is shown as far as
	 * it fits and said out loud, because the alternative — refusing the file —
	 * loses you the work, and the other alternative — dropping the extra graphs
	 * — loses you the data. Saving writes every graph back, seen or not.
	 */
	function show(index) {
		const editors = window.editors ?? [window.graph];
		const shown   = doc.groups[index];
		if (!shown) return;
		doc.cursor = index;

		const graphs = shown.graphs;
		// **How many panels there are is the document's business.** MAX_PANELS
		// is a ceiling — how many this page could hold — and the group says how
		// many it wants. Open a file with one graph and you get one panel, even
		// on a page built for two.
		doc.visible = Math.min(graphs.length, editors.length);
		document.body.className = document.body.className
			.replace(/\bpanels-\d+\b/g, '').trim() + ` panels-${doc.visible}`;
		// **Every panel on or off first, and only then measure.** They share a
		// flex row, so turning the second one on halves the first one's width:
		// doing both in one pass had each canvas measuring a row that still had
		// the *previous* panels in it, and with three the buffers came out
		// 1260, 630 and 420 for three boxes of 420. Two panels got away with it
		// only because the class change also moves #panels for the properties
		// drawer, and the ResizeObserver then put it right — which is a side
		// effect doing the job, and going from two panels to three does not
		// move #panels at all.
		editors.forEach((editor, i) => {
			// A panel the current group does not fill is off, not empty: an empty
			// canvas beside a graph reads as a graph you lost.
			editor.canvas.style.display = i < doc.visible ? 'block' : 'none';
		});
		editors.forEach((editor, i) => {
			editor.fromJSON(graphs[i] ?? { nodes: [], edges: [] });
			// **An undo stack belongs to a graph, not to a panel.** Without
			// this, moving to the next group and pressing Ctrl+Z pulled the
			// previous group's graph into the panel — and then saving wrote it
			// into the wrong group. Six snapshots of something you are no
			// longer looking at.
			editor._undoStack = [];
			editor._redoStack = [];
			editor.dirty = false;
			editor.resizeCanvas();
			editor.centerGraph();
		});
		// A new group starts at its first panel: keeping the scroll from the last
		// one would open a pipeline in the middle of itself.
		const row = document.getElementById('panels');
		if (row) row.scrollLeft = 0;
		if (typeof window.onDocumentChange === 'function') window.onDocumentChange(doc);
	}

	/**
	 * Copy what the panels hold back into the current group, keeping the rest.
	 *
	 * **Only as many graphs as the group already had.** Writing one per panel
	 * looked right and was not: with two panels open, saving a one-graph file
	 * appended panel B's empty graph and handed back a group of two. Growing a
	 * group is `splitInTwo()`'s job, and it should take saying so — not happen
	 * because a panel was standing there.
	 */
	function collect() {
		const editors = window.editors ?? [window.graph];
		const current = doc.group;
		if (!current) return;
		const n = Math.min(current.graphs.length, editors.length);
		for (let i = 0; i < n; i++) {
			// A graph's own fields — its name, the fork's `validated` — survive
			// the round trip, and by exclusion, so a field nobody here has heard
			// of survives too.
			current.graphs[i] = {
				...meta(current.graphs[i], 'nodes', 'edges'),
				...editors[i].toJSON(),
			};
		}
	}


	// ── Writing ───────────────────────────────────────────────────────────────

	/** True when the whole document is one graph carrying nothing else. */
	function isFlat() {
		if (doc.groups.length !== 1 || hasMeta(doc.meta)) return false;
		const only = doc.groups[0];
		return only.graphs.length === 1 && !hasMeta(only, 'graphs');
	}

	/**
	 * Whether this document is more than a lone graph, and so whether the group
	 * bar has anything to say.
	 *
	 * **The data decides the interface.** Open a file with one graph in it and
	 * the page is the page it always was; open a collection and the controls for
	 * moving through it appear, because now there is somewhere to move to.
	 * Nobody chooses a mode: the file already said which one it is.
	 */
	function isCollection() { return !isFlat(); }

	/**
	 * The document as it should be written: **the shortest form that loses
	 * nothing**, which is a function of the content and not of what was opened.
	 * Two files with the same content give the same text.
	 */
	function serialize() {
		collect();
		// A group with one graph and nothing else to say is written as that
		// graph: the wrapper exists to carry a name and a second panel, and
		// where there is neither it is noise.
		const elements = doc.groups.map(g =>
			(g.graphs.length === 1 && !hasMeta(g, 'graphs')) ? g.graphs[0] : g);
		return { ...doc.meta, graphs: elements };
	}

	/**
	 * Set a metadata field on the current group — `name`, `description`,
	 * `commentary`. Writing one is what turns a lone graph into a document worth
	 * keeping as a collection, so `isCollection()` follows.
	 */
	function setMeta(field, value) {
		const current = doc.group;
		if (!current) return;
		if (value) current[field] = value; else delete current[field];
	}


	// ── Shape commands ────────────────────────────────────────────────────────

	// ── Graphs inside a group ─────────────────────────────────────────────────
	//
	// **These replace `Split into two` and `Merge to one`, and the reason is
	// that those two only ever described the jump from one panel to two.** With
	// a ceiling of three, «split into how many?» has no answer, and «merge»
	// silently picked the first graph as the survivor. Insert and remove say
	// what they do at any count, and where they do it: **at the focused panel**,
	// which is the same rule the rest of the editor already follows.
	//
	// A group may end up holding more graphs than there are panels. That is
	// allowed rather than refused: the editor must be able to author what it can
	// read, and the group bar says how many are on screen and that the rest are
	// written back untouched.

	/** Which panel is focused, as an index into the current group's graphs. */
	function focused() {
		const editors = window.editors ?? [window.graph];
		const i = editors.indexOf(window.graph);
		return i < 0 ? 0 : Math.min(i, (doc.group?.graphs.length ?? 1) - 1);
	}

	/**
	 * Insert an empty graph beside the focused one. `offset` is 0 for before and
	 * 1 for after.
	 */
	function addGraph(offset = 1) {
		collect();
		const current = doc.group;
		if (!current) return false;
		current.graphs.splice(focused() + offset, 0, { nodes: [], edges: [] });
		show(doc.cursor);
		return true;
	}

	/**
	 * Insert a copy of the focused graph after it, **with the node ids
	 * preserved**.
	 *
	 * The shared id is the whole point of a pair: the same id in both graphs
	 * means the same element, so the difference between them can be read off
	 * without annotating anything. You start with everything paired and break
	 * pairs as you edit the copy — which is how a transformation gets authored,
	 * and it is why this is a separate command from adding an empty graph
	 * rather than a variant of it.
	 */
	function duplicateGraph() {
		collect();
		const current = doc.group;
		if (!current) return false;
		const i = focused();
		current.graphs.splice(i + 1, 0, JSON.parse(JSON.stringify(current.graphs[i])));
		show(doc.cursor);
		return true;
	}

	/**
	 * Remove the focused graph. **The last graph of a group takes the group with
	 * it**, because a group with no graphs is not a thing a file can hold, and
	 * leaving an empty one behind would mean paging through blanks.
	 *
	 * The whole document cannot be emptied this way: the last graph of the last
	 * group is refused, and there is `New` for that, which asks first.
	 */
	function removeGraph() {
		collect();
		const current = doc.group;
		if (!current) return false;
		if (current.graphs.length > 1) {
			current.graphs.splice(focused(), 1);
			show(doc.cursor);
			return true;
		}
		if (doc.groups.length === 1) return false;
		doc.groups.splice(doc.cursor, 1);
		show(Math.min(doc.cursor, doc.groups.length - 1));
		return true;
	}

	/** Append an empty group and go to it. This is what makes a collection. */
	function addGroup() {
		collect();
		doc.groups.push({ graphs: [{ nodes: [], edges: [] }] });
		show(doc.groups.length - 1);
		return true;
	}

	/**
	 * Move to another group, keeping what the panels hold. `collect()` first is
	 * the whole of it: leave without collecting and every edit made in this
	 * group is gone, and gone silently, which is the worst way to lose work.
	 */
	function goTo(index) {
		if (index === doc.cursor || index < 0 || index >= doc.groups.length) return false;
		collect();
		show(index);
		return true;
	}

	function goToGroup(delta) { return goTo(doc.cursor + delta); }

	/** Start over: one group, one empty graph, and no metadata anywhere. */
	function reset() {
		doc.groups   = [{ graphs: [{ nodes: [], edges: [] }] }];
		doc.meta     = {};
		doc.cursor   = 0;
		doc.filename = 'graph.json';
		show(0);
	}

	window.doc = Object.assign(doc, {
		parse, load, show, collect, serialize, isFlat, isCollection, setMeta,
		focused, addGraph, duplicateGraph, removeGraph,
		addGroup, goTo, goToGroup, reset,
	});

	// One group holding whatever the page started with, so `doc` is never empty.
	window.addEventListener('load', () => {
		if (!doc.groups.length) reset();
	});
})();
