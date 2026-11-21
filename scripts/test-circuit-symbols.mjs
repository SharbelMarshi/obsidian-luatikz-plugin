/**
 * Circuit component wireframes, against the real src module.
 *
 * The canvas glyphs are approximations of circuitikz bodies, so what matters
 * is that the right bipole names map to the right body shape — a dependent
 * source must be a rhombus, not the circle its independent cousin gets — and
 * that the resistor zigzag stays inside the component zone instead of
 * spiking past the leads.
 */
import assert from 'node:assert/strict';
import { loadSrcModules } from './loadSrc.mjs';

const { geometry, icons } = await loadSrcModules(
	{ geometry: 'src/visual/sceneGeometry.ts', icons: 'src/visual/icons.ts' },
	{ external: ['@codemirror/state', '@codemirror/view'] },
);
const { circuitBipoleName, toSegmentPrimitives } = geometry;

const A = { x: 0, y: 0 };
const B = { x: 2, y: 0 };

const kinds = name => {
	const counts = {};
	for (const primitive of toSegmentPrimitives(A, B, name)) {
		counts[primitive.kind] = (counts[primitive.kind] ?? 0) + 1;
	}
	return counts;
};

const marks = name => toSegmentPrimitives(A, B, name)
	.filter(primitive => primitive.kind === 'nodeMark')
	.map(primitive => primitive.text);

/* ------------------------------------------- dependent (controlled) sources */

for (const name of [
	'american controlled voltage source',
	'controlled voltage source',
	'cV',
	'cvsourceAM',
]) {
	assert.equal(circuitBipoleName(name), name, `${name} must be a recognized bipole`);
	const counts = kinds(name);
	assert.equal(counts.circle, undefined, `${name} is a rhombus, never a circle`);
	assert.deepEqual(marks(name), ['+', '−'], `${name} carries the +/- signs`);
	// 2 leads + 4 rhombus edges.
	assert.equal(counts.segment, 6, `${name} draws a closed four-sided body`);
}

for (const name of ['american controlled current source', 'controlled current source', 'cI', 'cisourceAM']) {
	assert.equal(circuitBipoleName(name), name);
	const counts = kinds(name);
	assert.equal(counts.circle, undefined, `${name} is a rhombus, never a circle`);
	assert.deepEqual(marks(name), [], `${name} carries an arrow, not signs`);
	// 2 leads + 4 rhombus edges + 3 arrow strokes.
	assert.equal(counts.segment, 9);
}

{
	const counts = kinds('empty controlled source');
	assert.equal(counts.segment, 6, 'the blank dependent source is just the rhombus');
	assert.deepEqual(marks('empty controlled source'), []);
}

// Independent sources keep their circles — the distinction is the whole point.
assert.equal(kinds('american voltage source').circle, 1);
assert.equal(kinds('american current source').circle, 1);

// A name circuitikz does not define must not be smuggled into `to[...]`.
assert.equal(circuitBipoleName('dependent voltage source'), null);

/* ------------------------------------------------------- resistor zigzag */

{
	const primitives = toSegmentPrimitives(A, B, 'R');
	const segments = primitives.filter(primitive => primitive.kind === 'segment');
	// 2 leads + 2 flats into the zigzag + 8 strokes over its 7 teeth.
	assert.equal(segments.length, 12, 'seven-tooth zigzag');

	const amplitude = Math.max(...segments.map(segment =>
		Math.max(Math.abs(segment.a.y), Math.abs(segment.b.y))));
	// Each revision has had to get shorter: 0.18 cm, then 0.11, now ~0.063.
	assert.ok(amplitude <= 0.07, `zigzag amplitude ${amplitude} must stay subtle`);

	// …and the teeth closer together, which is what adding the seventh does.
	const pitch = Math.max(...segments
		.filter(segment => segment.a.y !== segment.b.y)
		.map(segment => Math.abs(segment.b.x - segment.a.x)));
	assert.ok(pitch < 0.08 && pitch > 0.03, `tooth pitch ${pitch}`);

	// The body never reaches past the terminals it sits between.
	const xs = segments.flatMap(segment => [segment.a.x, segment.b.x]);
	assert.ok(Math.min(...xs) >= A.x - 1e-9 && Math.max(...xs) <= B.x + 1e-9);

	// Both leads are still drawn, so the component connects to the wire.
	assert.ok(segments.some(segment => segment.a.x === A.x && segment.a.y === A.y));
	assert.ok(segments.some(segment => segment.b.x === B.x && segment.b.y === B.y));
}

/* ------------------------------------------------------------- toolbar icons */

for (const name of ['c-dep-voltage', 'c-dep-current', 'c-dep-empty', 'c-resistor', 'picture']) {
	assert.ok(icons.EDITOR_ICONS[name]?.length, `${name} icon must exist`);
}

{
	// The resistor icon and the Circuit menu button draw the same zigzag.
	const resistor = icons.EDITOR_ICONS['c-resistor'][0].d;
	assert.equal(icons.EDITOR_ICONS.circuit[0].d, resistor);

	// Walk the path (M/h/l/L only) and measure how far it swings off the
	// 24-unit box's centre line. The old four-tooth icon reached 7..17.
	let x = 0;
	let y = 0;
	const ys = [];
	const numbers = command => [...command.matchAll(/-?\d+(?:\.\d+)?/g)].map(Number);
	for (const [, op, args] of resistor.matchAll(/([MhlL])([^MhlL]*)/g)) {
		const values = numbers(args);
		if (op === 'M' || op === 'L') {
			for (let i = 0; i + 1 < values.length; i += 2) {
				x = values[i];
				y = values[i + 1];
				ys.push(y);
			}
		} else if (op === 'h') {
			x += values[0];
		} else {
			for (let i = 0; i + 1 < values.length; i += 2) {
				x += values[i];
				y += values[i + 1];
				ys.push(y);
			}
		}
	}
	const swing = Math.max(...ys.map(value => Math.abs(value - 12)));
	assert.ok(swing <= 2.5, `icon zigzag swings ${swing} units off centre — too tall`);
	assert.ok(swing >= 1.5, 'the zigzag must still read as a zigzag');
	assert.ok(Math.abs(x - 23) < 1e-6, `icon path ends at x=${x}, expected the 23-unit lead`);
}

console.log('circuit-symbols: dependent sources + resistor zigzag OK');
