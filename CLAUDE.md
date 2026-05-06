# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Running the App

No build step. Open `index.html` directly in a browser (works via `file://` protocol) or serve with any static server:

```bash
npx serve .
# or
python -m http.server 8000
```

There are no tests, linter, or package.json.

## Architecture

Vanilla HTML/CSS/JS app using ES modules (`<script type="module">`). No frameworks or bundler.

### Data Flow

`app.js` (entry point) wires together modules in this pipeline:

1. **Tree model** (`mindmap.js`) - In-memory nested tree: `{ id, text, done, children[] }`. All mutations (add/delete/edit/toggle/move) happen here. `toggleDone` cascades to all descendants.
2. **Layout** (`layout.js`) - Radial layout algorithm. Takes tree, returns `Map<nodeId, {x, y, depth, branchIndex}>`. Children get angle-proportional sectors weighted by subtree size.
3. **Renderer** (`renderer.js`) - Builds SVG DOM from layout positions. Two layers: edges (quadratic Bezier paths) then nodes (circles + labels + checkboxes). Full re-render on every change (no diffing). Node text containing `http://` or `https://` URLs auto-embeds image thumbnails (image URLs) or a link indicator (other URLs), stripping them from the display label.
4. **UI** (`ui.js`) - Central controller. Owns selection state, pan/zoom transform, toolbar buttons, modals, and keyboard shortcuts. Calls `renderMindMap()` on every state change.
5. **History** (`history.js`) - Undo/redo via JSON snapshots (max 20 states). **Call `pushSnapshot(root)` before every mutation** — undo/redo will not work correctly otherwise.

### Firebase Integration (Optional)

Firebase is entirely optional — the app detects unconfigured placeholder values in `firebase-config.js` and runs in offline mode.

- `firebase-config.js` - Dynamic imports from CDN (not bundled). Exports mutable `auth`/`db` via `export let` (live bindings required).
- `auth.js` - Google sign-in via Firebase Auth; `onAuthStateChanged` listener.
- `store.js` - Firestore CRUD. One document per user at `mindmaps/{userId}`. Auto-save via 1500ms debounce after any tree mutation. `flushSave()` is called before sign-out to avoid losing pending changes.

### Key Conventions

- **SVG rendering**: All rendering uses `document.createElementNS(SVG_NS, ...)`. The SVG has a single `#mindmap-content` group that receives pan/zoom transforms.
- **Pan/zoom**: Mouse drag + wheel zoom + touch pinch, all applied as SVG `transform` on the content group. Scale clamped to [0.3, 3].
- **Node drag**: Dragging a node with no drop target persists a position override in `renderer.js` (`_positionOverrides` map). Dragging onto another node reparents it via `moveNode()`. `clearPositionOverrides()` must be called after reparenting or loading a new tree.
- **Mobile detection**: `width < 768` — affects layout radius (160px desktop, 100px mobile) and label truncation.
- **Node shapes**: Root node = circle (r=50). Depth-1 nodes = 120×70 rounded rects. Depth-2+ nodes = 100×60 rounded rects. Height grows dynamically when text wraps or images are present.
- **Node colors**: `colors.js` has a 10-color palette indexed by `branchIndex % 10`. Depth affects lightness. Done nodes get reduced opacity.
- **Keyboard shortcuts**: Tab = add child, Enter = edit, Delete/Backspace = delete, Escape = deselect, Ctrl/Cmd+Z = undo, Ctrl/Cmd+Y or Shift+Z = redo. In the edit modal, Ctrl/Cmd+Enter saves. All suppressed when an input or modal is active.
- **PDF export**: `exportPdf()` in `ui.js` resets the view, clones the SVG with a computed `viewBox`, and opens a print dialog in a popup window (landscape, 0.5in margins).
- **Voice**: Web Speech API wrapper in `voice.js`. Two modes: toolbar mic (quick-add child) and modal mic (dictate into edit field).

## Deployment

Pushing to `master` automatically deploys to GitHub Pages via `.github/workflows/pages.yml` (uploads the repo root as a Pages artifact).
