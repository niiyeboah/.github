/**
 * Render today's Samai pattern as a README banner.
 *
 * The generator lives in the private prnt-design/monorepo. The workflow checks it
 * out beside this repo and builds @prnt/pattern-graph; only the rendered SVG is
 * committed here, so the algorithm stays private.
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

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Where the built generator lives. The workflow checks the monorepo out to ./.monorepo. */
const PATTERN_GRAPH =
  process.env.PATTERN_GRAPH_DIST ??
  join(REPO_ROOT, ".monorepo/packages/pattern-graph/dist/index.js");

/** Pacific — the pattern turns over at local midnight, not UTC's. */
const TIMEZONE = process.env.PATTERN_TZ ?? "America/Los_Angeles";

const RAW_BASE = "https://raw.githubusercontent.com/niiyeboah/.github/main";
const SITE = "https://prnt.design";

const WIDTH = 1200;
const HEIGHT = 400;
const BAR = 76;

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
 * Nest the minted pattern inside a banner and stamp the date across the bottom.
 *
 * The bar is an opaque scrim rather than a ground-matched fill: Samai picks a new
 * palette every day, so anything keyed to today's colours eventually lands
 * unreadable. Black-on-any-palette always reads.
 */
function composeBanner(patternSvg, isoDate) {
  // Strip the minted SVG's own wrapper so it can nest with its own viewBox.
  const inner = patternSvg
    .replace(/^<svg[^>]*>/, "")
    .replace(/<\/svg>$/, "");

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" role="img" aria-label="prnt.design pattern for ${isoDate}">`,
    `<svg x="0" y="0" width="${WIDTH}" height="${HEIGHT}" viewBox="0 0 ${WIDTH} ${HEIGHT}" preserveAspectRatio="xMidYMid slice">`,
    inner,
    `</svg>`,
    `<rect x="0" y="${HEIGHT - BAR}" width="${WIDTH}" height="${BAR}" fill="#000" fill-opacity="0.78" />`,
    `<text x="40" y="${HEIGHT - BAR / 2}" fill="#fff" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="32" font-weight="600" letter-spacing="2" dominant-baseline="central">${isoDate}</text>`,
    `<text x="${WIDTH - 40}" y="${HEIGHT - BAR / 2}" fill="#fff" fill-opacity="0.7" font-family="ui-monospace, SFMono-Regular, Menlo, monospace" font-size="24" text-anchor="end" dominant-baseline="central">prnt.design</text>`,
    `</svg>`,
  ].join("");
}

function readme(isoDate) {
  const image = `${RAW_BASE}/pattern.svg?v=${isoDate}`;
  return `<p align="center">
  <a href="${SITE}">
    <img src="${image}" alt="prnt.design pattern for ${isoDate}" width="880">
  </a>
</p>

<p align="center">
  <a href="${SITE}">prnt.design</a> generates a new pattern every day, seeded by the date.
</p>
`;
}

const isoDate = todayIso();

const { createSamaiGraphDefinition, mintPattern } = await import(PATTERN_GRAPH);
const artifact = mintPattern(createSamaiGraphDefinition(), {
  seed: isoDate,
  dimensions: { width: WIDTH, height: HEIGHT },
});

const body = readme(isoDate);

await writeFile(join(REPO_ROOT, "pattern.svg"), composeBanner(artifact.svg, isoDate));
await writeFile(join(REPO_ROOT, "README.md"), body);
await mkdir(join(REPO_ROOT, "profile"), { recursive: true });
await writeFile(join(REPO_ROOT, "profile/README.md"), body);

console.log(`rendered ${isoDate} (escalated seed ${artifact.escalatedSeed})`);
