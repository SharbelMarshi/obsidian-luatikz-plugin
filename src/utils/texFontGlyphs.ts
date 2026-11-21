/**
 * TeX font position → Unicode, for the SVG TikZJax produces.
 *
 * TikZJax's DVI→SVG converter (`@prinsss/dvi2html`) writes each glyph as the
 * raw *font position* from the DVI stream, not as a character: it emits the
 * byte directly for positions 33–126 and shifts the rest into the Latin-1
 * range to keep them out of the control-character block. The font name goes
 * into `font-family`, which the reader does not have installed, so every
 * glyph is then shown through a fallback font that means something entirely
 * different at that code point.
 *
 * That is why `\Rightarrow` came out as `)` (cmsy position 41, emitted as the
 * ASCII byte 41), why `G^{-1}` came out as `G` with a raised `¡` (cmsy7
 * position 0, the math minus, shifted to 161), and why `\frac{Y}{G}` lost its
 * symbols: the script-size fonts were not being repaired at all.
 *
 * The decoder below is the exact inverse of that encoder, and the tables are
 * the real TeX font encodings, so the repair is a lookup rather than a guess.
 */

/* -------------------------------------------------------------------------- */
/* the converter's own encoding, inverted                                      */
/* -------------------------------------------------------------------------- */

/**
 * Undo `@prinsss/dvi2html`'s putChar encoding:
 *
 *   0–9    → 161 + c       10–19 → 173 + (c - 10)      20 → U+2219
 *   21–32  → 184 + (c-21)  127   → 196                 else → the byte itself
 *
 * node-tikzjax then rewrites `&#173;` (soft hyphen) to `&#172;`, so position
 * 10 arrives as 172 and positions 11–19 as 174–182.
 */
export function decodeDviCharCode(code: number): number {
	if (code >= 161 && code <= 170) {
		return code - 161;
	}
	if (code === 172) {
		return 10;
	}
	if (code >= 174 && code <= 195) {
		// 174–182 → 11–19, 184–195 → 21–32; 183 is never emitted.
		return code - 163;
	}
	if (code === 8729) {
		return 20;
	}
	if (code === 196) {
		return 127;
	}
	return code;
}

/* -------------------------------------------------------------------------- */
/* TeX font encodings                                                          */
/* -------------------------------------------------------------------------- */

/** Math symbols (cmsy). Every position is a symbol, ASCII-looking or not. */
const CMSY: Record<number, string> = {
	0: '−', 1: '·', 2: '×', 3: '∗', 4: '÷', 5: '⋄',
	6: '±', 7: '∓', 8: '⊕', 9: '⊖', 10: '⊗', 11: '⊘',
	12: '⊙', 13: '○', 14: '∘', 15: '•', 16: '≍', 17: '≡',
	18: '⊆', 19: '⊇', 20: '≤', 21: '≥', 22: '⪯', 23: '⪰',
	24: '∼', 25: '≈', 26: '⊂', 27: '⊃', 28: '≪', 29: '≫',
	30: '≺', 31: '≻', 32: '←', 33: '→', 34: '↑', 35: '↓',
	36: '↔', 37: '↗', 38: '↘', 39: '≃', 40: '⇐', 41: '⇒',
	42: '⇑', 43: '⇓', 44: '⇔', 45: '↖', 46: '↙', 47: '∝',
	48: '′', 49: '∞', 50: '∈', 51: '∋', 52: '△', 53: '▽',
	54: '̸', 55: '↦', 56: '∀', 57: '∃', 58: '¬', 59: '∅',
	60: 'ℜ', 61: 'ℑ', 62: '⊤', 63: '⊥', 64: 'ℵ',
	// 65–90 are the calligraphic capitals; plain A–Z reads far better than the
	// Unicode script block, which almost no installed font carries.
	91: '∪', 92: '∩', 93: '⊎', 94: '∧', 95: '∨', 96: '⊢',
	97: '⊣', 98: '⌊', 99: '⌋', 100: '⌈', 101: '⌉', 102: '{',
	103: '}', 104: '⟨', 105: '⟩', 106: '|', 107: '‖', 108: '↕',
	109: '⇕', 110: '\\', 111: '≀', 112: '√', 113: '⨿', 114: '∇',
	115: '∫', 116: '⊔', 117: '⊓', 118: '⊑', 119: '⊒',
	120: '§', 121: '†', 122: '‡', 123: '¶', 124: '♣',
	125: '♢', 126: '♡', 127: '♠',
};

/** Math italic (cmmi). Latin letters and digits are already themselves. */
const CMMI: Record<number, string> = {
	0: 'Γ', 1: 'Δ', 2: 'Θ', 3: 'Λ', 4: 'Ξ', 5: 'Π',
	6: 'Σ', 7: 'Υ', 8: 'Φ', 9: 'Ψ', 10: 'Ω',
	11: 'α', 12: 'β', 13: 'γ', 14: 'δ', 15: 'ϵ', 16: 'ζ',
	17: 'η', 18: 'θ', 19: 'ι', 20: 'κ', 21: 'λ', 22: 'μ',
	23: 'ν', 24: 'ξ', 25: 'π', 26: 'ρ', 27: 'σ', 28: 'τ',
	29: 'υ', 30: 'ϕ', 31: 'χ', 32: 'ψ', 33: 'ω', 34: 'ε',
	35: 'ϑ', 36: 'ϖ', 37: 'ϱ', 38: 'ς', 39: 'φ',
	40: '↼', 41: '↽', 42: '⇀', 43: '⇁', 44: '⌣', 45: '⌢',
	46: '▷', 47: '◁',
	// 48–62 are digits, `.`, `,`, `<`, `/`, `>` — correct as emitted.
	63: '⋆', 64: '∂',
	// 65–90, 97–122: italic Latin letters, correct as emitted.
	91: '♭', 92: '♮', 93: '♯', 94: '⌣', 95: '⌢', 96: 'ℓ',
	123: 'ı', 124: 'ȷ', 125: '℘', 126: '⃗', 127: '⌢',
};

/** Text (OT1: cmr, cmbx, cmti, cmss, cmtt). Only the non-ASCII slots. */
const OT1: Record<number, string> = {
	0: 'Γ', 1: 'Δ', 2: 'Θ', 3: 'Λ', 4: 'Ξ', 5: 'Π',
	6: 'Σ', 7: 'Υ', 8: 'Φ', 9: 'Ψ', 10: 'Ω',
	11: 'ﬀ', 12: 'ﬁ', 13: 'ﬂ', 14: 'ﬃ', 15: 'ﬄ',
	16: 'ı', 17: 'ȷ', 18: '`', 19: '´', 20: 'ˇ', 21: '˘',
	22: '¯', 23: '˚', 24: '¸', 25: 'ß', 26: 'æ', 27: 'œ',
	28: 'ø', 29: 'Æ', 30: 'Œ', 31: 'Ø',
	// 32–126 are left exactly as emitted: a label reading `a < b` must keep
	// its `<`, even though OT1 technically holds `¡` in that slot.
	127: '¨',
};

/**
 * Math extension (cmex): the sized delimiters and the big operators.
 *
 * Only the positions this plugin could verify against real TikZJax output
 * are listed. The extensible pieces that build a delimiter taller than
 * `\big4` out of a top and a bottom half are deliberately left out, except
 * the parenthesis pair, whose bottom half maps to nothing so a tall `(` is
 * one paren rather than two stacked ones.
 */
const CMEX: Record<number, string> = {
	// size 1
	0: '(', 1: ')', 2: '[', 3: ']', 4: '⌊', 5: '⌋', 6: '⌈', 7: '⌉',
	8: '{', 9: '}', 10: '⟨', 11: '⟩', 12: '|', 13: '‖', 14: '/', 15: '\\',
	// sizes 2 and 3, in pairs
	16: '(', 17: ')', 18: '(', 19: ')',
	20: '[', 21: ']', 22: '[', 23: ']',
	24: '⌊', 25: '⌋', 26: '⌊', 27: '⌋',
	28: '⌈', 29: '⌉', 30: '⌈', 31: '⌉',
	32: '{', 33: '}', 34: '{', 35: '}',
	36: '⟨', 37: '⟩', 38: '⟨', 39: '⟩',
	40: '/', 41: '\\', 42: '/', 43: '\\',
	// extensible parenthesis: top half carries the glyph, bottom half is dropped
	48: '(', 49: ')', 64: '', 65: '',
	// big operators, text size then display size
	70: '⨆', 71: '⨆', 72: '∮', 73: '∮',
	74: '⨀', 75: '⨀', 76: '⨁', 77: '⨁', 78: '⨂', 79: '⨂',
	80: '∑', 81: '∏', 82: '∫', 83: '⋃',
	84: '⋂', 85: '⨄', 86: '⋀', 87: '⋁',
	88: '∑', 89: '∏', 90: '∫', 91: '⋃',
	92: '⋂', 93: '⨄', 94: '⋀', 95: '⋁',
	96: '∐', 97: '∐',
	// radical signs (the overbar is drawn as a rule, not as text)
	112: '√', 113: '√', 114: '√', 115: '√',
	116: '√', 117: '√',
};

/* -------------------------------------------------------------------------- */
/* font classification                                                         */
/* -------------------------------------------------------------------------- */

const MATH_FAMILY = 'Cambria Math, STIX Two Math, Latin Modern Math, serif';
const TEXT_FAMILY = 'Latin Modern Roman, Computer Modern, serif';
const MONO_FAMILY = 'Latin Modern Mono, Computer Modern Typewriter, monospace';

export interface TexFontInfo {
	/** Position → Unicode for this font's encoding. */
	table: Record<number, string>;
	/** CSS font stack to show the repaired text with. */
	cssFamily: string;
	italic: boolean;
	bold: boolean;
}

/**
 * Classify a TeX font name (`cmsy10`, `cmmi7`, `cmbx12`, `lmr10`, …).
 *
 * The size suffix is dropped on purpose: cmmi5, cmmi7 and cmmi10 share one
 * encoding, and only handling the 10pt ones is exactly why superscripts,
 * subscripts and fractions stayed broken while the base size looked fine.
 */
export function classifyTexFont(fontName: string): TexFontInfo | null {
	const base = fontName.trim().toLowerCase().replace(/\d+$/, '');
	switch (base) {
		case 'cmsy':
		case 'lmsy':
		case 'cmbsy':
			return { table: CMSY, cssFamily: MATH_FAMILY, italic: false, bold: base === 'cmbsy' };
		case 'cmmi':
		case 'lmmi':
		case 'cmmib':
			// Math variables are italic in every TeX output; the previous fix
			// re-pointed them at an upright text font.
			return { table: CMMI, cssFamily: MATH_FAMILY, italic: true, bold: base === 'cmmib' };
		case 'cmex':
		case 'lmex':
			return { table: CMEX, cssFamily: MATH_FAMILY, italic: false, bold: false };
		case 'cmr':
		case 'lmr':
		case 'cmss':
		case 'lmss':
			return { table: OT1, cssFamily: TEXT_FAMILY, italic: false, bold: false };
		case 'cmbx':
		case 'lmbx':
		case 'cmssbx':
			return { table: OT1, cssFamily: TEXT_FAMILY, italic: false, bold: true };
		case 'cmti':
		case 'lmti':
		case 'cmsl':
		case 'cmssi':
			return { table: OT1, cssFamily: TEXT_FAMILY, italic: true, bold: false };
		case 'cmtt':
		case 'lmtt':
			return { table: OT1, cssFamily: MONO_FAMILY, italic: false, bold: false };
		default:
			return null;
	}
}

/** Repair one text run written in `font`, or return it unchanged. */
export function decodeTexGlyphs(text: string, font: TexFontInfo): string {
	let out = '';
	let changed = false;
	for (const char of text) {
		const position = decodeDviCharCode(char.codePointAt(0) ?? 0);
		const mapped = font.table[position];
		if (mapped === undefined) {
			// Not in the table: the emitted byte is already the right glyph.
			out += String.fromCodePoint(position);
			changed = changed || position !== char.codePointAt(0);
			continue;
		}
		out += mapped;
		changed = changed || mapped !== char;
	}
	return changed ? out : text;
}
