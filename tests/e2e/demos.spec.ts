import { expect, test } from "@playwright/test";
import { PNG } from "pngjs";

const ROUTES = ["dom", "canvas", "webgl", "webgpu"] as const;
const DEFAULT_POINT_COUNTS: Record<(typeof ROUTES)[number], string> = {
  dom: "1000",
  canvas: "100000",
  webgl: "100000",
  webgpu: "100000"
};

for (const route of ROUTES) {
  test(`/${route} mounts the benchmark UI`, async ({ page }) => {
    const pageErrors: string[] = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));

    await page.goto(`/${route}`);
    await expect(page.getByRole("heading", { name: "Web Rendering Lab" })).toBeVisible();
    await expect(page.getByTestId("stage")).toBeVisible();
    await expect(page.getByRole("link", { name: labelForRoute(route) })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("point-count")).toHaveValue(DEFAULT_POINT_COUNTS[route]);
    await expect(page.getByTestId("fps")).not.toHaveText("0", { timeout: 8_000 });

    expect(pageErrors).toEqual([]);
  });
}

test("root route opens DOM with the safe default", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/dom$/);
  await expect(page.getByRole("link", { name: "DOM" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("point-count")).toHaveValue("1000");
});

test("point count menu uses the standard benchmark intervals", async ({ page }) => {
  await page.goto("/webgl");

  await expectPointIntervals(page);
  await expect(page.locator("#point-count option[value='5000']")).toHaveCount(0);
  await expect(page.locator("#point-count option[value='25000']")).toHaveCount(0);
  await expect(page.locator("#point-count option[value='50000']")).toHaveCount(0);
  await expect(page.locator("#point-count option[value='250000']")).toHaveCount(0);
  await expect(page.locator("#point-count option[value='500000']")).toHaveCount(0);
});

test("DOM opens at 1k while sharing the same intervals", async ({ page }) => {
  await page.goto("/dom");

  await expect(page.getByTestId("point-count")).toHaveValue("1000");
  await expectPointIntervals(page);
});

test("switching from an accelerated renderer to DOM clamps before mounting DOM", async ({ page }) => {
  await page.goto("/canvas");
  await expect(page.getByTestId("point-count")).toHaveValue("100000");

  await page.getByRole("link", { name: "DOM" }).click();
  await expect(page).toHaveURL(/\/dom$/);
  await expect(page.getByRole("link", { name: "DOM" })).toHaveAttribute("aria-current", "page");
  await expect(page.getByTestId("point-count")).toHaveValue("1000");
});

test("canvas renderer produces nonblank pixels", async ({ page }) => {
  await page.goto("/canvas");
  await expect(page.locator("canvas[data-renderer-canvas='canvas']")).toBeVisible();

  const image = await page.getByTestId("stage").screenshot();
  expect(hasNonBlankPixels(image)).toBe(true);
});

test("webgl renderer produces nonblank pixels when WebGL2 is available", async ({ page }) => {
  await page.goto("/webgl");
  const hasWebGl = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2"));
  });

  test.skip(!hasWebGl, "WebGL2 is not available in this browser");
  await expect(page.locator("canvas[data-renderer-canvas='webgl']")).toBeVisible();

  const image = await page.getByTestId("stage").screenshot();
  expect(hasNonBlankPixels(image)).toBe(true);
});

test("webgpu renderer renders or shows the compatibility message", async ({ page }) => {
  await page.goto("/webgpu");
  const hasWebGpu = await page.evaluate(() => Boolean("gpu" in navigator));

  if (!hasWebGpu) {
    await expect(page.getByText(/WebGPU is not available/)).toBeVisible();
    return;
  }

  await expect(page.locator("canvas[data-renderer-canvas='webgpu']")).toBeVisible();
  const image = await page.getByTestId("stage").screenshot();
  expect(hasNonBlankPixels(image)).toBe(true);
});

function labelForRoute(route: (typeof ROUTES)[number]): string {
  switch (route) {
    case "dom":
      return "DOM";
    case "canvas":
      return "Canvas 2D";
    case "webgl":
      return "WebGL2";
    case "webgpu":
      return "WebGPU";
  }
}

async function expectPointIntervals(page: import("@playwright/test").Page): Promise<void> {
  const optionValues = await page.locator("#point-count option").evaluateAll((options) =>
    options.map((option) => (option as HTMLOptionElement).value)
  );
  expect(optionValues).toEqual(["1000", "10000", "100000", "1000000"]);
}

function hasNonBlankPixels(buffer: Buffer): boolean {
  const png = PNG.sync.read(buffer);
  let coloredPixels = 0;
  let transparentPixels = 0;

  for (let index = 0; index < png.data.length; index += 4) {
    const red = png.data[index];
    const green = png.data[index + 1];
    const blue = png.data[index + 2];
    const alpha = png.data[index + 3];

    if (alpha < 12) {
      transparentPixels += 1;
      continue;
    }

    if (Math.abs(red - green) > 8 || Math.abs(green - blue) > 8 || Math.abs(red - blue) > 8) {
      coloredPixels += 1;
    }

    if (coloredPixels > 150 && transparentPixels < png.width * png.height) {
      return true;
    }
  }

  return false;
}
