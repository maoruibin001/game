"""Compare the same patch of grass across the postal-gate shadow captures."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def camera_axes(camera):
    forward = np.array(camera["forward"])
    forward /= np.linalg.norm(forward)
    right = np.cross(forward, camera["up"])
    right /= np.linalg.norm(right)
    up = np.cross(right, forward)
    return np.array(camera["position"]), forward, right, up


def green_channel(directory, name):
    with Image.open(directory / f"shadow-{name}.png") as screenshot:
        if screenshot.size != (1920, 1080):
            raise ValueError("The postal gate patch is defined for 1920×1080 captures.")
        return np.asarray(screenshot.convert("RGB"), dtype=float)[:, :, 1]


def compare(directory):
    report = json.loads((directory / "acceptance.json").read_text())
    samples = {sample["name"]: sample for sample in report["shadowSamples"]}
    reference = samples["live-a"]["camera"]
    original = green_channel(directory, "live-a")
    height, width = original.shape
    position, forward, right, up = camera_axes(reference)
    scale_y = np.tan(reference["verticalFovRadians"] / 2)
    scale_x = scale_y * reference["aspect"]

    # The rectangle covers one gate-shadow edge over level grass. Exclude the
    # traveller, UI, road, and the fully lit and shaded plateaus.
    if samples["live-a"]["clock"]["minute"] < 810:
        # The 13:00 light casts the gate shadow onto the other side of the road.
        rows, columns = np.mgrid[773:911, 1450:1740]
        lower, upper = 112, 153
    else:
        rows, columns = np.mgrid[634:814, 125:660]
        lower, upper = 94, 134
    edge_values = original[rows, columns]
    edge = (edge_values >= lower) & (edge_values <= upper)
    rows, columns, edge_values = rows[edge], columns[edge], edge_values[edge]
    if edge_values.size < 1000:
        raise ValueError("The gate shadow does not cover the reference patch.")
    image_x = (2 * (columns + .5) / width - 1) * scale_x
    image_y = (1 - 2 * (rows + .5) / height) * scale_y
    rays = forward + image_x[:, None] * right + image_y[:, None] * up
    world = position + rays * ((14 - position[1]) / rays[:, 1])[:, None]

    measurements = {}
    for name in ("live-b", "live-c", "turn-a", "turn-b", "turn-c", "return"):
        if name not in samples:
            continue
        camera = samples[name]["camera"]
        position, forward, right, up = camera_axes(camera)
        relative = world - position
        depth = relative @ forward
        scale_y = np.tan(camera["verticalFovRadians"] / 2)
        scale_x = scale_y * camera["aspect"]
        x = (.5 + (relative @ right) / (2 * depth * scale_x)) * width - .5
        y = (.5 - (relative @ up) / (2 * depth * scale_y)) * height - .5
        x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
        visible = (depth > 0) & (x0 >= 0) & (x0 < width - 1) & (y0 >= 0) & (y0 < height - 1)
        if visible.sum() < 1000:
            raise ValueError(f"{name} lost the reference patch.")
        x0, y0 = x0[visible], y0[visible]
        dx, dy = x[visible] - x0, y[visible] - y0
        image = green_channel(directory, name)
        above = (1 - dx) * image[y0, x0] + dx * image[y0, x0 + 1]
        below = (1 - dx) * image[y0 + 1, x0] + dx * image[y0 + 1, x0 + 1]
        aligned = (1 - dy) * above + dy * below
        difference = np.abs(aligned - edge_values[visible])
        measurements[name] = {
            "pixels": int(visible.sum()),
            "mean": round(float(difference.mean()), 3),
            "p95": round(float(np.percentile(difference, 95)), 3),
        }
    return measurements


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capture", nargs="+", type=Path)
    parser.add_argument("--check", action="store_true", help="Enforce the opening-shadow regression limits.")
    options = parser.parse_args()
    results = {path.name: compare(path) for path in options.capture}
    print(json.dumps(results, ensure_ascii=False, indent=2))
    if options.check:
        limits = {"live-b": .35, "live-c": .35, "turn-a": 1, "turn-b": 1, "turn-c": 1, "return": 1}
        for name, measurements in results.items():
            for sample, limit in limits.items():
                if sample not in measurements or measurements[sample]["mean"] > limit:
                    parser.exit(1, f"{name}: {sample} exceeded a mean brightness change of {limit}.\n")


if __name__ == "__main__":
    main()
