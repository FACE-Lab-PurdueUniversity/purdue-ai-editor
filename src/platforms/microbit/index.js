import { buildMicrobitPriming } from './priming';
import { stopCode } from './stopCode';

const microbitPlatform = {
  id: 'microbit',
  label: 'micro:bit',
  connectionType: 'microbit',
  buildPriming: buildMicrobitPriming,
  stopCode,
};

export default microbitPlatform;
