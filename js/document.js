// document.js
// The document: what a file holds, and what the panels are a view of.
//
// **The editor used to be the document.** `window.graph.nodes` *were* the file,
// and that works exactly as long as a file holds one graph. It stopped being
// true the moment a file could hold several, because then you show one and keep
// the rest — and if the editor is the document, "the rest" lives nowhere and
// disappears the first time you save.
//
// So there is now a layer above the editors:
//
//     document = [ group, group, … ]          what the file holds
//     group    = { …metadata, graphs: [ … ] }
//     panels   = the graphs of the current group, up to MAX_PANELS
//
// The editors become **views** onto `doc.groups[doc.cursor].graphs[i]`.
//
// ── The two accepted shapes ─────────────────────────────────────────────────
//
//     { nodes, edges }                  one graph. The format this editor has
//                                       always written, and every old file.
//     [ { …, graphs: [ … ] }, … ]       a collection of groups. The format the
//                                       transformation fork already writes.
//
// **And nothing else, on purpose.** A bare `[ {nodes,edges}, {nodes,edges} ]`
// is refused rather than guessed at, because it cannot be read without
// guessing: two graphs meant to be compared, or two unrelated graphs that
// happen to share a file? Choosing wrong in silence either pairs things that do
// not belong together or splits a pair into two documents. Nobody has written
// that file yet, so refusing costs nothing today and saves an ambiguity
// forever.
//
// Note what does the telling: **each shape is known by its own keys**, `nodes`
// for a graph and `graphs` for a group, not by how many brackets it sits under.
// A format that explains itself by its content cannot be misread by someone
// editing it in a text editor.
//
// ── What is written back ────────────────────────────────────────────────────
//
// The shape you have is the shape that is written. One group holding one graph
// with no metadata goes out as `{nodes, edges}`; anything richer goes out as
// the array. So opening an old file, moving a node and saving gives back an old
// file — **nobody finds their file converted for having touched it.**
//
// And whatever this editor does not show, it still writes: a group's
// `description`, `commentary` and timestamps, the per-graph `validated` flag,
// and any graph beyond the last panel. The rule throughout is that **you never
// lose data you could not display**.

(function () {
	'use strict';

	/** Fields this editor does not show but must hand back untouched. */
	const KEPT = ['id', 'name', 'description', 'commentary', 'createdAt', 'updatedAt'];

	const doc = {
		/** @type {Array<{graphs: Array<object>}>} */
		groups: [],
		/** Which group the panels are showing. */
		cursor: 0,
		/** Name of the file this came from, reused when saving. */
		filename: 'graph.json',
		/** True when the file we read was a bare `{nodes, edges}`. */
		wasFlat: true,
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


	// ── Reading ───────────────────────────────────────────────────────────────

	/**
	 * Turn parsed JSON into groups. Throws, with a readable reason, on anything
	 * that is neither of the two shapes.
	 */
	function parse(data) {
		if (data && typeof data === 'object' && !Array.isArray(data) && data.nodes) {
			doc.wasFlat = true;
			return [{ graphs: [data] }];
		}
		if (Array.isArray(data)) {
			const stray = data.findIndex(item => !item || !Array.isArray(item.graphs));
			if (stray !== -1) {
				const item = data[stray];
				throw new Error(
					item && item.nodes
						? `Entry ${stray + 1} of this file is a bare graph, not a group. ` +
						  `An array of graphs is ambiguous — are they two versions of one ` +
						  `thing, or two unrelated graphs? Wrap each one as ` +
						  `{"graphs": [ … ]} to say which.`
						: `Entry ${stray + 1} of this file has no "graphs" key, so it is not a group.`);
			}
			doc.wasFlat = false;
			return data;
		}
		throw new Error('Unrecognised file: expected {nodes, edges} or an array of groups.');
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
		const group   = doc.groups[index];
		if (!group) return;
		doc.cursor = index;

		const graphs = group.graphs;
		if (graphs.length > editors.length) {
			console.warn(
				`This group holds ${graphs.length} graphs and there are ${editors.length} ` +
				`panel(s). The rest are not shown, and are written back untouched on save.`);
		}
		// **How many panels there are is the document's business.** MAX_PANELS
		// is a ceiling — how many this page could hold — and the group says how
		// many it wants. Open a file with one graph and you get one panel, even
		// on a page built for two.
		doc.visible = Math.min(graphs.length, editors.length);
		document.body.className = document.body.className
			.replace(/\bpanels-\d+\b/g, '').trim() + ` panels-${doc.visible}`;
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
		const group   = doc.group;
		if (!group) return;
		const n = Math.min(group.graphs.length, editors.length);
		for (let i = 0; i < n; i++) {
			// Per-graph fields this editor does not show survive the round trip.
			const kept = group.graphs[i].validated;
			group.graphs[i] = editors[i].toJSON();
			if (kept != null) group.graphs[i].validated = kept;
		}
	}


	// ── Writing ───────────────────────────────────────────────────────────────

	/** True when the document is one group, one graph, and carries no metadata. */
	function isFlat() {
		if (doc.groups.length !== 1) return false;
		const group = doc.groups[0];
		if (!group || group.graphs.length !== 1) return false;
		return !KEPT.some(k => group[k] != null) && group.graphs[0].validated == null;
	}

	/**
	 * Whether this document is more than a lone graph, and so whether the group
	 * bar has anything to say.
	 *
	 * **The data decides the interface.** Open a file this editor has always
	 * written and the page is the page it always was; open a collection and the
	 * controls for moving through it appear, because now there is somewhere to
	 * move to. Nobody chooses a mode: the file already said which one it is.
	 */
	function isCollection() { return doc.groups.length > 1 || !isFlat(); }

	/**
	 * Set a metadata field on the current group — `name`, `description`,
	 * `commentary`. Writing one is what turns a lone graph into a document
	 * worth keeping as a collection, so `isCollection()` follows.
	 */
	function setMeta(field, value) {
		const group = doc.group;
		if (!group) return;
		if (value) group[field] = value; else delete group[field];
	}

	/** The document as it should be written: the shape you have. */
	function serialize() {
		collect();
		return isFlat() ? doc.groups[0].graphs[0] : doc.groups;
	}


	// ── Shape commands ────────────────────────────────────────────────────────

	/**
	 * Turn the current group's single graph into two, the second a copy of the
	 * first **with the node ids preserved**.
	 *
	 * The shared id is the whole point of a pair: the same id in both graphs
	 * means the same element, so the difference between them can be read off
	 * without annotating anything. You start with everything paired and break
	 * pairs as you edit the second one — which is how a transformation gets
	 * authored.
	 */
	function splitInTwo() {
		collect();
		const group = doc.group;
		if (!group || group.graphs.length !== 1) return false;
		group.graphs.push(JSON.parse(JSON.stringify(group.graphs[0])));
		show(doc.cursor);
		return true;
	}

	/** Drop back to a single graph, discarding the others in this group. */
	function mergeToOne() {
		collect();
		const group = doc.group;
		if (!group || group.graphs.length < 2) return false;
		group.graphs = [group.graphs[0]];
		show(doc.cursor);
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

	/** Start over: one group, one empty graph, flat on save. */
	function reset() {
		doc.groups   = [{ graphs: [{ nodes: [], edges: [] }] }];
		doc.cursor   = 0;
		doc.wasFlat  = true;
		doc.filename = 'graph.json';
		show(0);
	}

	window.doc = Object.assign(doc, {
		parse, load, show, collect, serialize, isFlat, isCollection, setMeta,
		splitInTwo, mergeToOne, addGroup, goTo, goToGroup, reset,
	});

	// One group holding whatever the page started with, so `doc` is never empty.
	window.addEventListener('load', () => {
		if (!doc.groups.length) reset();
	});
})();
