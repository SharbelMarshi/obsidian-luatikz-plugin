# Live preview

Command palette → **Toggle inline live preview**. A floating preview updates while the cursor is inside a `tikz` block. The preview works on mobile and tablets too (rendered through TikZJax); hover-to-locate remains a desktop feature, and on any platform the preview's **Edit** button opens the visual editor described below.

The preview is read-only: clicking it never changes your note. Earlier releases inserted a `(x, y)` coordinate at the cursor on click (and silently appended a `;` to an unfinished `\draw` line to make room for it). The visual editor does all of that on the canvas now, with real objects you can drag afterwards, so the click-to-pick shortcut was removed rather than kept as a second, weaker way to do the same thing.

To close an orthogonal shape (rectangle, L-shape, …) without nudging the last corner by hand, type **`ccycle`** instead of `cycle`. LuaTikZ snaps the last point to the 90° closing corner and rewrites it to `cycle`:

```tikz
\draw (0.54,-3.09)--(7.00,-3.09)--(7.00,-0.96)--(2.04,-0.96)--ccycle ;
```

becomes `(0.54,-0.96)--cycle` on the last segment.

Move the pointer over a shape in the preview and the statement that drew it is highlighted in the editor. The mapping is derived from the explicit coordinates in your source (`--` chains, `rectangle`/`grid`, `circle`/`ellipse`, node anchors, `++` relative steps, picture-level `scale`); statements built from anything it cannot read — named nodes, polar coordinates, `foreach` bodies — are simply never highlighted rather than guessed at.

While you edit, the preview keeps the last good diagram visible so a half-finished `\draw` line does not blank the surface.
