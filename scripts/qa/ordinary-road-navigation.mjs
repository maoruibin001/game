import assert from 'node:assert/strict';
import { cameraActive, walking } from './letter-normal-input.mjs';

const yawError = (target, current) => Math.atan2(Math.sin(target - current), Math.cos(target - current));

export function ordinaryRoadNavigation(play, h) {
  async function facePath(point) {
    for (let attempt = 0; attempt < 8; attempt++) {
      const { controller, state } = await h.read();
      const [x, , z] = controller.position;
      const error = yawError(Math.atan2(point[0] - x, z - point[1]), controller.yaw);
      if (Math.abs(error) < 0.075) return;
      const rate = 2.15 * state.durable.settings.sensitivity;
      const duration = Math.min(1100, Math.max(30, 1000 * Math.abs(error) / rate));
      await play.keyboard.hold(error > 0 ? 'ArrowRight' : 'ArrowLeft', duration);
      await h.settle();
    }
    assert.fail('walking view did not respond to the direction keys');
  }

  async function walkTo(point, tolerance = 1.1) {
    const remaining = ({ controller }) => Math.hypot(controller.position[0] - point[0], controller.position[2] - point[1]);
    let state = await h.read();
    let stuck = 0;
    while (remaining(state) > tolerance) {
      await facePath(point);
      const before = remaining(state);
      const duration = Math.max(40, Math.min(1000, 1000 * (before - tolerance * 0.55) / 6.8));
      await play.keyboard.hold('KeyW', duration);
      await h.settle();
      state = await h.read();
      assert.ok(walking(state));
      stuck = before - remaining(state) < 0.025 ? stuck + 1 : 0;
      assert.ok(stuck < 4, 'walking stopped making progress toward ' + point.join(', '));
    }
  }

  async function route(points, tolerance) {
    for (const point of points) await walkTo(point, tolerance);
  }

  async function cameraAt(view, name) {
    await walkTo(view.feet, view.tolerance ?? 0.22);
    await h.key('KeyC');
    const { controller } = await h.wait(cameraActive);
    const delta = view.target.map((value, axis) => value - controller.camera.position[axis]);
    await h.turnTo(Math.atan2(delta[0], -delta[2]), -Math.atan2(delta[1], Math.hypot(delta[0], delta[2])));
    await h.shot(name + '-actual-composition');
  }

  return { walkTo, route, cameraAt };
}
