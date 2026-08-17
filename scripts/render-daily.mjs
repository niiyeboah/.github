/**
 * Render today's prnt.design pattern as a README banner.
 *
 * The pattern comes from prnt.design's own public render route, which draws it
 * with the same code the site and the prints use. That is the whole reason this
 * script is short: nothing here reimplements or vendors the generator, so the
 * banner cannot drift from the site as the generator changes.
 *
 *   GET https://api.prnt.design/render/samai.png?seed=YYYY-MM-DD&w=&h=&scale=&dpi=
 *
 * Do NOT swap this for a local render of the pattern. Two earlier attempts were
 * wrong in ways that looked fine until compared against the site side by side:
 * mintPattern from @prnt/pattern-graph evaluates a different (DSL field graph)
 * renderer and produces a different pattern AND palette for the same date, and
 * building @prnt/pattern-core to call renderSamaiCanvas directly needs a browser
 * surface the package now asserts for. The route is the supported path.
 *
 * tileWidth is not a query parameter; the route derives it as
 * round(45 * scale * dpi/150) (tileWidthForScale in @prnt/store-schema). scale=5
 * with dpi=133 lands on a 200px tile, which tiles the 1200x400 banner 6 across
 * and 2 down. The default scale=10 resolves to a 450px tile, which crops to
 * under three repeats and reads as a random window rather than a weave.
 *
 * Writes:
 *   pattern.svg        the banner, with the date stamped on it
 *   README.md          repo landing page
 *   profile/README.md  github.com/niiyeboah profile page
 *
 * Both READMEs point at an absolute raw URL carrying a `?v=<date>` cache-buster.
 * Without it GitHub's camo proxy keys its cache on the URL alone and keeps
 * serving yesterday's bytes from the unchanged `pattern.svg` path.
 */

import { writeFile, mkdir } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Pacific: the pattern turns over at local midnight, not UTC's. */
const TIMEZONE = process.env.PATTERN_TZ ?? "America/Los_Angeles";

const RAW_BASE = "https://raw.githubusercontent.com/niiyeboah/.github/main";
const SITE = "https://prnt.design";
const RENDER_API = "https://api.prnt.design/render/samai.png";

const WIDTH = 1200;
const HEIGHT = 400;
const BAR = 76;
/** Resolves to a 200px tile. See the header note on tileWidthForScale. */
const SCALE = 5;
const DPI = 133;

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
 * Fetch the day's pattern. Throws rather than falling back to a placeholder: a
 * failed run leaves yesterday's committed banner in place, which is a stale date
 * for a few hours, while a committed placeholder would be a visibly broken
 * profile until someone noticed.
 */
async function fetchPattern(iso) {
  const url = `${RENDER_API}?seed=${iso}&w=${WIDTH}&h=${HEIGHT}&scale=${SCALE}&dpi=${DPI}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`render-daily: ${url} returned ${response.status} ${response.statusText}`);
  }
  const type = response.headers.get("content-type") ?? "";
  if (!type.startsWith("image/png")) {
    throw new Error(`render-daily: expected image/png from the render route, got "${type}"`);
  }
  return Buffer.from(await response.arrayBuffer());
}

/**
 * Wrap the raster in an SVG and stamp the date across the bottom.
 *
 * The PNG is inlined as a data URI because an SVG loaded through an <img> tag,
 * which is how GitHub embeds it, cannot fetch external resources. The date stays
 * vector text so it renders with the viewer's own monospace font.
 *
 * The bar is an opaque scrim rather than a fill keyed to the pattern's own
 * colours: the generator draws a new palette every day, so anything
 * colour-matched eventually lands unreadable.
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
const png = await fetchPattern(iso);
const body = readme(iso);

await writeFile(join(REPO_ROOT, "pattern.svg"), composeBanner(png, iso));
await writeFile(join(REPO_ROOT, "README.md"), body);
await mkdir(join(REPO_ROOT, "profile"), { recursive: true });
await writeFile(join(REPO_ROOT, "profile/README.md"), body);

console.log(`rendered ${iso}  png: ${png.length}b`);
