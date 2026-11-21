/**
 * TeX font position → Unicode repair for TikZJax output, against the real
 * src modules and then against the real TeX engine.
 *
 * The regression this pins: TikZJax's DVI→SVG converter writes each glyph as
 * a raw TeX *font position* and names the TeX font in `font-family`. The old
 * repair had a hand-written table for three 10pt fonts only, matched
 * `font-family` on the `<text>` element alone, and passed anything that
 * looked like ASCII straight through. So `\Rightarrow` (cmsy position 41)
 * rendered as `)`, `G^{-1}` rendered with a raised `¡` (cmsy7 position 0 —
 * script sizes were not handled at all), and once SVGO hoisted a shared
 * `font-family` onto a `<g>`, whole formulas were skipped.
 */
import assert from 'node:assert/strict';
import { loadSrcModules } from './loadSrc.mjs';

const { fix, glyphs, rtl, norm } = await loadSrcModules(
	{
		fix: 'src/utils/tikzJaxSvgFix.ts',
		glyphs: 'src/utils/texFontGlyphs.ts',
		rtl: 'src/latex/tikzJaxRtl.ts',
		norm: 'src/latex/tikzJaxSource.ts',
	},
	{ external: [] },
);
const { fixTikzJaxSvgGlyphs, finalizeTikzJaxSvg } = fix;
const { decodeDviCharCode, classifyTexFont, decodeTexGlyphs } = glyphs;
const { extractRtlRuns, applyRtlRunsToSvg } = rtl;

/* ===================================================== the converter's code */

// Exact inverse of @prinsss/dvi2html's putChar, plus node-tikzjax's
// &#173; -> &#172; patch.
assert.equal(decodeDviCharCode(161), 0, 'position 0 is emitted as 161');
assert.equal(decodeDviCharCode(170), 9);
assert.equal(decodeDviCharCode(172), 10, 'the soft hyphen is patched to 172');
assert.equal(decodeDviCharCode(174), 11);
assert.equal(decodeDviCharCode(182), 19);
assert.equal(decodeDviCharCode(8729), 20);
assert.equal(decodeDviCharCode(184), 21);
assert.equal(decodeDviCharCode(195), 32);
assert.equal(decodeDviCharCode(196), 127);
assert.equal(decodeDviCharCode(41), 41, 'printable positions are emitted as themselves');

/* ============================================================ font families */

// Every size of a family shares one encoding; handling only the 10pt ones is
// exactly what left superscripts, subscripts and fractions broken.
for (const name of ['cmsy5', 'cmsy7', 'cmsy10', 'cmsy9']) {
	const font = classifyTexFont(name);
	assert.ok(font, `${name} must be classified`);
	assert.equal(decodeTexGlyphs(')', font), '⇒', `${name}: position 41 is \\Rightarrow`);
}
for (const name of ['cmmi5', 'cmmi7', 'cmmi10', 'cmmi12']) {
	const font = classifyTexFont(name);
	assert.ok(font, `${name} must be classified`);
	assert.equal(decodeTexGlyphs('®', font), 'α', `${name}: position 11 is alpha`);
	assert.equal(font.italic, true, 'math variables are italic');
}
assert.equal(classifyTexFont('cmbx10').bold, true);
assert.equal(classifyTexFont('cmti10').italic, true);
assert.equal(classifyTexFont('Helvetica'), null, 'a real font is left alone');

/* ------- the specific glyphs from the bug reports ------- */

const cmsy = classifyTexFont('cmsy10');
assert.equal(decodeTexGlyphs('¡', classifyTexFont('cmsy7')), '−',
	'cmsy7 position 0 is the math minus, not an inverted exclamation mark');
assert.equal(decodeTexGlyphs('¢', cmsy), '·', '\\cdot');
assert.equal(decodeTexGlyphs('§', cmsy), '±', '\\pm');
assert.equal(decodeTexGlyphs('(', cmsy), '⇐', '\\Leftarrow');
assert.equal(decodeTexGlyphs('∙', cmsy), '≤', '\\leq');
assert.equal(decodeTexGlyphs('1', cmsy), '∞', '\\infty');

// Letters stay letters: cmsy 65-90 are calligraphic capitals, and the Unicode
// script block renders as tofu in almost every installed font.
assert.equal(decodeTexGlyphs('A', cmsy), 'A');

// cmmi keeps its Latin letters and digits, which are already correct.
const cmmi = classifyTexFont('cmmi10');
assert.equal(decodeTexGlyphs('Gx7', cmmi), 'Gx7');

/* ================================================ inherited font-family */

{
	// SVGO hoists a shared font-family onto the group; the old attribute-only
	// check saw none and skipped the run entirely.
	const svg = '<svg><g font-family="cmsy10"><text x="1" y="2">)</text>'
		+ '<text x="3" y="4">(</text></g></svg>';
	const out = fixTikzJaxSvgGlyphs(svg);
	assert.ok(out.includes('>⇒<'), out);
	assert.ok(out.includes('>⇐<'), out);
	assert.ok(!out.includes('font-family="cmsy10"'), 'the TeX font name must be replaced');
}

{
	// An element's own font-family wins over the group's, and the group's
	// font does not leak to a sibling outside it.
	const svg = '<svg><g font-family="cmsy10"><text font-family="cmr10" y="1">A</text></g>'
		+ '<text y="2">)</text></svg>';
	const out = fixTikzJaxSvgGlyphs(svg);
	assert.ok(out.includes('>A<'));
	assert.ok(out.includes('>)<'), 'a text node with no TeX font is left alone');
}

{
	// Content arrives XML-escaped; `&quot;` is cmsy position 34 (\uparrow).
	const out = fixTikzJaxSvgGlyphs('<svg><text font-family="cmsy10">&quot;</text></svg>');
	assert.ok(out.includes('>↑<'), out);
}

{
	// Escaping survives the round trip for text that is already correct.
	const out = fixTikzJaxSvgGlyphs('<svg><text font-family="cmr10">a &amp; b &lt; c</text></svg>');
	assert.ok(out.includes('a &amp; b &lt; c'), out);
}

{
	// Self-closing and unknown elements must not unbalance the font stack.
	const svg = '<svg><g font-family="cmsy10"><path d="M0 0"/><rect/>'
		+ '<text y="1">)</text></g><text y="2">)</text></svg>';
	const out = fixTikzJaxSvgGlyphs(svg);
	assert.ok(out.includes('>⇒<'), 'inside the group, repaired');
	assert.ok(out.includes('>)<'), 'outside the group, untouched');
}

{
	// A run with nested markup is left alone rather than having its tags
	// escaped into visible text.
	const svg = '<svg><text font-family="cmsy10"><tspan>)</tspan></text></svg>';
	assert.equal(fixTikzJaxSvgGlyphs(svg), svg, 'nested markup is untouched');
}

/* ============================================================ RTL text runs */

/*
 * TikZJax has no font that can set a Hebrew or Arabic glyph, so the old
 * fallback deleted the text of every \he{…} — the label simply vanished.
 * TeX now reserves a box and emits a placeholder; the text is written into
 * the finished SVG, where a real font can set it.
 */
{
	const body = '\\node at (0,0) {\\he{\u05e9\u05dc\u05d5\u05dd}};\n'
		+ '\\node at (0,1) {\\ar{\u0645\u0631\u062d\u0628\u0627}};\n'
		+ '\\node at (0,2) {\\he{plain}};';
	const { body: rewritten, runs } = extractRtlRuns(body);

	assert.equal(runs.length, 2, 'only the runs that actually hold RTL text');
	assert.equal(runs[0].text, '\u05e9\u05dc\u05d5\u05dd');
	assert.equal(runs[0].arabic, false);
	assert.equal(runs[1].arabic, true, 'Arabic gets its own font stack');
	assert.ok(rewritten.includes('\\he{plain}'), 'ASCII content keeps TeX typesetting');
	assert.ok(/\\luatikzrtl\{0\}\{[\d.]+\}/.test(rewritten), rewritten);
	assert.ok(/\\luatikzrtl\{1\}\{[\d.]+\}/.test(rewritten), rewritten);
	// A zero-width box would collapse the node it sits in.
	for (const match of rewritten.matchAll(/\\luatikzrtl\{\d+\}\{([\d.]+)\}/g)) {
		assert.ok(Number.parseFloat(match[1]) > 0.5, `reserved width ${match[1]}`);
	}
}

{
	// The placeholder is filled in with the text, a font stack and rtl.
	const { runs } = extractRtlRuns('\\node {\\he{\u05e9\u05dc\u05d5\u05dd}};');
	const svg = '<svg><text x="1" y="2" data-luatikz-rtl="0">.</text></svg>';
	const out = applyRtlRunsToSvg(svg, runs);
	assert.ok(out.includes('>\u05e9\u05dc\u05d5\u05dd<'), out);
	assert.ok(out.includes('direction="rtl"'), out);
	assert.ok(/font-family="[^"]*Hebrew/.test(out), out);
}

{
	// A placeholder with no run left (a stale cache entry) is emptied, never
	// left showing the marker character.
	const out = applyRtlRunsToSvg('<svg><text data-luatikz-rtl="7">.</text></svg>', []);
	assert.ok(out.includes('></text>'), out);
	assert.ok(!out.includes('>.<'), out);
}

{
	// The macro TeX uses must survive \newcommand: a literal `#0` in a color
	// is an illegal parameter number and kills the whole definition.
	assert.ok(!/[^#]#[^12]/.test(rtl.TIKZJAX_RTL_RAW_MACRO), rtl.TIKZJAX_RTL_RAW_MACRO);
	assert.ok(rtl.TIKZJAX_RTL_RAW_MACRO.includes('\\hbox to #2em'),
		'a trailing \\hskip is stripped when TikZ closes the node box');
}

{
	// End to end through the normalizer: the body loses the Hebrew, the
	// payload carries it, and the preamble defines the macro.
	const normalized = norm.normalizeForTikzJax(
		'\\begin{tikzpicture}\n\\node at (0,0) {\\he{\u05e9\u05dc\u05d5\u05dd}};\n\\end{tikzpicture}',
		'',
	);
	assert.equal(normalized.rtlRuns.length, 1);
	assert.ok(!normalized.renderTex.includes('\u05e9'), 'no Hebrew reaches TeX');
	assert.ok(normalized.addToPreamble.includes('luatikzrtl'), 'the macro is defined');
	assert.ok(normalized.tex.includes('\u05e9'), 'the debug document keeps the original');
}

console.log('tikzjax-glyphs: decoder, encodings and inheritance OK');

/* ====================================================== real TeX rendering */

let tex2svg;
try {
	const mod = await import('node-tikzjax');
	tex2svg = typeof mod.default === 'function' ? mod.default : mod.default?.default ?? mod;
	if (typeof tex2svg !== 'function') {
		throw new Error('no tex2svg export');
	}
} catch {
	console.log('tikzjax-glyphs: skipped the engine pass (node-tikzjax not installed)');
	process.exit(0);
}

const CASES = [
	// The two formulas from the bug report: `\Rightarrow` came out as `)`,
	// and the `-1` superscript as an inverted exclamation mark.
	['$Z = (X \\pm Y)G \\iff Z = GX \\pm GY$', 'Z=(X±Y)G⇐⇒Z=GX±GY'],
	['$Z = G^{-1} X \\pm \\frac{Y}{G}$', 'Z=G−1X±YG'],
	['$a \\Rightarrow b \\Leftrightarrow c \\to d$', 'a⇒b⇔c→d'],
	['$a \\leq b \\geq c \\approx d \\equiv e$', 'a≤b≥c≈d≡e'],
	['$\\alpha\\beta\\theta\\pi\\sigma \\Omega \\Delta$', 'αβθπσΩΔ'],
	['$x_\\alpha^\\beta + \\frac{\\pi}{\\theta}$', 'xβα+πθ'],
	['$\\left( \\frac{a}{b} \\right) \\left\\{ \\frac{a}{b} \\right\\}$', '(ab){ab}'],
	['$\\sum_{i=1}^{n} \\int_0^1 \\sqrt{x}$', '∑ni=1∫10√x'],
];

for (const [tex, expected] of CASES) {
	const raw = await tex2svg(
		`\\begin{document}\n\\begin{tikzpicture}\n\\node at (0,0) {${tex}};\n\\end{tikzpicture}\n\\end{document}`,
		{ showConsole: false },
	);
	const fixed = finalizeTikzJaxSvg(raw);
	const text = [...fixed.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map(m => m[1]).join('');
	assert.equal(text, expected, `${tex}\n  got: ${JSON.stringify(text)}`);

	// No TeX font name may survive: the reader has none of them installed.
	const leftover = [...fixed.matchAll(/font-family="([^"]+)"/g)]
		.map(m => m[1])
		.filter(family => /^(?:cm|lm)[a-z]+\d*$/.test(family));
	assert.deepEqual(leftover, [], `${tex}: raw TeX fonts left in the SVG`);
}

console.log(`tikzjax-glyphs: ${CASES.length} formulas rendered and repaired OK`);

/* ----------------------------- Hebrew through the real engine ------------- */

{
	const source = '\\begin{tikzpicture}\n'
		+ '\\draw (0,0) -- (4,0);\n'
		+ '\\node at (2,1) {\\he{\u05db\u05d0\u05df \u05de\u05ea\u05e7\u05d9\u05d9\u05dd:}};\n'
		+ '\\end{tikzpicture}';
	const normalized = norm.normalizeForTikzJax(source, '');
	const raw = await tex2svg(normalized.renderTex, {
		showConsole: false,
		texPackages: normalized.texPackages,
		tikzLibraries: normalized.tikzLibraries,
		addToPreamble: normalized.addToPreamble || undefined,
	});
	const svg = finalizeTikzJaxSvg(raw, source, normalized.rtlRuns);

	const run = svg.match(/<text\b([^>]*data-luatikz-rtl="0"[^>]*)>([^<]*)<\/text>/);
	assert.ok(run, 'the placeholder must reach the finished SVG');
	assert.equal(run[2], '\u05db\u05d0\u05df \u05de\u05ea\u05e7\u05d9\u05d9\u05dd:',
		'and carry the original Hebrew');
	assert.ok(/direction="rtl"/.test(run[1]), run[1]);
	assert.ok(/font-size="[\d.]+"/.test(run[1]), 'sized from the TeX font, not guessed');
	// Positioned by TeX via {?x}/{?y}, which the converter substitutes.
	assert.ok(!run[1].includes('{?x}'), 'the position placeholders are resolved');
	assert.ok(/\bx="(-?[\d.]+)"/.test(run[1]), run[1]);

	// The reserved box has to make the picture wider than the bare rule.
	const width = Number.parseFloat(svg.match(/<svg[^>]*width="([\d.]+)"/)[1]);
	assert.ok(width > 113, `picture width ${width} suggests the box was not reserved`);
}

console.log('tikzjax-glyphs: Hebrew drawn into the SVG OK');
