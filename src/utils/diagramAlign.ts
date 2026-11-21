import { isObsidianGridDirectiveLine } from './diagramGrid';
import { isObsidianWidthDirectiveLine } from './diagramSize';

/**
 * Where the rendered diagram sits in the note.
 *
 * Five stops rather than three: `left-center` and `right-center` put the
 * diagram a quarter of the way in, which is what a figure beside running
 * prose usually wants — hard left reads as detached, dead centre wastes the
 * margin.
 */
export type DiagramAlign =
	| 'left' | 'left-center' | 'center' | 'right-center' | 'right';

export const DIAGRAM_ALIGNMENTS: readonly DiagramAlign[] = [
	'left', 'left-center', 'center', 'right-center', 'right',
];

// The compound names come first: alternation is ordered, so `left` would
// otherwise match the start of `left-center` and leave `-center` unmatched.
const ALIGN_VALUE_PATTERN = 'left-center|right-center|left|center|right';

const ALIGN_LINE_RE = new RegExp(
	`^\\s*(?:%\\s*)?align\\s*[=:]\\s*(${ALIGN_VALUE_PATTERN})\\s*$`, 'i');
const ALIGN_OPTION_RE = new RegExp(
	`^align\\s*=\\s*(${ALIGN_VALUE_PATTERN})$`, 'i');
const TIKZPICTURE_BEGIN_RE = /\\begin\{tikzpicture\}\s*\[([^\]]*)\]/;

function normalizeAlign(value: string): DiagramAlign {
	const normalized = value.trim().toLowerCase();
	return (DIAGRAM_ALIGNMENTS as readonly string[]).includes(normalized)
		? normalized as DiagramAlign
		: 'center';
}

function parseAlignFromOptionList(options: string): DiagramAlign | null {
	for (const part of options.split(',')) {
		const match = part.trim().match(ALIGN_OPTION_RE);
		if (match) {
			return normalizeAlign(match[1]);
		}
	}
	return null;
}

function parseAlignFromTikzpicture(source: string): DiagramAlign | null {
	const match = source.match(TIKZPICTURE_BEGIN_RE);
	if (!match) {
		return null;
	}
	return parseAlignFromOptionList(match[1]);
}

function stripAlignFromTikzpictureOptions(source: string): string {
	return source.replace(TIKZPICTURE_BEGIN_RE, (_full, options: string) => {
		const cleaned = options
			.split(',')
			.map(part => part.trim())
			.filter(part => part.length > 0 && !ALIGN_OPTION_RE.test(part))
			.join(', ');
		if (!cleaned) {
			return '\\begin{tikzpicture}';
		}
		return `\\begin{tikzpicture}[${cleaned}]`;
	});
}

/**
 * Read diagram block alignment from a directive line or tikzpicture options,
 * falling back to `fallback` (the vault-wide default) when neither says.
 */
export function parseDiagramAlign(source: string, fallback: DiagramAlign = 'center'): DiagramAlign {
	for (const line of source.split('\n')) {
		const match = line.match(ALIGN_LINE_RE);
		if (match) {
			return normalizeAlign(match[1]);
		}
	}

	return parseAlignFromTikzpicture(source) ?? fallback;
}

/** The directive line the visual editor writes for `align`. */
export function formatAlignDirective(align: DiagramAlign): string {
	return `% align=${align}`;
}

/**
 * Character span of the existing `% align=` directive line in a fence body
 * (excluding its newline), or null when the body has none. Used by the
 * visual editor to rewrite the directive as a minimal source patch.
 */
export function alignDirectiveSpan(source: string): { from: number; to: number } | null {
	let offset = 0;
	for (const line of source.split('\n')) {
		if (ALIGN_LINE_RE.test(line.trim())) {
			return { from: offset, to: offset + line.length };
		}
		offset += line.length + 1;
	}
	return null;
}

/** True when this line is stripped before LaTeX/TikZJax render (e.g. `% align=left`, `% grid=1`). */
export function isObsidianOnlyDirectiveLine(line: string): boolean {
	const trimmed = line.trim();
	return ALIGN_LINE_RE.test(trimmed)
		|| isObsidianGridDirectiveLine(trimmed)
		|| isObsidianWidthDirectiveLine(trimmed);
}

/** Mirror prepareTikzRenderSource line-by-line; null = omitted from render source. */
export function prepareBlockLineForRender(line: string): string | null {
	const trimmed = line.replaceAll('&nbsp;', '').trim();
	if (!trimmed) {
		return null;
	}
	if (isObsidianOnlyDirectiveLine(trimmed)) {
		return null;
	}
	return stripAlignFromTikzpictureOptions(trimmed);
}

/** Remove diagram alignment directives before sending source to LaTeX/TikZJax. */
export function stripDiagramAlignDirective(source: string): string {
	return source
		.split('\n')
		.map(line => prepareBlockLineForRender(line))
		.filter((line): line is string => line !== null)
		.join('\n');
}

export function applyDiagramAlign(containerEl: HTMLElement, align: DiagramAlign): void {
	for (const value of DIAGRAM_ALIGNMENTS) {
		containerEl.removeClass(`luatikz-diagram-align-${value}`);
	}
	containerEl.addClass(`luatikz-diagram-align-${align}`);
}
