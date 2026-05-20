import cutebotDriver from '../../assets/cutebot/cutebot.py?raw';
import { buildCutebotPriming } from './priming';
import { stopCode } from './stopCode';

const cutebotPlatform = {
  id: 'cutebot',
  label: 'Cutebot',
  connectionType: 'microbit',
  buildPriming: buildCutebotPriming,
  stopCode,
  postConnectFiles: [
    { path: 'cutebot.py', content: cutebotDriver, label: 'Cutebot driver' },
  ],
};

export default cutebotPlatform;
