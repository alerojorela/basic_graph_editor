# Graph Editor (HTML + Canvas)

This project is a **web-based directed graph editor** implemented using **HTML, CSS, and vanilla JavaScript**, with no external dependencies.

It allows users to visually create, edit, and explore directed graphs using intuitive mouse and keyboard interactions, similar to tools like draw.io or yEd, but lightweight and fully client-side.

---

## Features

### Nodes
- Create nodes with **right-click** on empty space
- Move nodes by **dragging with left-click**
- Rename nodes using **double-click** or **F2**
- Assign one of **5 visual types** (colors/styles) using **F3**
- Lock/unlock nodes to prevent deletion using **F5**

### ➡️ Directed Edges
- Always directed (arrowheads)
- Create edges by **right-clicking a node and dragging**
  - If released on empty space, a new node is created automatically
- Prevents duplicate edges between the same source and target
- Reassign edge source or target by **dragging the closest end**
  - Live preview while dragging
  - Rollback if not released on a valid node
- Rename edges with **F2**
- Change edge type with **F3**
- Lock/unlock edges with **F5**

> Locked edges cannot be deleted directly, but will still be removed if one of their connected nodes is deleted.

---

## Navigation (Pan & Zoom)

- **Mouse wheel** → Zoom in / out (centered on cursor)
- **Middle mouse button + drag** → Pan / move the view
- Smooth and consistent interaction with all editing features

---

## Appearance & Themes

- Fully styled using **CSS variables**
- Supports **Light and Dark mode**
- Theme toggle button (☀️ / 🌙)
- Node and edge colors are defined entirely in CSS
- Selection does **not override colors**, instead:
  - Increased border thickness
  - Glow / intensity effect

---

## Keyboard Shortcuts

| Key              | Action |
|------------------|--------|
| **F2**           | Rename selected node or edge |
| **F3**           | Cycle through types (node or edge) |
| **F5**           | Toggle lock on selected node or edge |
| **Delete / Supr**| Delete selected element (if not locked) |
| **Right-click**  | Create node / start edge |
| **Left-click**   | Select node or edge |
| **Middle + drag**| Pan view |
| **Mouse wheel**  | Zoom |

A ❓ help icon in the toolbar shows all shortcuts as a tooltip.

---

## Save & Load

- Graphs can be **saved to JSON**
- Graphs can be **loaded from JSON**
- Stored data includes:
  - Node positions, labels, types, and lock state
  - Edge connections, labels, types, and lock state

All operations are done locally in the browser.

---

## Example Graph

- An **Example** button generates a sample graph programmatically
- The example is a **vertical sequence of nodes**
- Nodes are spaced by `dy = 100`
- Labels use the **Greek alphabet**
- Useful for demos and testing

---

## New Graph

- A **New** button clears the current graph
- Asks for confirmation before deleting all data

---

## Configuration

### Double-click behavior

The behavior of double-click on a node is configurable in `app.js`:

```js
const DOUBLECLICK_MODE = 1;
// 1 = Rename node (default)
// 2 = Call customDoubleClick(node)
