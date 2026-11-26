# Pattern Lab

Abstract reasoning trainer with a puzzle generator, uniqueness validator and step-by-step explainer. It covers five formats: 3×3 matrices, next-in-series, odd one out, Set A/B and diagrammatic operators. Difficulty runs from 1 to 10.

## Quick start
```bash
npm run build      # → dist/index.html
npm test           # validity suite
npm run dev        # serve locally on :3000
npx vercel --prod  # deploy
```
No dependencies are needed; Node 18+ only.

## Working with Claude Code
Open this folder and run `claude`. `CLAUDE.md` explains the architecture, the invariants that guarantee one correct answer per puzzle, and suggested next features.

See `docs/RESEARCH.md` for the research basis.
