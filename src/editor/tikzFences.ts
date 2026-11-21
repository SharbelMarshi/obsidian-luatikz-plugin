import type { EditorView } from '@codemirror/view';

/**
 * The one definition of "a tikz fence" for every editor extension. Before the
 * extraction the opening-fence regex existed in five places (tikzIdeGutter,
 * tikzFenceStarter, tikzStructuralLint, plus two variants in
 * latexAutocomplete), and the block scanner was duplicated byte-for-byte
 * between tikzIdeGutter and tikzStructuralLint.
 *
 * The language list is configurable (Settings → Code block languages), so a
 * vault where another plugin already owns ```tikz can move LuaTikZ onto its
 * own fence. Everything below reads the list through the accessors rather
 * than hardcoding it, and `setTikzFenceLanguages` is the single writer.
 */

/** Shipped default; also the fallback when the configured list is empty. */
export const DEFAULT_TIKZ_FENCE_LANGUAGES: readonly string[] = ['tikz', 'luatikz'];

/** Non-tikz fences the completion source also serves. */
const EXTRA_LATEX_FENCE_LANGUAGES: readonly string[] = ['latex', 'lualatex', 'tex'];

/** A language token Obsidian will accept after ``` (and a safe regex atom). */
const LANGUAGE_TOKEN_RE = /^[a-z0-9][a-z0-9_+-]*$/;

/**
 * Clean a user-entered list ("tikz, luatikz" / newline separated) into
 * registrable language names: lowercased, de-duplicated, backticks and other
 * separators dropped. Returns the shipped defaults when nothing survives, so
 * a blank setting can never leave the plugin with no code block at all.
 */
export function normalizeFenceLanguages(raw: string): string[] {
	const seen = new Set<string>();
	for (const part of raw.split(/[\s,;|]+/)) {
		const name = part.replace(/`/g, '').trim().toLowerCase();
		if (name && LANGUAGE_TOKEN_RE.test(name)) {
			seen.add(name);
		}
	}
	return seen.size ? [...seen] : [...DEFAULT_TIKZ_FENCE_LANGUAGES];
}

let tikzLanguages: string[] = [...DEFAULT_TIKZ_FENCE_LANGUAGES];
let openFenceRe = buildOpenFenceRe(tikzLanguages);

function buildOpenFenceRe(languages: readonly string[]): RegExp {
	// Names are validated by normalizeFenceLanguages, so no escaping is
	// needed — but the alternation is still built from the live list only.
	return new RegExp(`^\`\`\`(?:${languages.join('|')})\\b.*$`);
}

/** Install the configured list; every accessor below follows immediately. */
export function setTikzFenceLanguages(languages: readonly string[]): void {
	tikzLanguages = languages.length ? [...languages] : [...DEFAULT_TIKZ_FENCE_LANGUAGES];
	openFenceRe = buildOpenFenceRe(tikzLanguages);
}

export function tikzFenceLanguages(): readonly string[] {
	return tikzLanguages;
}

/** The language a newly inserted fence is written with. */
export function primaryTikzFenceLanguage(): string {
	return tikzLanguages[0] ?? DEFAULT_TIKZ_FENCE_LANGUAGES[0];
}

export function latexFenceLanguages(): readonly string[] {
	return [...tikzLanguages, ...EXTRA_LATEX_FENCE_LANGUAGES];
}

/** True when `trimmedLine` opens a LuaTikZ fence. */
export function isOpenTikzFenceLine(trimmedLine: string): boolean {
	return openFenceRe.test(trimmedLine);
}

export interface FencedBlockRange {
	/** Document offset of the first content character. */
	from: number;
	/** Document offset of the last content character. */
	to: number;
	/** 1-based first content line (the line after the opening fence). */
	startLine: number;
	/** 1-based last content line (the line before the closing fence). */
	endLine: number;
	/** Block body exactly as sliced from the document. */
	source: string;
}

/**
 * The 1-based line number of the open fence enclosing `pos`, or null.
 *
 * A backwards line scan: the nearest fence marker above the cursor decides —
 * an opening fence in `languages` means inside, any other ``` line (a closing
 * fence or another language's opener) means outside. Replaces a forward regex
 * over `doc.sliceString(0, pos)` that materialised the whole prefix on every
 * document change in every markdown file, and that also matched fences
 * mid-line (inline code) because it was not line-anchored.
 */
export function enclosingFenceLine(
	doc: EditorView['state']['doc'],
	pos: number,
	languages: readonly string[],
): number | null {
	const openRe = new RegExp(`^\`\`\`(?:${languages.join('|')})\\b`);
	const currentLine = doc.lineAt(pos).number;

	for (let lineNumber = currentLine; lineNumber >= 1; lineNumber--) {
		const trimmed = doc.line(lineNumber).text.trim();
		if (!trimmed.startsWith('```')) {
			continue;
		}
		// The cursor's own line being a fence marker means the cursor sits on
		// the boundary, not in the content.
		if (lineNumber === currentLine) {
			return null;
		}
		return openRe.test(trimmed) ? lineNumber : null;
	}

	return null;
}

/**
 * Content ranges of every closed LuaTikZ fence, in document order. Fences
 * without content (open + close on adjacent lines) are skipped.
 */
export function findFencedTikzRanges(doc: EditorView['state']['doc']): FencedBlockRange[] {
	const ranges: FencedBlockRange[] = [];
	let openLine: number | null = null;

	for (let lineNumber = 1; lineNumber <= doc.lines; lineNumber++) {
		const trimmed = doc.line(lineNumber).text.trim();

		if (openLine === null) {
			if (isOpenTikzFenceLine(trimmed)) {
				openLine = lineNumber;
			}
			continue;
		}

		if (trimmed === '```') {
			const startLine = openLine + 1;
			const endLine = lineNumber - 1;
			if (endLine >= startLine) {
				const from = doc.line(startLine).from;
				const to = doc.line(endLine).to;
				ranges.push({
					from,
					to,
					startLine,
					endLine,
					source: doc.sliceString(from, to),
				});
			}
			openLine = null;
		}
	}

	return ranges;
}
