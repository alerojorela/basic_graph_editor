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
| Drag selected node | Move all multi-selected nodes |
| Middle + drag | Pan |
| Mouse wheel | Zoom viewport |
| Ctrl + mouse wheel | Scale node positions about cursor (spread / compress) |
| Middle double-click | Center graph |

## Keyboard shortcuts

| Key | Action |
|---|---|
| Ctrl+Z | Undo (up to 6 steps) |
| Ctrl+Y / Ctrl+Shift+Z | Redo |
| Ctrl+C | Copy selected nodes (+ internal edges) |
| Ctrl+V | Paste (offset +30 px) |
| F2 | Rename selected node or edge (or all selected) |
| F3 | Cycle category to same value across selection |
| Ctrl+F3 | Cycle node shape independently per node |
| Shift+F3 | Cycle node colour independently per node |
| F4 | Toggle lock |
| F6 | Focus properties panel |
| Del | Delete selection (if unlocked) |
| Alt + ← / → | Node visit history |
| Ctrl+F | Search panel (nodes by default) |

## Automatic layout

Via the **Layout** menu. Available engines: **ELK** (default: tree), **WebCola**.
Selecting a layout option applies it immediately. Dagre and Graphviz options are present but commented out.

## Modules

| File | Role |
|---|---|
| `custom/config.js` | Schemas, category styles, key bindings — main customisation surface |
| `custom/ollama.js` | F12 → Ollama API query → inserts result nodes |
| `js/base.js` | `GraphEditor` class — canvas, events, undo/redo, clipboard, save/load |
| `js/layout.js` | Layout algorithms (ELK, WebCola, Dagre, Graphviz) |
| `js/visualPatterns.js` | Node shapes and colours; overrides `drawNodeShape` and `TYPES` |
| `js/propertiesEditor.js` | Schema-driven side panel and inline popup |
| `js/nodeHistory.js` | Alt+← / Alt+→ navigation history |
| `js/search.js` | Ctrl+F search panel |
| `js/extra.js` | Example graph generator; subgraph insertion modal |

Optional modules are independent — any can be removed without breaking the core.

## Save / load

Graphs are saved as JSON (nodes + edges with all properties). All processing is local; no server required.

## Theming

Light / dark mode via CSS variables. Initial theme follows the OS preference; toggle with ☀️ / 🌙 in the menu bar.
