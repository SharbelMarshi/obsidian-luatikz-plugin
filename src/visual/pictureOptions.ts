import { splitOptionTokens } from './tikzOptions';

/**
 * The `\begin{tikzpicture}[...]` option list, as a small set of named
 * presets the visual editor can offer as dropdowns.
 *
 * These are the options people retype on every picture — the arrow-tip
 * default, a global line width, one font size for every node, a scale — and
 * until now the visual editor could only set them per statement, so each new
 * object had to be styled again. Everything the editor does not recognize
 * (custom styles, `every path/.style`, library keys) is preserved verbatim
 * and in order, exactly like the per-object option handling.
 */

export type PictureArrowTip = '' | 'latex' | 'Latex' | 'Stealth' | 'Triangle' | 'to';
export type PictureLineWidth = '' | 'ultra thin' | 'thin' | 'semithick' | 'thick' | 'very thick' | 'ultra thick';
export type PictureFontSize =
	| '' | '\\tiny' | '\\scriptsize' | '\\footnotesize' | '\\small'
	| '\\normalsize' | '\\large' | '\\Large' | '\\LARGE' | '\\huge';

export interface PictureOptionState {
	/** `>=latex` — the default arrow tip for `->` paths. */
	arrowTip: PictureArrowTip;
	/** A bare width token (`thick`) applying to every path. */
	lineWidth: PictureLineWidth;
	/** The font command inside `every node/.style={font=…}`. */
	nodeFont: PictureFontSize;
	/** `scale=…`; null when the picture does not set one. */
	scale: number | null;
	/** `node distance=…`, kept as written (`2cm`, `1.5 cm`). */
	nodeDistance: string;
	/** Every token this editor does not model, in source order. */
	rest: string[];
}

export interface PictureOptionEdit {
	arrowTip?: PictureArrowTip;
	lineWidth?: PictureLineWidth;
	nodeFont?: PictureFontSize;
	scale?: number | null;
	nodeDistance?: string;
}

export const PICTURE_ARROW_TIPS: ReadonlyArray<[PictureArrowTip, string]> = [
	['', 'Default (TikZ)'],
	['latex', 'LaTeX  >=latex'],
	['Latex', 'Latex (arrows.meta)'],
	['Stealth', 'Stealth'],
	['Triangle', 'Triangle'],
	['to', 'Thin  >=to'],
];

export const PICTURE_LINE_WIDTHS: ReadonlyArray<[PictureLineWidth, string]> = [
	['', 'Default'],
	['ultra thin', 'Ultra thin'],
	['thin', 'Thin'],
	['semithick', 'Semithick'],
	['thick', 'Thick'],
	['very thick', 'Very thick'],
	['ultra thick', 'Ultra thick'],
];

export const PICTURE_FONT_SIZES: ReadonlyArray<[PictureFontSize, string]> = [
	['', 'Default'],
	['\\tiny', 'tiny'],
	['\\scriptsize', 'scriptsize'],
	['\\footnotesize', 'footnotesize'],
	['\\small', 'small'],
	['\\normalsize', 'normalsize'],
	['\\large', 'large'],
	['\\Large', 'Large'],
	['\\LARGE', 'LARGE'],
	['\\huge', 'huge'],
];

const LINE_WIDTH_SET = new Set<string>(
	PICTURE_LINE_WIDTHS.map(([value]) => value).filter(Boolean),
);

const ARROW_TIP_SET = new Set<string>(
	PICTURE_ARROW_TIPS.map(([value]) => value).filter(Boolean),
);

const FONT_SIZE_SET = new Set<string>(
	PICTURE_FONT_SIZES.map(([value]) => value).filter(Boolean),
);

/** `>=latex` / `>={Stealth}` / `>={Latex[round]}` → the tip name. */
function parseArrowTipToken(token: string): PictureArrowTip | null {
	const match = token.match(/^>\s*=\s*(.+)$/s);
	if (!match) {
		return null;
	}
	const inner = match[1].trim().replace(/^\{(.*)\}$/s, '$1').trim();
	return ARROW_TIP_SET.has(inner) ? inner as PictureArrowTip : null;
}

/** `every node/.style={font=\Large}` → the font command. */
function parseNodeFontToken(token: string): PictureFontSize | null {
	const match = token.match(/^every\s+node\s*\/\s*\.style\s*=\s*\{\s*font\s*=\s*(\\[A-Za-z]+)\s*\}$/s);
	if (!match) {
		return null;
	}
	return FONT_SIZE_SET.has(match[1]) ? match[1] as PictureFontSize : null;
}

export function parsePictureOptions(optionsText: string): PictureOptionState {
	const state: PictureOptionState = {
		arrowTip: '',
		lineWidth: '',
		nodeFont: '',
		scale: null,
		nodeDistance: '',
		rest: [],
	};

	for (const token of splitOptionTokens(optionsText)) {
		const text = token.text.replace(/\s*\n\s*/g, ' ').trim();
		if (!text) {
			continue;
		}

		const arrowTip = parseArrowTipToken(text);
		if (arrowTip) {
			state.arrowTip = arrowTip;
			continue;
		}
		if (LINE_WIDTH_SET.has(text)) {
			state.lineWidth = text as PictureLineWidth;
			continue;
		}
		const nodeFont = parseNodeFontToken(text);
		if (nodeFont) {
			state.nodeFont = nodeFont;
			continue;
		}
		const scale = text.match(/^scale\s*=\s*(-?\d+(?:\.\d+)?)$/);
		if (scale) {
			state.scale = Number.parseFloat(scale[1]);
			continue;
		}
		const distance = text.match(/^node\s+distance\s*=\s*(.+)$/);
		if (distance) {
			state.nodeDistance = distance[1].trim();
			continue;
		}
		state.rest.push(text);
	}

	return state;
}

/** Render one state back to the tokens this editor owns, in a stable order. */
function knownTokens(state: PictureOptionState): string[] {
	const tokens: string[] = [];
	if (state.arrowTip) {
		// Bare for `latex`/`to` (plain TikZ tips), braced for arrows.meta
		// names, which is how the library documents them.
		tokens.push(state.arrowTip === 'latex' || state.arrowTip === 'to'
			? `>=${state.arrowTip}`
			: `>={${state.arrowTip}}`);
	}
	if (state.lineWidth) {
		tokens.push(state.lineWidth);
	}
	if (state.nodeFont) {
		tokens.push(`every node/.style={font=${state.nodeFont}}`);
	}
	if (state.scale !== null && Number.isFinite(state.scale) && state.scale !== 1) {
		tokens.push(`scale=${Number.parseFloat(state.scale.toFixed(4))}`);
	}
	if (state.nodeDistance) {
		tokens.push(`node distance=${state.nodeDistance}`);
	}
	return tokens;
}

/**
 * Apply an edit to an option list, keeping unknown tokens untouched.
 *
 * The known tokens are emitted first, in a fixed order, so a picture the
 * editor has touched reads the same way every time; the user's own tokens
 * follow in their original order.
 */
export function applyPictureOptionEdit(optionsText: string, edit: PictureOptionEdit): string {
	const state = parsePictureOptions(optionsText);
	const next: PictureOptionState = {
		...state,
		...(edit.arrowTip !== undefined ? { arrowTip: edit.arrowTip } : {}),
		...(edit.lineWidth !== undefined ? { lineWidth: edit.lineWidth } : {}),
		...(edit.nodeFont !== undefined ? { nodeFont: edit.nodeFont } : {}),
		...(edit.scale !== undefined ? { scale: edit.scale } : {}),
		...(edit.nodeDistance !== undefined ? { nodeDistance: edit.nodeDistance.trim() } : {}),
	};
	return [...knownTokens(next), ...next.rest].join(', ');
}

/**
 * The replacement text for the `[...]` group of a `\begin{tikzpicture}`:
 * the bracketed list, or an empty string when no option is left (the editor
 * then removes the brackets entirely rather than writing `[]`).
 */
export function formatPictureOptionGroup(options: string): string {
	const trimmed = options.trim();
	return trimmed ? `[${trimmed}]` : '';
}
