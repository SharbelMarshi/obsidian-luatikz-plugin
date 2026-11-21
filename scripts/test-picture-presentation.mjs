/**
 * Picture-level presentation, against the real src modules:
 *   - the `\begin{tikzpicture}[...]` option list the visual editor writes,
 *   - the `% width=` directive and its vault-wide default,
 *   - the configurable code block languages.
 *
 * All three share one failure mode worth pinning: they rewrite or strip text
 * the user owns, so an option the editor does not model, a half-typed width,
 * or a bogus language must survive / be refused rather than be mangled.
 */
import assert from 'node:assert/strict';
import { loadSrcModules } from './loadSrc.mjs';

const { picture, size, align, source, fences, parser } = await loadSrcModules(
	{
		picture: 'src/visual/pictureOptions.ts',
		size: 'src/utils/diagramSize.ts',
		align: 'src/utils/diagramAlign.ts',
		source: 'src/core/tikzSource.ts',
		fences: 'src/editor/tikzFences.ts',
		parser: 'src/visual/tikzSceneParser.ts',
	},
	{ external: ['@codemirror/state', '@codemirror/view'] },
);

/* ============================================= tikzpicture option list */

{
	const state = picture.parsePictureOptions(
		'>=latex, thick, every node/.style={font=\\Large}, scale=1.5, node distance=2cm',
	);
	assert.equal(state.arrowTip, 'latex');
	assert.equal(state.lineWidth, 'thick');
	assert.equal(state.nodeFont, '\\Large');
	assert.equal(state.scale, 1.5);
	assert.equal(state.nodeDistance, '2cm');
	assert.deepEqual(state.rest, [], 'nothing unrecognized in a fully modelled list');
}

{
	// The example from the feature request, written across several lines.
	const state = picture.parsePictureOptions(
		'\n    >=latex,\n    thick,\n    every node/.style={font=\\Large}\n',
	);
	assert.equal(state.arrowTip, 'latex');
	assert.equal(state.lineWidth, 'thick');
	assert.equal(state.nodeFont, '\\Large');
}

{
	// arrows.meta tips may be braced or bare on the way in.
	assert.equal(picture.parsePictureOptions('>={Stealth}').arrowTip, 'Stealth');
	assert.equal(picture.parsePictureOptions('>=Stealth').arrowTip, 'Stealth');
	assert.equal(picture.parsePictureOptions('>={Latex[round]}').arrowTip, '',
		'a tip spec the panel cannot round-trip is left to the source');
}

{
	// Unknown options are preserved, in order, after the modelled ones.
	const next = picture.applyPictureOptionEdit(
		'my style, rounded corners, thick, decoration={snake}',
		{ nodeFont: '\\Large' },
	);
	assert.equal(next, 'thick, every node/.style={font=\\Large}, my style, rounded corners, decoration={snake}');
}

{
	// Clearing a modelled option removes only that token.
	const next = picture.applyPictureOptionEdit('>=latex, thick, custom', { lineWidth: '' });
	assert.equal(next, '>=latex, custom');
}

{
	// scale=1 is the identity and is not written out.
	assert.equal(picture.applyPictureOptionEdit('', { scale: 1 }), '');
	assert.equal(picture.applyPictureOptionEdit('', { scale: 2 }), 'scale=2');
	assert.equal(picture.applyPictureOptionEdit('scale=2', { scale: null }), '');
}

{
	// An emptied list drops the brackets rather than writing `[]`.
	assert.equal(picture.formatPictureOptionGroup(''), '');
	assert.equal(picture.formatPictureOptionGroup(' thick '), '[thick]');
}

/* ------- the spans the editor patches ------- */

{
	const body = '\\begin{tikzpicture}[>=latex, thick]\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}\n';
	const scene = parser.parseTikzScene(body);
	const [pic] = scene.pictures;
	assert.equal(pic.optionsText, '>=latex, thick');
	assert.equal(body.slice(pic.optionsSpan.from, pic.optionsSpan.to), '[>=latex, thick]');
	assert.equal(body.slice(pic.beginSpan.from, pic.beginSpan.to), '\\begin{tikzpicture}');
}

{
	// No options yet: the insert point is the end of \begin{tikzpicture}.
	const body = '\\begin{tikzpicture}\n\\draw (0,0) -- (1,1);\n\\end{tikzpicture}\n';
	const scene = parser.parseTikzScene(body);
	const [pic] = scene.pictures;
	assert.equal(pic.optionsSpan, null);
	assert.equal(pic.beginSpan.to, '\\begin{tikzpicture}'.length);
	const patched = body.slice(0, pic.beginSpan.to) + '[thick]' + body.slice(pic.beginSpan.to);
	assert.ok(patched.startsWith('\\begin{tikzpicture}[thick]\n'));
}

/* ======================================================= align directive */

{
	const body = '% align=left\n\\begin{tikzpicture}\n\\draw (0,0);\n\\end{tikzpicture}\n';
	assert.equal(align.parseDiagramAlign(body), 'left');
	const span = align.alignDirectiveSpan(body);
	assert.deepEqual(span, { from: 0, to: '% align=left'.length });
	const rewritten = body.slice(0, span.from) + align.formatAlignDirective('right') + body.slice(span.to);
	assert.equal(align.parseDiagramAlign(rewritten), 'right');
}

// Five stops: the quarter positions must not be swallowed by the plain ones
// (`left` matching the start of `left-center` and leaving `-center` behind).
for (const value of ['left', 'left-center', 'center', 'right-center', 'right']) {
	assert.equal(
		align.parseDiagramAlign(`% align=${value}\n\\draw (0,0);`),
		value,
		value,
	);
	assert.equal(
		align.parseDiagramAlign(`\\begin{tikzpicture}[align=${value}]\n\\draw (0,0);`),
		value,
		`${value} in the tikzpicture options`,
	);
}
assert.deepEqual(
	[...align.DIAGRAM_ALIGNMENTS],
	['left', 'left-center', 'center', 'right-center', 'right'],
	'left to right, so a UI can list them in order',
);
assert.equal(align.parseDiagramAlign('% align=sideways\n\\draw (0,0);'), 'center',
	'an unknown value falls back rather than breaking the block');

{
	// The alignment option never reaches LaTeX, quarter stops included.
	const body = '\\begin{tikzpicture}[align=left-center, thick]\n\\draw (0,0);\n\\end{tikzpicture}';
	const prepared = source.prepareTikzRenderSource(body);
	assert.equal(prepared.diagramAlign, 'left-center');
	assert.ok(!prepared.renderSource.includes('align='), prepared.renderSource);
	assert.ok(prepared.renderSource.includes('[thick]'), 'the other options survive');
}

assert.equal(align.alignDirectiveSpan('\\draw (0,0);'), null, 'no directive, no span');
assert.equal(align.parseDiagramAlign('\\draw (0,0);'), 'center', 'shipped fallback');
assert.equal(align.parseDiagramAlign('\\draw (0,0);', 'left'), 'left', 'vault default applies');
assert.equal(
	align.parseDiagramAlign('% align=center\n\\draw (0,0);', 'left'),
	'center',
	"a block's own directive beats the vault default",
);

/* ========================================================= width directive */

assert.equal(size.parseDiagramWidth('% width=100%\n\\draw (0,0);'), '100%');
assert.equal(size.parseDiagramWidth('% width: 420px\n\\draw (0,0);'), '420px');
assert.equal(size.parseDiagramWidth('% width=80\n\\draw (0,0);'), '80%', 'a bare number is a percentage');
assert.equal(size.parseDiagramWidth('% width=auto\n\\draw (0,0);'), null);
assert.equal(size.parseDiagramWidth('\\draw (0,0);'), null);

// A pgfplots option list spread over lines must survive untouched: `width=8cm`
// on its own line is TikZ, not a directive.
for (const line of ['width=8cm', 'width=8cm,', '  width = 0.9\\textwidth']) {
	assert.equal(size.parseDiagramWidth(`${line}\n\\draw (0,0);`), null, line);
	assert.equal(size.isObsidianWidthDirectiveLine(line), false, line);
}
{
	const body = '\\begin{axis}[\nwidth=8cm,\nheight=6cm\n]\n\\end{axis}';
	assert.ok(
		source.prepareTikzRenderSource(body).renderSource.includes('width=8cm,'),
		'an axis width option must reach LaTeX',
	);
}

// Values that would end up in a style property are a closed set.
assert.equal(size.normalizeDiagramWidth('100%; background:url(x)'), null);
assert.equal(size.normalizeDiagramWidth('calc(100% - 2px)'), null);
assert.equal(size.normalizeDiagramWidth('12cm'), '12cm');
assert.equal(size.normalizeDiagramWidth(''), null);

// The span the Picture panel rewrites, so a width is replaced, not stacked.
{
	const body = '% width=100%\n\\begin{tikzpicture}\n\\end{tikzpicture}\n';
	const span = size.widthDirectiveSpan(body);
	assert.deepEqual(span, { from: 0, to: '% width=100%'.length });
	const rewritten = body.slice(0, span.from)
		+ size.formatWidthDirective('50%')
		+ body.slice(span.to);
	assert.equal(size.parseDiagramWidth(rewritten), '50%');
}
assert.equal(size.widthDirectiveSpan('\\draw (0,0);'), null);

/* ======================================================= horizontal nudge */

assert.equal(size.parseDiagramOffsetX('% offset-x=-3\n\\draw (0,0);'), '-3em',
	'a bare number is em, so the nudge scales with the note');
assert.equal(size.parseDiagramOffsetX('% x-offset=2.5\n\\draw (0,0);'), '2.5em');
assert.equal(size.parseDiagramOffsetX('% offset-x=-40px\n\\draw (0,0);'), '-40px');
assert.equal(size.parseDiagramOffsetX('% offset-x=0\n\\draw (0,0);'), null, 'zero is no nudge');
assert.equal(size.parseDiagramOffsetX('\\draw (0,0);'), null);
assert.equal(size.normalizeDiagramOffsetX('-3; background:red'), null, 'not a length');

// `x=-3` on its own line is a TikZ unit vector, never a directive.
for (const line of ['x=-3', 'x=-3cm,', 'offset-x=-3']) {
	assert.equal(size.parseDiagramOffsetX(`${line}\n\\draw (0,0);`), null, line);
	assert.equal(size.isObsidianWidthDirectiveLine(line), false, line);
}

{
	const body = '% offset-x=-3\n% align=center\n\\begin{tikzpicture}\n\\draw (0,0);\n\\end{tikzpicture}';
	const prepared = source.prepareTikzRenderSource(body);
	assert.equal(prepared.diagramOffsetX, '-3em');
	assert.equal(prepared.diagramAlign, 'center');
	assert.ok(!prepared.renderSource.includes('offset-x'), 'stripped before render');

	const span = size.offsetXDirectiveSpan(body);
	assert.deepEqual(span, { from: 0, to: '% offset-x=-3'.length });
}

{
	// The directive is Obsidian-only: it must never reach LaTeX.
	const body = '% width=100%\n% align=left\n\\begin{tikzpicture}\n\\draw (0,0);\n\\end{tikzpicture}';
	const prepared = source.prepareTikzRenderSource(body);
	assert.equal(prepared.diagramWidth, '100%');
	assert.equal(prepared.diagramAlign, 'left');
	assert.ok(!prepared.renderSource.includes('width='), 'width directive stripped before render');
	assert.ok(!prepared.renderSource.includes('align='), 'align directive stripped before render');
	assert.ok(prepared.renderSource.includes('\\draw (0,0);'));
}

{
	const prepared = source.prepareTikzRenderSource(
		'\\begin{tikzpicture}\n\\draw (0,0);\n\\end{tikzpicture}',
		{ align: 'right', width: '90%' },
	);
	assert.equal(prepared.diagramAlign, 'right');
	assert.equal(prepared.diagramWidth, '90%');
}

{
	const prepared = source.prepareTikzRenderSource(
		'% width=50%\n\\begin{tikzpicture}\n\\draw (0,0);\n\\end{tikzpicture}',
		{ width: '90%' },
	);
	assert.equal(prepared.diagramWidth, '50%', "a block's own width beats the vault default");
}

/* =================================================== code block languages */

assert.deepEqual(fences.normalizeFenceLanguages('tikz, luatikz'), ['tikz', 'luatikz']);
assert.deepEqual(fences.normalizeFenceLanguages('```luatikz'), ['luatikz'], 'backticks stripped');
assert.deepEqual(fences.normalizeFenceLanguages('LuaTikZ\nmytikz'), ['luatikz', 'mytikz']);
assert.deepEqual(fences.normalizeFenceLanguages('tikz, tikz'), ['tikz'], 'de-duplicated');
assert.deepEqual(
	fences.normalizeFenceLanguages('   '),
	['tikz', 'luatikz'],
	'a blank list must never leave the plugin with no code block',
);
assert.deepEqual(
	fences.normalizeFenceLanguages('tikz, bad)name, a|b'),
	['tikz', 'a', 'b'],
	'tokens that are not valid languages are dropped, not escaped into the regex',
);

{
	// The configured list is what every editor extension then matches on.
	fences.setTikzFenceLanguages(['mytikz']);
	assert.equal(fences.isOpenTikzFenceLine('```mytikz'), true);
	assert.equal(fences.isOpenTikzFenceLine('```tikz'), false, 'a language we do not own is not ours');
	assert.equal(fences.primaryTikzFenceLanguage(), 'mytikz');
	assert.ok(fences.latexFenceLanguages().includes('mytikz'));
	assert.ok(fences.latexFenceLanguages().includes('latex'));

	fences.setTikzFenceLanguages([]);
	assert.equal(fences.isOpenTikzFenceLine('```tikz'), true, 'empty list falls back to the defaults');
}

console.log('picture-presentation: options, align, width, languages OK');
