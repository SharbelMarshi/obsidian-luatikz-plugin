import { containsArabic, containsRtl } from '../utils/rtlDetection';

/**
 * Hebrew and Arabic text on the TikZJax engine.
 *
 * TikZJax ships a small TeX with the Computer Modern fonts and nothing else,
 * so there is no font that can set a Hebrew or Arabic glyph: the previous
 * fallback simply deleted the text of every `\he{…}` and `\ar{…}`, which is
 * why those labels vanished from the diagram instead of rendering.
 *
 * TeX does not have to draw them. Its DVI→SVG converter honours
 * `\special{dvisvgm:raw …}`, substituting the current position into `{?x}`
 * and `{?y}`, so TeX can reserve a box of the right width and emit an empty
 * `<text>` element at its centre; the plugin then fills that element with the
 * real string and a font the reader actually has. The text never passes
 * through TeX at all, which also sidesteps its 8-bit input encoding.
 *
 * The limitation is honest and bounded: the raw element carries no picture
 * transform, so RTL labels inside a rotated or scaled `tikzpicture` keep
 * their upright position and size. Local LuaLaTeX remains the engine for
 * real shaping.
 */

/** Attribute that ties an emitted placeholder back to its captured text. */
export const RTL_MARKER_ATTRIBUTE = 'data-luatikz-rtl';

/**
 * The macro TeX uses to reserve space and emit the placeholder.
 *
 * `\hbox to <w>` is deliberate: a trailing `\hskip` is stripped when TikZ
 * closes the node's box, so the space would not be reserved at all, and the
 * label would collapse to zero width. `\hfil` on both sides puts the
 * placeholder at the centre of the box, which is where a TikZ node centres
 * its content anyway.
 */
export const TIKZJAX_RTL_RAW_MACRO = [
	'\\makeatletter',
	'\\newcommand{\\luatikzrtl}[2]{\\hbox to #2em{\\hfil\\special{dvisvgm:raw '
		+ `<text x="{?x}" y="{?y}" font-size="\\strip@pt\\dimexpr1em\\relax" `
		// `fill="black"`, not `#000`: inside \newcommand a literal `#0` is an
		// illegal parameter number and the whole definition fails to compile.
		+ `text-anchor="middle" fill="black" stroke="none" ${RTL_MARKER_ATTRIBUTE}="#1">.</text>`
		+ '}\\hfil}}',
	'\\makeatother',
].join('\n');

export interface RtlRun {
	/** The original text, exactly as the user wrote it. */
	text: string;
	/** True when the run is Arabic rather than Hebrew. */
	arabic: boolean;
}

export interface RtlExtraction {
	/** Body with each RTL run replaced by a `\luatikzrtl` placeholder. */
	body: string;
	/** Captured runs, indexed by the number written into the placeholder. */
	runs: RtlRun[];
}

/**
 * Advance width per character, in em, used to size the reserved box.
 *
 * Deliberately a little generous: a box that is too wide only pads the label,
 * while one that is too narrow lets neighbouring nodes overlap it.
 */
function estimateWidthEm(text: string): number {
	let width = 0;
	for (const char of text) {
		if (/\s/.test(char)) {
			width += 0.28;
		} else if (/[.,:;!|'"()\[\]־–-]/.test(char)) {
			width += 0.32;
		} else if (/[֐-ࣿ]/.test(char)) {
			width += 0.6;
		} else {
			width += 0.52;
		}
	}
	// Never zero: a zero-width \hbox would collapse the node.
	return Math.max(0.5, Math.round(width * 100) / 100);
}

const RTL_MACRO_RE = /\\(he|ar|texthebrew|textarabic)\{([^{}]*)\}/g;

/**
 * Replace every RTL macro whose content actually contains RTL text with a
 * `\luatikzrtl{index}{width}` placeholder, collecting the originals.
 *
 * A macro holding only ASCII (`\he{ok}`) is left alone: TeX can set that
 * perfectly well, and routing it through the placeholder would lose its
 * kerning for no gain.
 */
export function extractRtlRuns(body: string): RtlExtraction {
	const runs: RtlRun[] = [];
	const rewritten = body.replace(RTL_MACRO_RE, (match, _macro: string, content: string) => {
		if (!containsRtl(content)) {
			return match;
		}
		const index = runs.length;
		runs.push({ text: content, arabic: containsArabic(content) });
		return `\\luatikzrtl{${index}}{${estimateWidthEm(content)}}`;
	});
	return { body: rewritten, runs };
}

const HEBREW_FONT_STACK =
	'Noto Serif Hebrew, Noto Sans Hebrew, David CLM, Frank Ruehl CLM, Arial Hebrew, serif';
const ARABIC_FONT_STACK =
	'Noto Sans Arabic, Geeza Pro, Amiri, Arial, sans-serif';

function escapeXmlText(text: string): string {
	return text
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

const MARKER_TEXT_RE = new RegExp(
	`<text\\b([^>]*\\b${RTL_MARKER_ATTRIBUTE}="(\\d+)"[^>]*)>([^<]*)</text>`,
	'g',
);

function withAttribute(attrs: string, name: string, value: string): string {
	const pattern = new RegExp(`\\b${name}="[^"]*"`);
	return pattern.test(attrs)
		? attrs.replace(pattern, `${name}="${value}"`)
		: `${attrs} ${name}="${value}"`;
}

/**
 * Fill every placeholder with its captured text, a font stack that can set
 * it, and `direction="rtl"` so the browser lays the run out right to left.
 *
 * A placeholder with no matching run (a stale cache entry, a run the parser
 * never captured) is emptied rather than left showing its marker character.
 */
export function applyRtlRunsToSvg(svgInput: string, runs: readonly RtlRun[]): string {
	if (!svgInput.includes(RTL_MARKER_ATTRIBUTE)) {
		return svgInput;
	}
	return svgInput.replace(MARKER_TEXT_RE, (_full, attrs: string, index: string) => {
		const run = runs[Number.parseInt(index, 10)];
		if (!run) {
			return `<text${attrs}></text>`;
		}
		let nextAttrs = withAttribute(attrs, 'direction', 'rtl');
		nextAttrs = withAttribute(
			nextAttrs,
			'font-family',
			run.arabic ? ARABIC_FONT_STACK : HEBREW_FONT_STACK,
		);
		return `<text${nextAttrs}>${escapeXmlText(run.text)}</text>`;
	});
}
