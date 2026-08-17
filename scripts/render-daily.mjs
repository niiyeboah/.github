/**
 * Render today's Samai pattern as a README banner.
 *
 * The generator lives in the private prnt-design/monorepo. The workflow checks it
 * out beside this repo and builds @prnt/pattern-core; only the rendered banner is
 * committed here, so the algorithm stays private.
 *
 * IMPORTANT: this must go through samaiGenerator.createModel + renderSamaiCanvas,
 * the same pair apps/pattern-explorer uses (see pattern-tile.tsx). The obvious
 * alternative, mintPattern from @prnt/pattern-graph, is a DIFFERENT renderer: it
 * evaluates the DSL field graph and produces another pattern and another palette
 * for the same date. samai-graph.ts says so outright ("the explorer/store render
 * Samai via samaiGenerator.createModel directly, not through this graph-generator
 * path"). Using it makes the banner disagree with prnt.design.
 *
 * The pattern is rasterized because renderSamaiCanvas is a Canvas2D routine whose
 * fabric texture is per-cell fillRect work: as SVG it would be tens of thousands
 * of rects. The date bar stays vector text in an SVG wrapper so it needs no font
 * installed on the runner.
 *
 * Writes:
 *   pattern.svg        the banner, with the date stamped on it
 *   README.md          repo landing page
 *   profile/README.md  github.com/niiyeboah profile page
 *
 * Both READMEs point at an absolute raw URL carrying a `?v=<date>` cache-buster.
 * Without it GitHub's camo proxy keys its cache on the URL alone and keeps serving
 * yesterday's bytes from the unchanged `pattern.svg` path.
 */

import { createCanvas } from "@napi-rs/canvas";
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Where the built generator lives. The workflow checks the monorepo out to ./.monorepo. */
const SAMAI_DIST =
  process.env.SAMAI_DIST ??
  join(REPO_ROOT, ".monorepo/packages/pattern-core/dist/generators/samai");

/** Pacific: the pattern turns over at local midnight, not UTC's. */
const TIMEZONE = process.env.PATTERN_TZ ?? "America/Los_Angeles";

const RAW_BASE = "https://raw.githubusercontent.com/niiyeboah/.github/main";
const SITE = "https://prnt.design";

const WIDTH = 1200;
const HEIGHT = 400;
const BAR = 76;
/** prnt.design's own default `scale` query param, so the motif comes out the same size. */
const SCALE = 10;

// renderSamaiCanvas reaches for document.createElement("canvas"). That is its only
// DOM touchpoint, so this shim is enough to run the real renderer headlessly.
globalThis.document = {
  createElement(tag) {
    if (tag !== "canvas") throw new Error(`render-daily: unexpected createElement(${tag})`);
    return createCanvas(1, 1);
  },
};

/** Today as "YYYY-MM-DD" in TIMEZONE. en-CA formats to ISO order natively. */
function todayIso() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

/**
 * Build the Date the PRNG seeds from. Built out of LOCAL calendar parts on
 * purpose: the generator reads local month/date/year, and `new Date("YYYY-MM-DD")`
 * parses as UTC midnight, which shifts the pattern by a day under a negative
 * offset.
 */
function seedDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) throw new Error(`render-daily: bad seed "${iso}"`);
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

/**
 * Render the pattern exactly as the explorer's SINGLE view does. The probe pass
 * and the multiplier are lifted from pattern-tile.tsx: the generator's repeat unit
 * is not a fixed size, so it has to be measured at a known tileWidth before the
 * real tileWidth can be solved for.
 */
async function renderPattern(iso) {
  const { samaiGenerator } = await import(`${SAMAI_DIST}/samai-generator.js`);
  const { renderSamaiCanvas } = await import(`${SAMAI_DIST}/samai-preview.js`);

  const date = seedDate(iso);
  const probe = samaiGenerator.createModel({
    date,
    dimensions: { width: 1, height: 1 },
    options: { ...samaiGenerator.createInitialOptions(), tileWidth: 100 },
  });
  const multiplier = Math.max(probe.patternNode.width, probe.patternNode.height) / 100;
  const tileWidth = Math.round((HEIGHT / multiplier) * (SCALE / 10));

  const model = samaiGenerator.createModel({
    date,
    dimensions: { width: WIDTH, height: HEIGHT },
    options: { ...samaiGenerator.createInitialOptions(), tileWidth },
  });

  return {
    png: renderSamaiCanvas(model).toBuffer("image/png"),
    palette: [...model.lightColors, ...model.darkColors].join(" "),
  };
}

/**
 * Wrap the raster in an SVG and stamp the date across the bottom.
 *
 * The bar is an opaque scrim rather than a fill keyed to the pattern's own
 * colours: Samai draws a new palette every day, so anything colour-matched
 * eventually lands unreadable.
 */
function composeBanner(png, iso) {
  const mono = "ui-monospace, SFMono-Regular, Menlo, monospace";
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="prnt.design pattern for ${iso}">`,
    `<image x="0" y="0" width="${WIDTH}" height="${HEIGHT}" href="data:image/png;base64,${png.toString("base64")}" />`,
    `<rect x="0" y="${HEIGHT - BAR}" width="${WIDTH}" height="${BAR}" fill="#000" fill-opacity="0.78" />`,
    `<text x="40" y="${HEIGHT - BAR / 2}" fill="#fff" font-family="${mono}" font-size="32" font-weight="600" letter-spacing="2" dominant-baseline="central">${iso}</text>`,
    `<text x="${WIDTH - 40}" y="${HEIGHT - BAR / 2}" fill="#fff" fill-opacity="0.7" font-family="${mono}" font-size="24" text-anchor="end" dominant-baseline="central">prnt.design</text>`,
    `</svg>`,
  ].join("");
}

function readme(iso) {
  const image = `${RAW_BASE}/pattern.svg?v=${iso}`;
  return `<p align="center">
  <a href="${SITE}">
    <img src="${image}" alt="prnt.design pattern for ${iso}" width="880">
  </a>
</p>

<p align="center">
  <a href="${SITE}">prnt.design</a> generates a new pattern every day, seeded by the date.
</p>
`;
}

const iso = todayIso();
const { png, palette } = await renderPattern(iso);
const body = readme(iso);

await writeFile(join(REPO_ROOT, "pattern.svg"), composeBanner(png, iso));
await writeFile(join(REPO_ROOT, "README.md"), body);
await mkdir(join(REPO_ROOT, "profile"), { recursive: true });
await writeFile(join(REPO_ROOT, "profile/README.md"), body);

console.log(`rendered ${iso}  palette: ${palette}  png: ${png.length}b`);
