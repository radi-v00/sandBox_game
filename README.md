# Shelf World

A web app that models sand / water / concrete boxes on a shelf grid, with two
gate actions (A: top-down, B: side) and a Uniform-Cost Search solver.

## Run

    npm install
    npm test
    npm run build
    npm run dev

## Rules (see `src/rules/assumptions.ts`)

- A: top-down gate. Box (row, col) flushes into (row+1, col); the last row
  flushes into the container.
- B: side gate to the right. Moves at most half of a box (rounded down to
  0.5 steps), limited by free space in the target.
- Cost: A = 1 + 4*(s + s'), B = 1.
- Concrete is permanent, blocks its box, and never blocks a shelf return.
- Mode B only: sand + water contact creates concrete (+10 penalty per box).

## Credits

This is the assembled project scaffold. Some test files are placeholders
because their original contents were not included in the source.
