# Flat streaming grass laboratory

The previous validated version is retained on GitHub branch
`backup/grass-before-streaming-2026-10-04` (f90d3f9bb142ba53853a653d71778124e5fc5fe1).
The laboratory's **Monde étendu** toggle switches back to the finite reference field.
The validated streaming lab is also retained on branch
`backup/grass-streaming-validated-2026-10-04` (2343b9c1060c88cb577ad6b0d77169005c0b18f2).
The main outdoor world now uses the same streaming engine through an outdoor
surface adapter, with density ×5 and volume tufts disabled.

## Budget and appearance

- Deterministic 8 m cells, 31 × 31 reusable slots. Global cell coordinates stay in
  JavaScript doubles; each blade stores a cell-local Float32 position.
- Full density within a player-centred 80 × 80 m square, halving every 10 m,
  existing coverage fade to zero by 100 m. Original card shape/texture/colours;
  volume tufts off by default.
- Prefetch 120 m along each axis; fill nearest cells first, at most six cells and
  approximately 3 ms of generation work per frame (a cell is indivisible).
- Recycle only retired slots outside the visible range. Keep initial load and
  deliberate long-distance jumps covered until the surrounding ring is ready.
- Existing FPS overlay retained; settings show loaded slots, pending work and
  CPU placement-buffer size (not total browser/GPU memory).
- At ×5: 6,305,121 available blade placements, about 96 MiB CPU placement data,
  independent of overall map extent. GPU copies and scene assets cost extra.

## Coordinates

The optional laboratory `worldOriginRef` on Player rebases at 128 m, before
physics/grass frames. It shifts the body, visual, camera and smoothing target,
maintains velocities and adjusts the local map limits. Game usage leaves this
prop null. Shader positions remain local; blade variation and meadow noise
remain stable across origin changes. The procedural meadow hash wraps over a
long period to keep arithmetic precise.

The largest preset is a **flat square** 22,584 km across, approximately the
Earth's 510 million km² total surface. It is a coordinate/streaming test,
not a globe, terrain dataset or simulation of an entire planet.

## Validation

Tests cover stable buffer ownership, regeneration identity after long-distance
travel, distinct cell patterns, map bounds, work limits and recycling beyond
the visible LOD range. A ×5 CPU run covers a kilometre of diagonal travel.
Build checked. Mobile FPS, GPU memory, visual seams and controller smoothness
still need validation on the owner's device; no browser QA available here.

## Outdoor integration

`OutdoorStreamedGrass` replaces the old complete-field loader in the private
world. The adapter samples the actual rendered terrain triangles and retains
house exclusions, ordered painted-path masks, road fades and graveyard masks.
Each recycled cell updates both its placement/rank buffers and its vertical
culling bounds. Ball/player interactions and biome shader uniforms are retained.
Generation pauses indoors, resumes around the current player on return, and
never waits for all 376 × 376 m of grass to be created. A small preparation
notice remains while the initial surrounding ring fills.

Outdoor tests inspect over 73,000 blade samples against actual terrain and
masks, then travel to another region while checking fixed buffer ownership.
The road-distance calculation uses squared distances and one final square root;
a reference-equivalence test confirms unchanged results.
