/**
 * Repair the SVG that TikZJax produces.
 *
 * Its DVI→SVG converter writes each glyph as a raw TeX *font position* and
 * names the TeX font in `font-family`. Readers have no such font installed,
 * so every glyph is shown through a fallback font that means something else
 * at that code point. `src/utils/texFontGlyphs.ts` holds the decoder and the
 * real font encodings; this file applies them to the markup.
 */
import { classifyTexFont, decodeTexGlyphs, type TexFontInfo } from './texFontGlyphs';
import { applyRtlRunsToSvg, type RtlRun } from '../latex/tikzJaxRtl';

const STANDALONE_BACKGROUND_FILLS = [
	/fill="rgb\(100%,100%,100%\)"/i,
	/fill="rgb\(100\.0%,100\.0%,100\.0%\)"/i,
	/fill="#ffffff"/i,
	/fill="#fff"/i,
	/fill="white"/i,
];

/** Remove the full-canvas white background rect from standalone TikZJax SVG output. */
export function stripStandaloneBackgroundRect(svgInput: string): string {
	const svgMatch = svgInput.match(/^(\s*<svg\b[^>]*>)(\s*)([\s\S]*)$/i);
	if (!svgMatch) {
		return svgInput;
	}

	const [, openTag, leadingSpace, remainder] = svgMatch;
	const rectMatch = remainder.match(
		/^<rect\b([^>]*)\/?>(\s*)([\s\S]*)$/i,
	);
	if (!rectMatch) {
		return svgInput;
	}

	const [, rectAttrs, afterRectSpace, afterRect] = rectMatch;
	if (!STANDALONE_BACKGROUND_FILLS.some(pattern => pattern.test(rectAttrs))) {
		return svgInput;
	}

	return `${openTag}${leadingSpace}${afterRectSpace}${afterRect}`;
}

/**
 * Resolve each `<text>` element's effective font, including a `font-family`
 * that SVGO hoisted onto an enclosing `<g>`.
 *
 * This is why some formulas looked fine and others did not: once several
 * sibling runs share a TeX font, the optimizer moves the attribute up to the
 * group and the element itself carries none, so an attribute-only check saw
 * no font and left the glyphs corrupted.
 */
const TAG_RE = /<(\/?)([a-zA-Z][\w:-]*)((?:"[^"]*"|'[^']*'|[^>])*?)(\/?)>/g;

const XML_ENTITIES: Record<string, string> = {
	'&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&apos;': "'",
};

/** Text content arrives entity-escaped; decode before mapping code points. */
function decodeXmlText(text: string): string {
	return text.replace(/&(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);/g, entity => {
		const named = XML_ENTITIES[entity];
		if (named !== undefined) {
			return named;
		}
		const numeric = entity.startsWith('&#x') || entity.startsWith('&#X')
			? Number.parseInt(entity.slice(3, -1), 16)
			: Number.parseInt(entity.slice(2, -1), 10);
		return Number.isFinite(numeric) ? String.fromCodePoint(numeric) : entity;
	});
}

function encodeXmlText(text: string): string {
	return text.replace(/[&<>]/g, char =>
		(char === '&' ? '&amp;' : char === '<' ? '&lt;' : '&gt;'));
}

function readAttribute(attrs: string, name: string): string | null {
	const match = attrs.match(new RegExp(`\\b${name}="([^"]*)"`));
	return match ? match[1] : null;
}

function setAttribute(attrs: string, name: string, value: string): string {
	const pattern = new RegExp(`\\b${name}="[^"]*"`);
	return pattern.test(attrs)
		? attrs.replace(pattern, `${name}="${value}"`)
		: `${attrs} ${name}="${value}"`;
}

/** Rewrite one `<text>` run: decode its glyphs and point it at a real font. */
function repairTextElement(attrs: string, content: string, font: TexFontInfo): string {
	const decoded = decodeXmlText(content);
	const mapped = decodeTexGlyphs(decoded, font);

	let nextAttrs = setAttribute(attrs, 'font-family', font.cssFamily);
	if (font.italic) {
		nextAttrs = setAttribute(nextAttrs, 'font-style', 'italic');
	}
	if (font.bold) {
		nextAttrs = setAttribute(nextAttrs, 'font-weight', 'bold');
	}
	return `<text${nextAttrs}>${encodeXmlText(mapped)}</text>`;
}

/**
 * Map every TeX glyph in the document back to Unicode.
 *
 * A single pass over the markup keeps a stack of the open elements' inherited
 * `font-family`, so a `<text>` inside `<g font-family="cmsy10">` is repaired
 * exactly like one that carries the attribute itself.
 */
export function fixTikzJaxSvgGlyphs(svgInput: unknown): string {
	if (typeof svgInput !== 'string') {
		return '';
	}

	const inherited: Array<string | null> = [];
	let out = '';
	let cursor = 0;
	TAG_RE.lastIndex = 0;

	let match: RegExpExecArray | null;
	while ((match = TAG_RE.exec(svgInput))) {
		const [tag, closing, name, attrs, selfClosing] = match;
		out += svgInput.slice(cursor, match.index);
		cursor = match.index + tag.length;

		if (closing) {
			inherited.pop();
			out += tag;
			continue;
		}

		const own = readAttribute(attrs, 'font-family');
		const current = own ?? inherited[inherited.length - 1] ?? null;

		if (name.toLowerCase() !== 'text') {
			if (!selfClosing) {
				inherited.push(current);
			}
			// A TeX font name left on a group would still be inherited by any
			// element this pass does not rewrite, so point it at a real font
			// while the stack keeps the original name for decoding.
			const groupFont = own ? classifyTexFont(own) : null;
			out += groupFont
				? `<${name}${setAttribute(attrs, 'font-family', groupFont.cssFamily)}${selfClosing ? '/' : ''}>`
				: tag;
			continue;
		}

		// <text> … </text>: take the whole run so its content can be rewritten.
		const closeAt = svgInput.indexOf('</text>', cursor);
		const font = current ? classifyTexFont(current) : null;
		// A run with nested markup (a <tspan>) is left alone: its content is
		// not a single text node, and re-escaping it would mangle the tags.
		const nested = closeAt !== -1 && svgInput.lastIndexOf('<', closeAt - 1) >= cursor;
		if (selfClosing || closeAt === -1 || !font || nested) {
			if (!selfClosing) {
				inherited.push(current);
			}
			out += tag;
			continue;
		}

		out += repairTextElement(attrs, svgInput.slice(cursor, closeAt), font);
		cursor = closeAt + '</text>'.length;
		TAG_RE.lastIndex = cursor;
	}

	return out + svgInput.slice(cursor);
}

/**
 * Tile geometry of the TikZ `patterns` library, ported from
 * pgflibrarypatterns.code.tex (declaration order = pattern number, and the
 * library always loads from the default TikZJax preamble before any user
 * code, so numbers 1–12 are stable). Units are TeX pt; the referencing
 * groups flip Y, so tiles use PGF's own Y-up coordinates verbatim. Stroke
 * tiles leave `fill="none"` and inherit the stroke color from the `<use>`
 * instance; fill tiles do the reverse.
 */
const PGF_PATTERN_TILES: Record<number, { width: number; height: number; body: string }> = {
	1: { width: 100, height: 3, body: '<path d="M0 .5h100" fill="none" stroke-width=".4"/>' },
	2: { width: 3, height: 100, body: '<path d="M.5 0v100" fill="none" stroke-width=".4"/>' },
	3: { width: 3, height: 3, body: '<path d="M-1 -1L4 4" fill="none" stroke-width=".4"/>' },
	4: { width: 3, height: 3, body: '<path d="M-1 4L4 -1" fill="none" stroke-width=".4"/>' },
	5: { width: 3, height: 3, body: '<path d="M0 0v3M0 0h3" fill="none" stroke-width=".4"/>' },
	6: { width: 3, height: 3, body: '<path d="M-1 -1L4 4M-1 4L4 -1" fill="none" stroke-width=".4"/>' },
	7: { width: 3, height: 3, body: '<circle r=".5" stroke="none"/>' },
	8: {
		width: 3, height: 3,
		body: '<circle r=".5" stroke="none"/><circle cx="1.5" cy="1.5" r=".5" stroke="none"/>',
	},
	9: {
		width: 8.536, height: 8.536,
		body: '<path d="M5.551 3.724L0.139 3.724L4.517 0.543L2.845 5.69L1.173 0.543Z"'
			+ ' fill-rule="nonzero" stroke="none"/>',
	},
	10: {
		width: 8.536, height: 8.536,
		body: '<path d="M5.309 4.268L0.381 4.268L2.845 0ZM5.309 1.423L2.845 5.69L0.381 1.423Z"'
			+ ' fill-rule="nonzero" stroke="none"/>',
	},
	11: {
		width: 11.381, height: 11.381,
		body: '<path d="M0 2.845h11.381M0 8.536h11.381M2.845 0v2.845M8.536 2.845v5.691M2.845 8.536v2.845"'
			+ ' fill="none" stroke-width=".8"/>',
	},
	12: {
		width: 11.381, height: 11.381,
		body: '<path d="M0 0h5.691v5.691H0zM5.691 5.691h5.69v5.69h-5.69z" stroke="none"/>',
	},
};

/**
 * Tiles for the editor's own per-fence patterns (declared with
 * `\pgfdeclarepatternformonly` — see EDITOR_PATTERN_DECLARATIONS in
 * src/visual/tikzOptions.ts, whose geometry these mirror). Unlike the
 * library patterns their pgf numbers are assigned dynamically, so they are
 * matched from the fence source instead of by fixed number.
 */
const EDITOR_PATTERN_TILES: Record<string, { width: number; height: number; body: string }> = {
	'diagonal stripes': {
		width: 6, height: 6,
		body: '<path d="M-2 -2L8 8" fill="none" stroke-width="2.5"/>',
	},
	'north east lines wide': {
		width: 4.5, height: 4.5,
		body: '<path d="M-1 -1L5.5 5.5" fill="none" stroke-width=".4"/>',
	},
	'north west lines wide': {
		width: 4.5, height: 4.5,
		body: '<path d="M-1 5.5L5.5 -1" fill="none" stroke-width=".4"/>',
	},
};

/**
 * Fence-declared pattern names, in declaration order, restricted to the ones
 * actually used: their pgf numbers are assigned in exactly this order, so the
 * sorted dangling non-library numbers pair with this list one to one.
 */
function usedFencePatternNames(sourceText: string): string[] {
	const names: string[] = [];
	for (const match of sourceText.matchAll(/\\pgfdeclarepatternformonly\{([^}]*)\}/g)) {
		if (sourceText.includes(`pattern=${match[1]}`)) {
			names.push(match[1]);
		}
	}
	return names;
}

/**
 * node-tikzjax's DVI converter drops dvisvgm `rawdef` specials, so pattern
 * fills reference `#pgfpatN`/`#pgfsymN` tiles that were never emitted and
 * render as nothing. Re-create the missing definitions for the standard
 * `patterns` library (fixed numbers 1–12) and for the editor's per-fence
 * patterns (dynamic numbers, matched against `sourceText`), so patterned
 * fills look the same as under LuaLaTeX.
 */
export function injectPgfPatternDefs(svgInput: string, sourceText?: string): string {
	if (!svgInput.includes('#pgfpat')) {
		return svgInput;
	}
	const referenced = new Set<number>();
	for (const match of svgInput.matchAll(/#pgfpat(\d+)/g)) {
		referenced.add(Number.parseInt(match[1], 10));
	}
	const missing = [...referenced].filter(n =>
		PGF_PATTERN_TILES[n] && !svgInput.includes(`id="pgfpat${n}"`));
	const unknown = [...referenced]
		.filter(n => !PGF_PATTERN_TILES[n] && !svgInput.includes(`id="pgfpat${n}"`))
		.sort((a, b) => a - b);

	const tiles = missing.sort((a, b) => a - b)
		.map(n => ({ n, tile: PGF_PATTERN_TILES[n] }));
	const fenceNames = sourceText ? usedFencePatternNames(sourceText) : [];
	if (unknown.length && unknown.length === fenceNames.length) {
		for (let index = 0; index < unknown.length; index++) {
			const tile = EDITOR_PATTERN_TILES[fenceNames[index]];
			if (tile) {
				tiles.push({ n: unknown[index], tile });
			}
		}
	}
	if (!tiles.length) {
		return svgInput;
	}
	const defs = tiles.map(({ n, tile }) =>
		`<pattern id="pgfpat${n}" patternUnits="userSpaceOnUse"`
		+ ` width="${tile.width}" height="${tile.height}"/>`
		+ `<symbol id="pgfsym${n}" overflow="visible">${tile.body}</symbol>`).join('');
	return svgInput.replace(/(<svg\b[^>]*>)/i, `$1<defs>${defs}</defs>`);
}

export function finalizeTikzJaxSvg(
	svgInput: unknown,
	sourceText?: string,
	rtlRuns: readonly RtlRun[] = [],
): string {
	// Glyph repair first: the RTL text is written in afterwards so the TeX
	// position decoder never sees it (every Hebrew letter would otherwise
	// look like a font position to decode).
	const glyphFixed = fixTikzJaxSvgGlyphs(svgInput);
	const patterned = injectPgfPatternDefs(stripStandaloneBackgroundRect(glyphFixed), sourceText);
	return applyRtlRunsToSvg(patterned, rtlRuns);
}
