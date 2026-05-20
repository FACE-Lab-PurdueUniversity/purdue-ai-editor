import lilybotPlatform from './lilybot';
import microbitPlatform from './microbit';
import cutebotPlatform from './cutebot';

export const PLATFORMS = [lilybotPlatform, microbitPlatform, cutebotPlatform];

const PLATFORMS_BY_ID = PLATFORMS.reduce((acc, platform) => {
  acc[platform.id] = platform;
  return acc;
}, {});

export function getPlatform(id) {
  return PLATFORMS_BY_ID[id] || null;
}
