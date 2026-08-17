/**
 * Render today's prnt.design pattern as a README banner.
 *
 * The pattern comes from prnt.design's own public render route, which draws it
 * with the same code the site and the prints use. Nothing here reimplements or
 * vendors the generator, so the banner cannot drift from the site as the
 * generator changes.
 *
 *   GET https://api.prnt.design/render/samai.png?seed=YYYY-MM-DD&w=&h=&scale=&dpi=
 *
 * Do NOT render the pattern locally instead. Two earlier attempts were wrong in
 * ways that looked right until compared against the site: mintPattern from
 * @prnt/pattern-graph evaluates a different (DSL field graph) renderer and gives
 * a different pattern AND palette for the same date, and building
 * @prnt/pattern-core to call renderSamaiCanvas needs a browser surface the
 * package now asserts for. The route is the supported path.
 *
 * ## Why this writes a PNG and not an SVG
 *
 * The obvious shape is an SVG wrapper: the pattern in an <image> tag, the date as
 * vector <text>. It cannot work from this repo. raw.githubusercontent.com refuses
 * to serve an SVG containing an embedded `data:` URI as an image, handing back
 * `text/plain` instead of `image/svg+xml`, so the <img> in the README fails to
 * load and the profile shows an empty box. A vector-only SVG is served correctly,
 * but the pattern is only available as a raster, so the date has to be burned into
 * the raster too. Confirmed against the live host, not assumed: the pure-vector
 * banner at commit 976b743 still returns image/svg+xml, the data-URI one does not.
 *
 * ## tileWidth
 *
 * Not a query parameter; the route derives it as round(45 * scale * dpi/150),
 * `tileWidthForScale` in @prnt/store-schema. scale=5 with dpi=133 lands on a 200px
 * tile, six repeats across the 1200x400 banner. The default scale=10 resolves to a
 * 450px tile, under three repeats, which reads as a random window rather than a
 * weave.
 *
 * Writes:
 *   pattern.png        the banner, with the date stamped on it
 *   README.md          repo landing page
 *   profile/README.md  github.com/niiyeboah profile page
 *
 * Both READMEs get a `?v=<date>` on the image URL. The bytes change daily under a
 * fixed path, and a consumer that keys its cache on the URL alone would otherwise
 * keep serving the previous day's banner.
 */

import { createCanvas, loadImage, GlobalFonts } from "@napi-rs/canvas";
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
/** Resolves to a 200px tile. See the tileWidth note above. */
const SCALE = 5;
const DPI = 133;

/**
 * @napi-rs/canvas loads system fonts, so this is a stack rather than a bundled
 * file: DejaVu and Liberation are what the ubuntu runner has, Menlo is macOS for
 * local runs. Text rendered with no matching family measures zero and would
 * commit a banner with no date on it, so renderBanner asserts on that.
 */
const MONO = '"DejaVu Sans Mono", "Liberation Mono", "Menlo", monospace';

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
 * Fetch the day's pattern. Throws rather than substituting a placeholder: a failed
 * run leaves yesterday's committed banner in place, a stale date for a few hours,
 * where a placeholder would be a visibly broken profile until someone noticed.
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
 * Composite the pattern with the date bar.
 *
 * The bar is an opaque scrim rather than a fill keyed to the pattern's own
 * colours: the generator draws a new palette every day, so anything
 * colour-matched eventually lands unreadable.
 */
async function renderBanner(patternPng, iso) {
  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  ctx.drawImage(await loadImage(patternPng), 0, 0, WIDTH, HEIGHT);

  ctx.fillStyle = "rgba(0, 0, 0, 0.78)";
  ctx.fillRect(0, HEIGHT - BAR, WIDTH, BAR);

  ctx.textBaseline = "middle";
  const midline = HEIGHT - BAR / 2;

  ctx.font = `600 32px ${MONO}`;
  if (ctx.measureText(iso).width === 0) {
    throw new Error(
      `render-daily: no font matched ${MONO} (${GlobalFonts.families.length} families visible), ` +
        `the date would render blank`
    );
  }
  ctx.fillStyle = "#ffffff";
  ctx.textAlign = "left";
  ctx.fillText(iso, 40, midline);

  ctx.font = `24px ${MONO}`;
  ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
  ctx.textAlign = "right";
  ctx.fillText("prnt.design", WIDTH - 40, midline);

  return canvas.toBuffer("image/png");
}

function readme(iso) {
  const image = `${RAW_BASE}/pattern.png?v=${iso}`;
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
const banner = await renderBanner(await fetchPattern(iso), iso);
const body = readme(iso);

await writeFile(join(REPO_ROOT, "pattern.png"), banner);
await writeFile(join(REPO_ROOT, "README.md"), body);
await mkdir(join(REPO_ROOT, "profile"), { recursive: true });
await writeFile(join(REPO_ROOT, "profile/README.md"), body);

console.log(`rendered ${iso}  banner: ${banner.length}b`);
