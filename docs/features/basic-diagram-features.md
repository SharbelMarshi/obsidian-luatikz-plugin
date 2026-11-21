# Basic diagram features

## Background grid

Add a grid directive at the top of the block (stripped before render):

```tikz
% grid=1
\begin{tikzpicture}
...
\end{tikzpicture}
```

The number is the step in cm.

## Alignment

Place a diagram left, centered, or right in the note:

```tikz
% align=left
\begin{tikzpicture}
...
\end{tikzpicture}
```

Five stops are available — `left`, `left-center`, `center`, `right-center`, `right`. The two quarter positions put the diagram a quarter of the way in, which is what a figure beside running prose usually wants: hard left reads as detached, dead centre wastes the margin. A diagram too wide to fit falls back to the full column rather than overflowing.

Centered is the default. Settings → **Default alignment** changes it for the whole vault, and the visual editor's **Picture** panel writes this directive for you.

## Horizontal nudge

Alignment puts the diagram in one of five places; `% offset-x=` moves it from
there, so "centered, three em to the left" does not mean giving up centering:

```tikz
% align=center
% offset-x=-3
\begin{tikzpicture}
...
\end{tikzpicture}
```

A bare number is em, so the nudge scales with the note's font size; CSS
lengths (`-40px`, `2cm`) work too, and `0` removes the nudge. The visual
editor's **Picture** panel exposes it as **Nudge X (em)**. As with `width`,
the `%` is required — `x=-3` on a line of its own is a TikZ unit-vector
option, not a directive.

## Rendered width

TikZ sizes a picture in absolute LaTeX units, which says nothing about how wide it should be in your note. The `% width=` directive scales the finished diagram to the reading column:

```tikz
% width=100%
\begin{tikzpicture}
...
\end{tikzpicture}
```

Percentages (`100%`, `80%`, or a bare `80`, which means `80%`) and CSS lengths (`420px`, `12cm`, `30em`) are accepted; `auto` keeps the diagram's natural size. The visual editor's **Picture** panel has a **Width in note** preset list that writes this directive, and a width you typed by hand stays in the list rather than snapping to the nearest preset. Settings → **Default width** applies one value vault-wide, and a block's own directive always wins. Unlike `align` and `grid`, the `%` is required here — `width=8cm` on a line of its own is ordinary TikZ (a pgfplots option list spread over several lines) and is left alone.

## RTL labels

Use `\he{...}` and `\ar{...}` for RTL text in labels. LuaLaTeX shapes the text properly; TikZJax substitutes a basic fallback.

```tikz
\begin{tikzpicture}
\Text(0,0,LTR text)
\Text(0,-1,\he{טקסט})
\Text(0,-2,\ar{نص})
\end{tikzpicture}
```

## Built-in helpers

Short macros for quick diagrams: `\Circle`, `\Arrow`, `\Rect`, `\TextRTL`, `\ResistorRow`, logic gates (`\ANDgate`, `\NOTgate`, …), wires, and basic circuit symbols. Autocomplete inside `tikz` blocks suggests TikZ commands, snippets, node anchors, and relative coordinates.

