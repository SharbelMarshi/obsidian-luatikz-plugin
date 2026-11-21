import { EditorView } from '@codemirror/view';

/**
 * Keep CodeMirror's height map honest about a rendered TikZ block.
 *
 * In Live Preview a code block is a CodeMirror block widget, and CodeMirror
 * caches the height it measured when the widget was inserted. A diagram
 * arrives long after that: the block first shows "Rendering…" and only then
 * swaps in the finished output, which is usually far taller.
 *
 * With the LuaLaTeX engine the output is an `<img>`, whose `load` event
 * Obsidian already uses to re-measure. The TikZJax engine appends an inline
 * `<svg>` instead — no load event, and widget-internal mutations are ignored
 * by the editor's DOM observer — so the cached height stayed at the
 * placeholder's. Everything below the block then drew at its real position
 * while the gutter kept painting line numbers against the stale heights, and
 * the two drifted apart by exactly the diagram's growth (reported as "line
 * numbers shifted upward" and clicks landing on the wrong line).
 *
 * A ResizeObserver on the rendered block closes the loop for every engine
 * and every later change (theme re-render, font loads, image decode).
 */
export function observeLivePreviewHeight(el: HTMLElement): () => void {
	const win = el.ownerDocument.defaultView;
	if (!win || typeof win.ResizeObserver !== 'function') {
		return () => undefined;
	}

	let lastHeight = -1;
	const observer = new win.ResizeObserver(entries => {
		const height = entries[0]?.contentRect.height ?? el.getBoundingClientRect().height;
		// Sub-pixel jitter from zoom/scroll must not schedule measure loops.
		if (Math.abs(height - lastHeight) < 0.5) {
			return;
		}
		lastHeight = height;
		requestLivePreviewMeasure(el);
	});
	observer.observe(el);
	return () => observer.disconnect();
}

/** Ask the CodeMirror editor containing `el`, if any, to re-measure. */
export function requestLivePreviewMeasure(el: HTMLElement): void {
	const editorEl = el.closest('.cm-editor');
	if (!(editorEl instanceof HTMLElement)) {
		return;
	}
	try {
		// findFromDOM wants the editor root (it looks up `.cm-content` inside).
		EditorView.findFromDOM(editorEl)?.requestMeasure();
	} catch {
		// A detached or half-torn-down editor is not worth reporting.
	}
}
