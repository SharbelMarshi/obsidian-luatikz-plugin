/**
 * Rendered-size control for a diagram block.
 *
 * TikZ sizes a picture in absolute LaTeX units, which says nothing about how
 * wide the result should be *in the note*. The `% width=` directive (and the
 * matching default in settings) scales the finished image to the reading
 * column instead, so `% width=100%` fills the note width on every screen —
 * the single most requested thing the alignment directive could not do.
 *
 * The value is CSS, so it is validated against a closed grammar before it
 * ever reaches a style property: a percentage, or a number with one of a
 * fixed set of length units. Anything else is rejected and the block renders
 * at its natural size.
 */

/**
 * The `%` is required, unlike the older `align`/`grid` directives: `width=8cm`
 * on a line of its own is ordinary TikZ (a pgfplots axis option list spread
 * over several lines), and stripping it would silently resize the user's
 * plot. A comment can never be anything but a directive.
 */
const WIDTH_LINE_RE = /^\s*%\s*width\s*[=:]\s*([^\s,;]+)\s*$/i;

const WIDTH_VALUE_RE = /^(?:\d+(?:\.\d+)?)(?:%|px|pt|em|rem|ex|ch|cm|mm|in|vw|vmin)$/i;

/**
 * Horizontal nudge away from the chosen alignment, as a signed length. The
 * `%` is required for the same reason as `width`: `x=-3` on a line of its
 * own is a TikZ unit-vector option, not a directive.
 */
const OFFSET_X_LINE_RE = /^\s*%\s*(?:offset-x|x-offset)\s*[=:]\s*(-?[^\s,;]+)\s*$/i;

const OFFSET_VALUE_RE = /^-?(?:\d+(?:\.\d+)?)(?:%|px|pt|em|rem|ex|ch|cm|mm|in|vw)$/i;

/**
 * Normalize a width value, or null when it is not one this plugin writes
 * into CSS. `auto` and the empty string both mean "natural size".
 */
export function normalizeDiagramWidth(raw: string): string | null {
	const value = raw.trim().toLowerCase();
	if (!value || value === 'auto' || value === 'natural' || value === 'none') {
		return null;
	}
	// A bare number is read as a percentage: `% width=80` is what people type.
	if (/^\d+(?:\.\d+)?$/.test(value)) {
		return `${value}%`;
	}
	return WIDTH_VALUE_RE.test(value) ? value : null;
}

/** True when this line is an Obsidian-only `% width=` / `% offset-x=` directive. */
export function isObsidianWidthDirectiveLine(line: string): boolean {
	const trimmed = line.trim();
	return WIDTH_LINE_RE.test(trimmed) || OFFSET_X_LINE_RE.test(trimmed);
}

/**
 * Normalize a horizontal nudge, or null when it is not one this plugin
 * writes into CSS. A bare number means em, so `-3` reads as "three
 * characters to the left" and keeps scaling with the note's font size.
 */
export function normalizeDiagramOffsetX(raw: string): string | null {
	const value = raw.trim().toLowerCase();
	if (!value || value === '0' || value === 'none') {
		return null;
	}
	if (/^-?\d+(?:\.\d+)?$/.test(value)) {
		return Number.parseFloat(value) === 0 ? null : `${value}em`;
	}
	return OFFSET_VALUE_RE.test(value) ? value : null;
}

/** Read the `% offset-x=` directive from a block body, or null when absent. */
export function parseDiagramOffsetX(source: string): string | null {
	for (const line of source.split('\n')) {
		const match = line.match(OFFSET_X_LINE_RE);
		if (match) {
			return normalizeDiagramOffsetX(match[1]);
		}
	}
	return null;
}

/** The directive line the visual editor writes for `offset-x`. */
export function formatOffsetXDirective(offset: string): string {
	return `% offset-x=${offset}`;
}

/** Span of the existing `% offset-x=` line in a fence body, or null. */
export function offsetXDirectiveSpan(source: string): { from: number; to: number } | null {
	let offset = 0;
	for (const line of source.split('\n')) {
		if (OFFSET_X_LINE_RE.test(line.trim())) {
			return { from: offset, to: offset + line.length };
		}
		offset += line.length + 1;
	}
	return null;
}

/** Read the `% width=` directive from a block body, or null when absent. */
export function parseDiagramWidth(source: string): string | null {
	for (const line of source.split('\n')) {
		const match = line.match(WIDTH_LINE_RE);
		if (match) {
			return normalizeDiagramWidth(match[1]);
		}
	}
	return null;
}

/** The directive line the visual editor writes for `width`. */
export function formatWidthDirective(width: string): string {
	return `% width=${width}`;
}

/**
 * Character span of the existing `% width=` directive line in a fence body
 * (excluding its newline), or null when the body has none — the counterpart
 * of `alignDirectiveSpan`, so the editor can rewrite rather than stack.
 */
export function widthDirectiveSpan(source: string): { from: number; to: number } | null {
	let offset = 0;
	for (const line of source.split('\n')) {
		if (WIDTH_LINE_RE.test(line.trim())) {
			return { from: offset, to: offset + line.length };
		}
		offset += line.length + 1;
	}
	return null;
}

/**
 * Apply the resolved width to a rendered diagram container. The value lands
 * in a custom property rather than a hard `width`, so the stylesheet keeps
 * ownership of which child element it actually sizes.
 */
export function applyDiagramWidth(containerEl: HTMLElement, width: string | null): void {
	containerEl.toggleClass('luatikz-diagram-sized', width !== null);
	containerEl.setCssProps({ '--luatikz-diagram-width': width ?? 'auto' });
}

/**
 * Shift the rendered diagram horizontally from wherever its alignment put
 * it. Applied as a transform rather than a margin so it never changes the
 * layout the alignment produced — it only moves what is drawn.
 */
export function applyDiagramOffsetX(containerEl: HTMLElement, offset: string | null): void {
	containerEl.toggleClass('luatikz-diagram-nudged', offset !== null);
	containerEl.setCssProps({ '--luatikz-diagram-offset-x': offset ?? '0px' });
}
