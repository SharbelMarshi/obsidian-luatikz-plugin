# Renderers

**LuaLaTeX** runs your full TeX toolchain: extra packages, pgfplots, circuitikz, math mode, and RTL via polyglossia. The default preamble loads common TikZ libraries.

## Fonts and RTL

Fonts resolve through fallback chains guarded by `\IfFontExistsTF`, so a name that is not installed is skipped rather than aborting the compile:

| | Chain |
|---|---|
| Main | TeX Gyre Termes (metrically Times, ships with TeX Live/MiKTeX) |
| Hebrew | Noto Serif Hebrew → David CLM → Frank Ruehl CLM |
| Arabic | Noto Sans Arabic → Geeza Pro → Amiri |

Set your own name in **Settings → Fonts** to put it at the front of a chain. If a whole chain misses, nothing is declared for that script and the diagram still renders.

`polyglossia` and the Hebrew/Arabic font families load **only when the diagram uses them** — `\he{}`, `\ar{}`, `\texthebrew{}`, `\textarabic{}`, or Hebrew/Arabic characters — and per script, so a Hebrew diagram never pulls in the Arabic gloss. `\he` and `\ar` are always defined, falling back to plain text when the script is not loaded.

## Custom preamble

**Settings → Preamble → Custom preamble** replaces the generated preamble outright. **Load current preamble** materializes the managed one for editing; **Reset to default** returns to managed.

In custom mode fonts, polyglossia and `\he`/`\ar` are yours to define. The plugin still appends the coordinate-pick calibration block and `\begin{document}`, injects `\documentclass` and `\usepackage{tikz}` if your text omits them, and neutralizes a stray `\begin{document}`. Note that a custom preamble does not receive preamble improvements from later releases — leave it empty unless you need the control.

`\usepackage` and `\usetikzlibrary` lines you write inside a block are hoisted into that preamble. Since TikZ aborts the whole compile on a name it does not recognise, two cases are rewritten first: package names (`\usetikzlibrary{pgfplots}`, `{circuitikz}`, …) are dropped because the preamble already loads them, and PGFPlots-only libraries (`groupplots`, `polar`, `statistics`, …) are moved to `\usepgfplotslibrary`. The editor flags both so the rewrite is never a surprise.

**TikZJax** renders in-process with no shell. Good for standard TikZ and simple plots. Advanced pgfplots (e.g. interpolated 3D surfaces) and real RTL shaping need LuaLaTeX.

## TikZJax and math symbols

TikZJax's DVI→SVG converter writes each glyph as a raw TeX *font position* and
names the TeX font (`cmsy10`, `cmmi7`, `cmex10`) in `font-family`. Readers do
not have those fonts installed, so every glyph was shown through a fallback
font that means something else at that code point: `\Rightarrow` rendered as
`)`, `G^{-1}` as `G` with a raised `¡`, and whole fractions lost their symbols
because the script-size fonts were never repaired.

LuaTikZ now decodes those positions back to Unicode through the real TeX font
encodings — every size of every family, math symbols, math italic, text and
the extension font — resolves a `font-family` the SVG optimizer hoisted onto a
group, and points the result at a math-capable font stack with math variables
in italic. Delimiters taller than `\big4`, which TeX builds from stacked
extension pieces, are the one case still drawn from the raw font.

## Hebrew and Arabic on TikZJax

TikZJax ships a small TeX with the Computer Modern fonts and nothing else, so
no font in it can set a Hebrew or Arabic glyph. Earlier releases dealt with
that by deleting the text of every `\he{…}` and `\ar{…}`, which is why those
labels vanished from the diagram instead of rendering.

TeX does not have to draw them. Its DVI→SVG converter honours
`\special{dvisvgm:raw …}` and substitutes the current position, so LuaTikZ has
TeX reserve a box of the right width and emit an empty `<text>` element at its
centre; the plugin then fills that element with the real string, a font stack
the reader actually has, and `direction="rtl"`. The text never passes through
TeX at all, which also sidesteps its 8-bit input encoding.

Two bounded limitations, both reported on the block: the reserved width is
estimated from the characters rather than measured from a font, and the
emitted element carries no picture transform, so RTL labels inside a rotated
or scaled `tikzpicture` keep their upright position and size. Local LuaLaTeX
remains the engine for real shaping.
