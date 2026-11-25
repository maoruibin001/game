import { describe, expect, it } from 'vitest';
import { composePhotoCaption } from '../photo-notes.ts';

describe('spontaneous and milestone photo captions', () => {
  it('generates grounded area, weather, time and portrait notes for free photos', () => {
    const postal = composePhotoCaption({
      area: 'post',
      pose: { position: [-3, 14.08, -228], yaw: 0, pitch: 0, area: 'post' },
      matchedCards: [],
      courtyard: false,
      memory: false,
      postPorch: false,
      scene: {
        clock: { day: 1, minute: 420 },
        weather: 'morning',
        weatherBlend: 1,
        mode: 'portrait',
        lens: 'wide',
        exposure: 0,
        pose: 'wave',
        camera: { position: [0, 16, -222], forward: [0, 0, -1], verticalFovRadians: 1, aspect: 16 / 9 },
        subject: { position: [-3, 14.08, -228], yaw: 0, visible: true },
      },
    });
    expect(postal).toContain('老邮差');
    expect(postal).toContain('清晨');
    expect(postal).toContain('挥了挥手');

    const nightTown = composePhotoCaption({
      area: 'town',
      pose: { position: [155, 24.08, 12], yaw: 0, pitch: 0, area: 'town' },
      matchedCards: [],
      courtyard: false,
      memory: false,
      postPorch: false,
      scene: {
        clock: { day: 1, minute: 1210 },
        weather: 'rain',
        weatherBlend: 1,
        mode: 'landscape',
        lens: 'detail',
        exposure: 0,
        pose: 'look',
        camera: { position: [155, 25.7, 12], forward: [0, 0, 1], verticalFovRadians: 0.5, aspect: 16 / 9 },
        subject: { position: [155, 24.08, 12], yaw: 0, visible: false },
      },
    });
    expect(nightTown).toContain('石巷旧镇');
    expect(nightTown).toContain('细雨');
    expect(nightTown).toContain('拉近');
  });

  it('gives specific captions to courtyard, post-porch and memory captures', () => {
    const courtyard = composePhotoCaption({
      area: 'town',
      pose: { position: [156.2, 24.08, 47.0], yaw: 0, pitch: 0, area: 'town' },
      matchedCards: [],
      courtyard: true,
      memory: false,
      postPorch: false,
    });
    expect(courtyard).toContain('听雨钟院');

    const porch = composePhotoCaption({
      area: 'post',
      pose: { position: [2, 14.08, -214], yaw: 0, pitch: 0, area: 'post' },
      matchedCards: [],
      courtyard: false,
      memory: false,
      postPorch: true,
    });
    expect(porch).toContain('山口邮局');
  });
});
