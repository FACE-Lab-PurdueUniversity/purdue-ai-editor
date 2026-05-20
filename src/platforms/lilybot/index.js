import { buildLilyBotPriming } from './priming';
import { stopCode } from './stopCode';

const lilybotPlatform = {
  id: 'lilybot',
  label: 'LilyBot',
  connectionType: 'pico',
  buildPriming: buildLilyBotPriming,
  stopCode,
};

export default lilybotPlatform;
