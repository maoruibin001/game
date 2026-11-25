"""Measure brightness steps and reversals on the same world surface in the shadow clips."""
import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image


def camera_axes(camera):
    forward = np.asarray(camera["forward"], dtype=float)
    forward /= np.linalg.norm(forward)
    right = np.cross(forward, camera["up"])
    right /= np.linalg.norm(right)
    return np.asarray(camera["position"]), forward, right, np.cross(right, forward)


def sample_world(camera, rows, columns, axis, height, width, plane):
    position, forward, right, up = camera_axes(camera)
    scale = np.tan(camera["verticalFovRadians"] / 2)
    dx = ((columns + .5) * 2 / width - 1) * scale * camera["aspect"]
    dy = (1 - (rows + .5) * 2 / height) * scale
    rays = forward + dx[:, None] * right + dy[:, None] * up
    with np.errstate(divide="ignore", invalid="ignore"):
        distance = (plane - position[axis]) / rays[:, axis]
        return position + rays * distance[:, None], distance > 0


def sample_frame(camera, world, image):
    position, forward, right, up = camera_axes(camera)
    relative = world - position
    depth = relative @ forward
    scale = np.tan(camera["verticalFovRadians"] / 2)
    height, width = image.shape
    with np.errstate(divide="ignore", invalid="ignore"):
        x = (.5 + (relative @ right) / (2 * depth * scale * camera["aspect"])) * width - .5
        y = (.5 - (relative @ up) / (2 * depth * scale)) * height - .5
    visible = (depth > 0) & (x >= 0) & (x < width - 1) & (y >= 0) & (y < height - 1)
    values = np.full(len(world), np.nan)
    x, y = x[visible], y[visible]
    left, top = x.astype(int), y.astype(int)
    u, v = x - left, y - top
    above = (1 - u) * image[top, left] + u * image[top, left + 1]
    below = (1 - u) * image[top + 1, left] + u * image[top + 1, left + 1]
    values[visible] = (1 - v) * above + v * below
    return values


def green(directory, frame):
    with Image.open(directory / (frame["name"] + ".png")) as photo:
        return np.asarray(photo.convert("RGB"))[:, :, 1].astype(float)


def find_clip(directory, clip):
    report = json.loads((directory / "acceptance.json").read_text())
    matches = [entry for entry in report["shadow"] if entry["name"].startswith(clip)]
    if len(matches) != 1 or len(matches[0]["frames"]) < 3:
        raise ValueError(f"{directory}: no complete unique clip {clip}")
    return matches[0]


def analyze(directory, clip, rectangle, plane, reference=None):
    entry = find_clip(directory, clip)
    frames = entry["frames"]
    y0, y1, x0, x1 = rectangle
    rows, columns = np.mgrid[y0:y1:2, x0:x1:2]
    rows, columns = rows.ravel(), columns.ravel()
    image = green(directory, frames[0])
    if not (0 <= y0 < y1 <= image.shape[0] and 0 <= x0 < x1 <= image.shape[1]):
        raise ValueError("Region is outside the captured viewport")
    if plane:
        axis, height = plane.split("=")
        reference_frame = find_clip(reference, clip)["frames"][0] if reference else frames[0]
        world, valid = sample_world(reference_frame["camera"], rows, columns, "xyz".index(axis), *image.shape, float(height))
        values = np.array([sample_frame(frame["camera"], world[valid], green(directory, frame)) for frame in frames])
    else:
        if any(np.linalg.norm(np.array(frame["camera"]["position"]) - frames[0]["camera"]["position"]) > .012
               or np.linalg.norm(np.array(frame["camera"]["forward"]) - frames[0]["camera"]["forward"]) > .001
               for frame in frames):
            raise ValueError("Camera moved. Supply the plane of the observed surface for registration.")
        values = np.array([green(directory, frame)[rows, columns] for frame in frames])
    pixels = values[:, np.isfinite(values).all(axis=0)]
    if pixels.shape[1] < 100:
        raise ValueError("Too few points stay visible across the clip")
    delta = np.diff(pixels, axis=0)
    reversed_step = (delta[:-1] * delta[1:] < 0) & (np.abs(delta[:-1]) >= 3) & (np.abs(delta[1:]) >= 3)
    steps = [{
        "step": i,
        "absMean": round(float(np.abs(change).mean()), 3),
        "absP95": round(float(np.percentile(np.abs(change), 95)), 3),
        "absP99": round(float(np.percentile(np.abs(change), 99)), 3),
    } for i, change in enumerate(delta, 1)]
    return {
        "clip": entry["name"], "rectangle": rectangle, "plane": plane,
        "clockStart": frames[0]["clock"], "clockEnd": frames[-1]["clock"],
        "samples": int(pixels.shape[1]), "frames": len(frames),
        "reversingSampleFraction": round(float(reversed_step.any(axis=0).mean()), 5),
        "peakP95": max(step["absP95"] for step in steps), "steps": steps,
    }


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("capture", type=Path, nargs="+")
    parser.add_argument("--clip", required=True, help="Unique clip name prefix from acceptance.json")
    parser.add_argument("--rect", type=int, nargs=4, required=True, metavar=("Y0", "Y1", "X0", "X1"))
    parser.add_argument("--plane", help="World plane such as y=14; required when the camera moves")
    parser.add_argument("--reference", type=Path, help="Choose one run's first frame to define the world points for all runs")
    args = parser.parse_args()
    if args.reference and not args.plane:
        parser.error("--reference requires --plane")
    print(json.dumps({folder.name: analyze(folder, args.clip, args.rect, args.plane, args.reference)
                      for folder in args.capture}, indent=2, ensure_ascii=False))
