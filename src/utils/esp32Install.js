import { ESPLoader, Transport } from 'esptool-js';
import SparkMD5 from 'spark-md5';
import firmwareUrl from '../assets/firmware/esp32-micropython-v1.28.0.bin?url';

const noop = () => {};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const MICROPYTHON_FLASH_ADDRESS = 0x1000;
// The bundled firmware is the ESP32_GENERIC build (classic ESP32 only).
// S2/S3/C3 etc. need a different image at a different address.
const SUPPORTED_CHIP = 'ESP32';
const MAX_WRITE_ATTEMPTS = 3;

// esptool-js only verifies the written flash if we supply an MD5 function.
// Copy into a fresh buffer so a Uint8Array view never hashes extra bytes.
const md5Hex = (image) => SparkMD5.ArrayBuffer.hash(new Uint8Array(image).buffer);

// Serial corruption during the write surfaces as a stub status error
// (e.g. 193 = 0xC1 bad data checksum) or an MD5 mismatch — both are worth a retry.
const isRetryableWriteError = (error) =>
  /failed with status|MD5 of file does not match|Timeout|Invalid head of packet|Packet content transfer stopped/i.test(
    error?.message || ''
  );

export const looksLikeMissingMicroPythonEsp32 = (error) => {
  const message = error?.message || '';
  return (
    /not a compatible MicroPython REPL/i.test(message) ||
    /did not respond like a MicroPython REPL/i.test(message) ||
    /Timed out while waiting/i.test(message)
  );
};

/**
 * Poll getPorts() until a port matching originalPort's VID/PID reappears.
 * Used after hard_reset to reconnect the REPL.
 */
export const waitForEsp32SerialPort = async (originalPort, timeoutMs = 8000) => {
  if (!navigator.serial?.getPorts) return null;
  const info = originalPort.getInfo?.() || {};
  const { usbVendorId, usbProductId } = info;
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const ports = await navigator.serial.getPorts();
    if (usbVendorId) {
      const match = ports.find((p) => {
        const i = p.getInfo?.() || {};
        return i.usbVendorId === usbVendorId && i.usbProductId === usbProductId;
      });
      if (match) return match;
    } else if (ports.length > 0) {
      return ports[0];
    }
    await sleep(300);
  }
  return null;
};

/**
 * Open an esptool-js flash session against an already-obtained SerialPort.
 *
 * @param {SerialPort} port - The WebSerial port (must be closed before calling).
 * @param {{ onStatus?: Function, skipReset?: boolean }} opts
 *   skipReset: true → passes 'no_reset' to esploader.main() so the DTR/RTS reset
 *   is skipped. Use this when the board is already in bootloader mode (user held
 *   BOOT + pressed EN), which avoids the USB disconnect caused by auto-reset.
 */
export const openEsp32FlashSession = async (port, { onStatus = noop, skipReset = false } = {}) => {
  const transport = new Transport(port, false);

  const terminal = {
    clean: noop,
    writeLine: (data) => { if (data) console.log('[esptool]', data); },
    write: (data) => { if (data) console.log('[esptool]', data); },
  };

  const esploader = new ESPLoader({ transport, baudrate: 115200, terminal, debugLogging: false });

  try {
    onStatus(skipReset ? 'Syncing with ESP32 bootloader...' : 'Connecting to ESP32 bootloader...');
    const mode = skipReset ? 'no_reset' : 'default_reset';
    const chipName = await esploader.main(mode);
    if (esploader.chip?.CHIP_NAME !== SUPPORTED_CHIP) {
      const unsupported = new Error(
        `This board is an ${esploader.chip?.CHIP_NAME || chipName}, but only the classic ESP32 ` +
        '(e.g. ESP32-WROOM-32E) is supported. MicroPython was not installed.'
      );
      unsupported.code = 'ESP32_UNSUPPORTED_CHIP';
      throw unsupported;
    }
    onStatus(`Connected to ${chipName}. Preparing to install MicroPython...`);
  } catch (error) {
    try { await transport.disconnect(); } catch {}
    if (/timeout|sync|Failed to connect/i.test(error?.message || '')) {
      throw new Error(
        skipReset
          ? 'Could not sync with ESP32 bootloader. Make sure you held BOOT before pressing EN, then try again.'
          : 'Bootloader entry timed out. Hold the BOOT button on your ESP32, press Reset, then try again.'
      );
    }
    throw error;
  }

  return {
    flashMicroPython: async ({ onStatus: flashStatus = noop, onProgress = noop } = {}) => {
      // Download before erasing so a network failure doesn't leave the board blank.
      flashStatus('Downloading MicroPython firmware...');
      const response = await fetch(firmwareUrl);
      if (!response.ok) throw new Error(`Failed to fetch MicroPython firmware: ${response.statusText}`);
      const firmwareData = new Uint8Array(await response.arrayBuffer());

      flashStatus('Erasing old firmware (this takes ~15 seconds)...');
      await esploader.eraseFlash();

      for (let attempt = 1; attempt <= MAX_WRITE_ATTEMPTS; attempt++) {
        flashStatus(
          attempt === 1
            ? 'Writing MicroPython to ESP32...'
            : `Data was corrupted over USB — retrying write (${attempt}/${MAX_WRITE_ATTEMPTS})...`
        );
        onProgress(0);
        try {
          await esploader.writeFlash({
            fileArray: [{ data: firmwareData, address: MICROPYTHON_FLASH_ADDRESS }],
            flashMode: 'dio',
            flashFreq: '40m',
            flashSize: 'keep',
            eraseAll: false,
            compress: true,
            calculateMD5Hash: md5Hex,
            reportProgress: (_fileIndex, written, total) => {
              if (total > 0) onProgress(Math.round((written / total) * 100));
            },
          });
          break;
        } catch (error) {
          console.warn(`[esptool] write attempt ${attempt} failed:`, error);
          if (!isRetryableWriteError(error)) throw error;
          if (attempt === MAX_WRITE_ATTEMPTS) {
            throw new Error(
              'MicroPython could not be written reliably — the USB connection kept corrupting data. ' +
              'Try a different USB cable (a data cable, not charge-only), plug directly into the computer ' +
              'instead of a hub, then put the board in bootloader mode and click Flash MicroPython again.'
            );
          }
          // Let the stub drop any half-received packet before restarting the write.
          await sleep(500);
          esploader.transport.flushInput();
        }
      }

      flashStatus('MicroPython installed. Resetting ESP32...');
      // hard_reset toggles DTR/RTS which may briefly disconnect the USB port.
      // That's expected and safe — the flash is already complete at this point.
      try {
        await esploader.after('hard_reset');
      } catch {
        // USB disconnect during reset is normal — ignore
      }
      await sleep(500);
      flashStatus('MicroPython installation complete.');
    },

    close: async () => {
      try { await transport.disconnect(); } catch {}
    },
  };
};
