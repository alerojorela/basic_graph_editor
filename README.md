# Directed Graph Editor

A lightweight, client-side directed graph editor built with vanilla JS and Canvas. No build step, no framework.

## Interactions

| Gesture | Action |
|---|---|
| Right-click → drag | Create node and edge |
| Right-click on node (no drag) | Context menu: create connected node by category |
| Ctrl + right-click | Insert subgraph from indented or list notation |
| Left-click | Select node or edge |
| Ctrl + click (node) | Add / remove from multi-selection |
| Ctrl + double-click (node) | Select entire connected component |
| Ctrl + click (edge) | Reverse edge direction |
| Drag on empty space | Rubber-band area selection |
| Middle + drag | Pan |
| Mouse wheel | Zoom |
| Middle double-click | Center graph |

## Keyboard shortcuts

| Key | Action |
|---|---|
| F2 | Rename selected node or edge |
| F3 | Cycle category (or type/colour if no schema) |
| Ctrl+F3 | Cycle node shape |
| Shift+F3 | Cycle node colour |
| F4 | Toggle lock |
| F6 | Focus properties panel |
| Del | Delete selection (if unlocked) |
| Alt + ← / → | Node visit history |
| Ctrl+F | Search panel |

## Automatic layout

Via the **Layout** button. Available engines: **ELK** (default: tree), **WebCola**.
Dagre and Graphviz options are present but commented out in `index.html`.

## Modules

| File | Role |
|---|---|
| `config.js` | Schemas, category styles, key bindings |
| `base.js` | `GraphEditor` class — canvas, events, save/load (`window.graph`) |
| `layout.js` | Layout algorithms (ELK, WebCola, Dagre, Graphviz) |
| `visualPatterns.js` | Node shapes and colours; overrides `drawNodeShape` and `TYPES` |
| `propertiesEditor.js` | Schema-driven side panel and inline popup |
| `nodeHistory.js` | Alt+← / Alt+→ navigation history |
| `search.js` | Ctrl+F search panel with advanced filters |
| `extra.js` | Example graph generator; subgraph insertion modal |

Optional modules are independent — any can be removed without breaking the core.

## Save / load

Graphs are saved as JSON (nodes + edges with all properties). All processing is local; no server required.

## Theming

Light / dark mode via CSS variables. Toggle with ☀️ / 🌙 in the toolbar.
