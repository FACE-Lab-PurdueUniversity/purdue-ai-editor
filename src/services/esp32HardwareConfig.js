import { createPlatformHardwareConfig } from './hardwareConfig';

const {
  getHardwareCatalog: getEsp32HardwareCatalog,
  getCurrentUserHardwareConfig: getCurrentUserEsp32HardwareConfig,
  saveCurrentUserHardwareConfig: saveCurrentUserEsp32HardwareConfig,
} = createPlatformHardwareConfig({
  mpuKey: 'ESP32_MPUS',
  componentsKey: 'ESP32_COMPONENTS',
  templatesKey: 'ESP32_HARDWARE_TEMPLATES',
  userConfigKey: 'esp32_hardware_config',
});

export { getEsp32HardwareCatalog, getCurrentUserEsp32HardwareConfig, saveCurrentUserEsp32HardwareConfig };
