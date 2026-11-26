# Pattern Lab — guide for Claude Code

(Renamed from Pattern Arcade on 2026-11-26 by the owner, to read less like a game; the repo keeps its old name.)

An abstract reasoning trainer for working professionals aged 18–65. It generates practice puzzles in the formats used by SHL, Korn Ferry/Talent Q, Saville, Aon (cut-e) and Criteria/Revelian, then explains them step by step. It is a learning tool, not a test.

## Commands
- `npm run build` — inlines `src/engine.js` into `src/app.html` → `dist/index.html` (one self-contained file, no dependencies).
- `npm test` — validity suite (node:test). Run after ANY change to `src/engine.js`. `PER_LEVEL=300 npm test` for a deeper run.
- `npm run dev` — build and serve `dist/` on http://localhost:3000.
- Deploy: `npx vercel --prod` (vercel.json runs the build and serves `dist/`).

## Layout
- `src/engine.js` — pure JS, no DOM. Works in Node (`require('./src/engine.js').ARC`) and the browser (`window.ARC`). Holds the generators, the uniqueness validators, the distractor builder and the explanation text.
- `src/app.html` — the UI: CSS, SVG rendering, Play / Lessons / About views, hash router. `/*ENGINE*/` marks where the engine gets inlined. Edit this file, never `dist/`.
- `tests/validity.test.js` — the guarantees below, as tests.
- `docs/RESEARCH.md` — research basis and the reasons behind the design choices.

## Non-negotiable invariants (keep them when editing)
1. **Exactly one correct answer.** Every generator brute-force checks its puzzle against a library of rule hypotheses and throws the puzzle away unless every consistent hypothesis predicts the same answer.
   - Matrix: `gridHyps` (constant row/col, progression row/col, distribution-of-three, sides progression, line logic OR/XOR/AND/SUB, line rotation).
   - Series: `seriesHyps` (constant, progression, cycles of 2 and 3, accelerating step, line rotation, line accumulation).
   - Odd one out: no predicate in `PRED_ALL` may single out a different figure, and no simpler-tier predicate may explain the same answer.
   - Set A/B: every pair of predicates that separates A from B must classify the test figure the same way.
   - Diagram: brute force over every operator assignment that fits the examples. The answer must be unique, and so must every symbol's meaning.
   **If you add a rule type, add its hypothesis to the matching library too.** Otherwise the validator can't see ambiguity the new rule creates.
2. **Every distractor breaks a named rule.** `optionNotes` explains each wrong option by the attributes that differ from the answer.
3. **No context-blind leak.** `buildOptions` places the answer at a uniformly random position in an option-typicality ranking, so "pick the most typical option" scores at chance. Keep that test green.
4. **Determinism.** Same `(type, level, seed, focus)` → same puzzle. Lessons rely on fixed seeds.

## Difficulty (1–10)
Set per generator: number of simultaneous rules (`[1,1,2,2,2,3,3,3,4,4]`), the rule pool unlocked by `minL`, option count, extra noise elements (dot, lines) from L6+, and predicate tier (`tierOf`) for odd-one-out and sets. Diagram: sequence length 3→4, operator tier, chained examples from L5.

## Design language
- Shell: **Greenwell's design language** (owner, 2026-11-26; it was a retro-arcade dark theme): the Maquette's porcelain
  studio, matte white card on a warm grey gradient, one cobalt accent (`--I`) with a warm ochre (`--O`), a sage (`--S`),
  slate (`--T`) and terracotta for a wrong answer (`--Z`). The old variable names are kept so the engine and lessons are
  untouched; the overrides sit in one block at the end of the stylesheet. Titles in Cormorant Garamond, the rest in the
  system sans; numbers in the sans (Cormorant's old-style figures read "1" as "I"). Rule colours for Learn mode are
  `COLORS` in `src/engine.js`, chosen to stay legible on the white canvas.
- Puzzle canvas: always black on white, like real tests. Colour appears on the puzzle only through Learn mode overlays or after Explain.
- Respect `prefers-reduced-motion`. Keep tap targets large; mobile-first, max width 760px.
- Grid and options are seen together, never a scroll apart. Matrix: grid left, options right (`.duo`), stacked under the grid when the stage is ≤600px wide. Answer pictures are the size of a grid cell or series frame (`--cell` on `.stage`, from a container query). Keep the stage's prompt, grid and options within a 720px-tall screen.

## Natural next steps
- Timed simulation mode that mirrors each provider's real format and time limits (table on the About view).
- Persistent progress (mastery per rule type) with localStorage, wrapped in try/catch.
- SHL-style interactive "build the answer" items (no options → no response elimination; see docs/RESEARCH.md).
- Adaptive difficulty (Korn Ferry and SHL tests are adaptive).
