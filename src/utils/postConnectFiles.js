// Apply a platform's declarative postConnectFiles spec: for each file, check the
// device for an existing copy and upload only when missing or wrong-size.
//
// Each entry: { path, content, label? }
//   path    — destination path on the micro:bit filesystem (e.g. 'cutebot.py')
//   content — file content as a string
//   label   — optional friendly name used in error messages
//
// Both the size probe and the upload itself go through paste mode (not eval
// or Board.upload's raw mode). eval can't be used because it relies on
// `import json;print(json.dumps(...))` and micro:bit MicroPython does not
// ship the json module. Board.upload's char-by-char raw mode overruns the
// micro:bit serial buffer for files larger than ~1KB, leaving an empty file
// on the device — so we chunk the upload into many small paste-mode writes.

const buildSizeProbe = (path) => {
  const p = JSON.stringify(path);
  return `
import os
print(os.stat(${p})[6] if ${p} in os.listdir() else -1)
`;
};

// Raw bytes per chunk. We encode each chunk as a Python bytes literal
// (`b'...'`) using backslash escapes — no `binascii` import needed, which
// matters because the micro:bit MicroPython build doesn't ship it. Worst-case
// encoded length is 4 chars per byte (`\xXX`), so 30 raw bytes ≤ 120 chars of
// literal plus the `_f.write(b'...')` wrapper ≈ 140 chars per REPL line.
const CHUNK_RAW_BYTES = 30;

const SINGLE_QUOTE = 0x27;
const BACKSLASH = 0x5c;
const PRINTABLE_MIN = 0x20;
const PRINTABLE_MAX = 0x7e;

// Encode a byte slice as a Python bytes literal using single quotes.
// Printable ASCII chars pass through; everything else uses `\xXX`.
const bytesToPythonLiteral = (bytes) => {
  let out = "b'";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b === SINGLE_QUOTE) out += "\\'";
    else if (b === BACKSLASH) out += '\\\\';
    else if (b === 0x0a) out += '\\n';
    else if (b === 0x0d) out += '\\r';
    else if (b === 0x09) out += '\\t';
    else if (b >= PRINTABLE_MIN && b <= PRINTABLE_MAX) out += String.fromCharCode(b);
    else out += '\\x' + b.toString(16).padStart(2, '0');
  }
  out += "'";
  return out;
};

const buildUploadStatements = (path, bytes) => {
  const statements = [`_f = open(${JSON.stringify(path)}, "wb")`];
  for (let i = 0; i < bytes.length; i += CHUNK_RAW_BYTES) {
    const chunk = bytes.subarray(i, i + CHUNK_RAW_BYTES);
    statements.push(`_f.write(${bytesToPythonLiteral(chunk)})`);
  }
  statements.push('_f.close()');
  return statements;
};

export async function applyPostConnectFiles(board, platform) {
  const files = platform?.postConnectFiles;
  if (!files?.length) return;

  for (const file of files) {
    const { path, content, label } = file;
    const bytes = new TextEncoder().encode(content);
    const expectedSize = bytes.length;

    let deviceSize = -1;
    try {
      const result = await board.readPrint(buildSizeProbe(path));
      const parsed = parseInt(String(result || '').trim(), 10);
      deviceSize = Number.isFinite(parsed) ? parsed : -1;
    } catch (error) {
      const err = new Error(
        `Could not probe ${path} on device: ${error?.message || error}`
      );
      err.label = label || path;
      throw err;
    }

    if (deviceSize === expectedSize) continue;

    const terminal = board.terminal;
    terminal?.write(`\r\n... installing ${path} (${expectedSize} bytes)\r\n`);

    const statements = buildUploadStatements(path, bytes);
    try {
      for (const statement of statements) {
        await board.runStatement(statement);
      }
    } catch (error) {
      const err = new Error(
        `Upload of ${path} failed: ${error?.message || error}`
      );
      err.label = label || path;
      throw err;
    }

    // Verify by re-probing the size.
    let verifiedSize = -1;
    try {
      const result = await board.readPrint(buildSizeProbe(path));
      const parsed = parseInt(String(result || '').trim(), 10);
      verifiedSize = Number.isFinite(parsed) ? parsed : -1;
    } catch (error) {
      const err = new Error(
        `Could not verify ${path} on device: ${error?.message || error}`
      );
      err.label = label || path;
      throw err;
    }

    if (verifiedSize !== expectedSize) {
      const err = new Error(
        `Upload of ${path} did not verify (expected ${expectedSize} bytes, got ${verifiedSize}).`
      );
      err.label = label || path;
      throw err;
    }

    terminal?.write(`... installed ${path}\r\n`);
  }
}
