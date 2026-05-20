import {
  ConnectionStatus,
  DeviceSelectionMode,
  createUniversalHexFlashDataSource,
  createWebUSBConnection,
} from '@microbit/microbit-connection';
import microbitFirmwareHex from '../assets/firmware/microbit-v2-micropython-v2.1.1.hex?raw';

// micro:bit DAPLink USB identifiers (v1 and v2).
export const MICROBIT_USB_FILTERS = [
  { vendorId: 0x0d28, productId: 0x0204 },
];

const noop = () => {};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const firmwareDataSource = createUniversalHexFlashDataSource(microbitFirmwareHex);

// Error classification ---------------------------------------------------

const matchesAny = (error, patterns) => {
  const message = error?.message || '';
  const code = error?.code || '';
  return patterns.some((rx) => rx.test(message) || rx.test(code));
};

export const isUserGestureError = (error) =>
  matchesAny(error, [/Must be handling a user gesture/i]);

export const isNoDeviceSelectedError = (error) =>
  matchesAny(error, [/No device selected|no-device-selected/i]);

export const isRetryableWebUsbError = (error) =>
  matchesAny(error, [
    /Bad response for 8 -> 17/i,
    /\b521\b/,
    /reconnect-microbit/i,
    /clear-connect/i,
    /timeout/i,
  ]);

// Missing MicroPython is signalled by the serial probe failing with one of
// these shapes. Kept as a fallback in case a device reports no useful code.
export const looksLikeMissingMicroPython = (error) =>
  matchesAny(error, [
    /did not respond like a MicroPython REPL/i,
    /Timed out while waiting/i,
    /not a compatible MicroPython REPL/i,
  ]);

// Persisted-grant helpers -------------------------------------------------

const matchesMicrobitUsb = (device) =>
  MICROBIT_USB_FILTERS.some(
    (f) => device.vendorId === f.vendorId && device.productId === f.productId,
  );

const matchesMicrobitSerial = (port) => {
  const info = port.getInfo?.() || {};
  return MICROBIT_USB_FILTERS.some(
    (f) => info.usbVendorId === f.vendorId && info.usbProductId === f.productId,
  );
};

export const findAuthorizedMicrobitSerialPort = async () => {
  if (!navigator.serial?.getPorts) return null;
  const ports = await navigator.serial.getPorts();
  return ports.find(matchesMicrobitSerial) || null;
};

export const hasAuthorizedMicrobitUsbDevice = async () => {
  if (!navigator.usb?.getDevices) return false;
  const devices = await navigator.usb.getDevices();
  return devices.some(matchesMicrobitUsb);
};

/**
 * Poll navigator.serial.getPorts() until a micro:bit port (re)appears.
 * Used after flashing, when the board re-enumerates.
 */
export const waitForMicrobitSerialPort = async (timeoutMs = 6000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const port = await findAuthorizedMicrobitSerialPort();
    if (port) return port;
    await sleep(200);
  }
  return null;
};

// USB installer session ---------------------------------------------------

/**
 * Open a WebUSB link to a micro:bit so we can flash firmware.
 *
 * The caller is responsible for deciding whether to flash. We no longer
 * probe serial first — the probe happens at the serial/REPL layer and the
 * caller opens this session only when the probe has failed.
 *
 * @param {object} opts
 * @param {boolean} [opts.reuseExisting=true] - Try an already-authorized device first.
 * @param {(msg: string) => void} [opts.onStatus]
 */
export const openMicrobitUsbLink = async ({
  reuseExisting = true,
  onStatus = noop,
} = {}) => {
  if (!('usb' in navigator) || !navigator.usb) {
    throw new Error(
      'WebUSB is not available in this browser. Use a Chromium-based browser to install micro:bit MicroPython.',
    );
  }

  const alreadyAuthorized = reuseExisting && (await hasAuthorizedMicrobitUsbDevice());

  const usbConnection = createWebUSBConnection({
    deviceSelectionMode: alreadyAuthorized
      ? DeviceSelectionMode.UseAnyAllowed
      : DeviceSelectionMode.AlwaysAsk,
  });

  try {
    await usbConnection.initialize();

    if (!alreadyAuthorized) {
      onStatus('Select your micro:bit in the USB prompt to install MicroPython...');
    }

    const connectWithRetries = async (attempt = 0) => {
      try {
        return await usbConnection.connect();
      } catch (error) {
        if (attempt >= 2 || !isRetryableWebUsbError(error)) throw error;
        onStatus('WebUSB handshake unstable. Retrying...');
        await sleep(300);
        if (attempt === 1) {
          try { await usbConnection.clearDevice(); } catch {}
        }
        return connectWithRetries(attempt + 1);
      }
    };

    const status = await connectWithRetries();
    if (status !== ConnectionStatus.CONNECTED) {
      throw new Error('Unable to connect to micro:bit over WebUSB for firmware install.');
    }

    return {
      flashBundledFirmware: async ({ onStatus: flashStatus = noop, onProgress = noop } = {}) => {
        flashStatus('Installing MicroPython on micro:bit. This can take up to a minute...');
        const runFlash = () =>
          usbConnection.flash(firmwareDataSource, {
            partial: false,
            progress: (percentage) => {
              if (typeof percentage === 'number') {
                const pct = Math.max(0, Math.min(100, Math.round(percentage * 100)));
                onProgress(pct);
              } else {
                onProgress(undefined);
              }
            },
          });

        try {
          await runFlash();
        } catch (error) {
          if (!isRetryableWebUsbError(error)) throw error;
          flashStatus('Flash link dropped. Reconnecting and retrying once...');
          await sleep(300);
          try {
            await usbConnection.connect();
          } catch (reconnectError) {
            if (!isRetryableWebUsbError(reconnectError)) throw reconnectError;
            throw new Error(
              'WebUSB flashing link stayed unstable. Unplug/replug micro:bit, then click Connect again.',
            );
          }
          await runFlash();
        }
        flashStatus('MicroPython installation complete.');
        return { status: 'installed' };
      },
      close: async () => {
        try { await usbConnection.disconnect(); } catch {}
        try { usbConnection.dispose(); } catch {}
      },
    };
  } catch (error) {
    try { await usbConnection.disconnect(); } catch {}
    try { usbConnection.dispose(); } catch {}
    throw error;
  }
};
