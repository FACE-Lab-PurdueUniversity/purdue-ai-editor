import { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';
import Board from '../utils/microRepl.js';
import {
  openMicrobitUsbLink,
  looksLikeMissingMicroPython,
  findAuthorizedMicrobitSerialPort,
  waitForMicrobitSerialPort,
} from '../utils/microbitInstall.js';
import { applyPostConnectFiles } from '../utils/postConnectFiles.js';
import CodeEditor from './CodeEditor.jsx';
import ControlPanel from './ControlPanel.jsx';
import CodeTabs from './CodeTabs.jsx';
import FlashProgressModal from './FlashProgressModal.jsx';
import { useSession } from '../contexts/SessionContext';
import { logConsole, logInteraction } from '../services/dataLogger';
import './SPIKEEditor.css';

const FIFO_SIZE = 10000;


const SPIKEEditor = forwardRef(({ sessionId }, ref) => {
  const [connected, setConnected] = useState(false);
  const [connectedBoard, setConnectedBoard] = useState(null);
  const [connectedPlatformId, setConnectedPlatformId] = useState(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [statusBanner, setStatusBanner] = useState({
    type: 'info',
    message: 'Not connected.'
  });
  const [mode, setMode] = useState('disconnected');
  const [isRunning, setIsRunning] = useState(false);
  const [buffer, setBuffer] = useState('');
  // 'idle' | 'probing' | 'flashing' | 'reconnecting'
  const [connectPhase, setConnectPhase] = useState('idle');
  const [flashProgress, setFlashProgress] = useState(undefined);
  const [flashMessage, setFlashMessage] = useState('');

  const {
    codeRecords,
    currentCodeId,
    currentCodeContent,
    activePlatform,
    switchCode,
    createNewCode,
    updateCodeName,
    updateCurrentCodeContent,
    createSnapshot
  } = useSession();

  const editorRef = useRef(null);
  const boardRef = useRef(null);
  const replContainerRef = useRef(null);
  const resizerRef = useRef(null);
  const containerRef = useRef(null);
  const isLocalChangeRef = useRef(false);
  // Prevents concurrent run/stop handlers from overlapping their paste calls,
  // which otherwise corrupts the REPL paste-mode handshake and hangs.
  const operationInFlightRef = useRef(false);

  const logInteractionSafe = async (action) => {
    if (!sessionId) return;
    try {
      await logInteraction(action, sessionId);
    } catch (error) {
      console.warn(`Failed to log interaction (${action}):`, error);
    }
  };

  const logConsoleSafe = async (content, action) => {
    if (!sessionId || !content) return;
    try {
      await logConsole(content, sessionId, action);
    } catch (error) {
      console.warn(`Failed to log console (${action}):`, error);
    }
  };

  const getConnectionErrorMessage = (error) => {
    const message = error?.message || 'Unknown serial error';
    if (/WebUSB is not available/i.test(message)) {
      return 'Connection failed: WebUSB is required to install micro:bit MicroPython. Use a Chromium-based browser.';
    }
    if (/No device selected|no-device-selected/i.test(message)) {
      return 'Connection failed: no micro:bit selected in the browser device picker.';
    }
    if (/Bad response for 8 -> 17|reconnect-microbit/i.test(message) || /reconnect-microbit/i.test(error?.code || '')) {
      return 'Connection failed: unstable WebUSB link to micro:bit. Unplug/replug the board, then click Connect micro:bit again.';
    }
    if (/WebUSB still unstable|WebUSB flashing link stayed unstable/i.test(message)) {
      return message;
    }
    if (/MicroPython install requires WebUSB access/i.test(message)) {
      return message;
    }
    if (/did not respond like a MicroPython REPL/i.test(message)) {
      return 'Connection failed: selected device is not a compatible MicroPython REPL.';
    }
    if (/Failed to open serial port|NetworkError|busy|resource/i.test(message)) {
      return 'Connection failed: serial port is busy. Close any other serial connections to the device and try again.';
    }
    if (/No port selected by the user/i.test(message)) {
      return 'Connection failed: no device selected by the user.';
    }
    return `Connection failed: ${message}`;
  };

  // Expose methods to parent via ref
  useImperativeHandle(ref, () => ({
    getCode: () => editorRef.current?.getCode() || currentCodeContent,
    getBuffer: () => buffer,
  }));

  // Update code editor when current code content changes (from session load or tab switch)
  useEffect(() => {
    if (!isLocalChangeRef.current && editorRef.current?.setCode) {
      editorRef.current.setCode(currentCodeContent);
    }
    isLocalChangeRef.current = false;
  }, [currentCodeContent]);

  // Disconnect the currently attached device when switching to a session whose
  // platform uses a different connection type (e.g. LilyBot/Pico → micro:bit),
  // OR whose connection type matches but whose postConnectFiles requirements
  // differ (e.g. plain micro:bit → Cutebot — we need to install the driver).
  useEffect(() => {
    if (!connected || !connectedBoard) return;
    const nextType = activePlatform?.connectionType;
    const nextId = activePlatform?.id || null;
    if (!nextType) return;

    const typeMismatch = nextType !== connectedBoard;
    const platformMismatch =
      !typeMismatch &&
      connectedPlatformId &&
      nextId &&
      nextId !== connectedPlatformId;

    if (!typeMismatch && !platformMismatch) return;

    const board = boardRef.current;
    if (!board) return;

    setStatusBanner({
      type: 'info',
      message: typeMismatch
        ? 'Disconnecting previous device — session platform changed.'
        : `Disconnecting — switching to ${activePlatform.label} session. Click Connect to install driver.`,
    });
    board.disconnect().catch((error) => {
      console.error('Failed to auto-disconnect after platform switch:', error);
    });
  }, [activePlatform, connected, connectedBoard, connectedPlatformId]);

  // Handle code changes in the editor (local state only, no database save)
  const handleCodeChange = (newCode) => {
    isLocalChangeRef.current = true;
    updateCurrentCodeContent(newCode);
  };

  // Initialize board on mount
  useEffect(() => {
    if (!boardRef.current) {
      boardRef.current = new Board({
        baudRate: 115200,
        dataType: 'string',
        onconnect: () => {
          console.log('Device connected');
          setIsConnecting(false);
          setConnected(true);
          setMode('repl');
          setStatusBanner({
            type: 'success',
            message: 'Device Status: Connected. REPL is ready.'
          });
        },
        ondisconnect: () => {
          console.log('Device disconnected');
          setIsConnecting(false);
          setConnected(false);
          setConnectedBoard(null);
          setConnectedPlatformId(null);
          setConnectPhase('idle');
          setMode('disconnected');
          setBuffer('');
          setIsRunning(false);
          setStatusBanner({
            type: 'info',
            message: 'Device Status: Disconnected.'
          });
        },
        onportselected: () => {
          setStatusBanner({
            type: 'info',
            message: 'Attempting to connect...'
          });
        },
        onerror: (error) => {
          console.error('Board error:', error);
          setIsConnecting(false);
          const message = getConnectionErrorMessage(error);
          setStatusBanner({
            type: 'error',
            message
          });
          const terminal = boardRef.current?.terminal;
          if (terminal) {
            terminal.write(`\r\n${message}\r\n`);
          }
        },
        ondata: (chunk) => {
          // Update buffer (FIFO)
          setBuffer(prev => {
            const newBuffer = prev + chunk;
            return newBuffer.slice(-FIFO_SIZE);
          });

          // Check if execution finished (prompt appears)
          if (chunk.includes('>>> ')) {
            setTimeout(() => setIsRunning(false), 100);
          }
        },
        theme: {
          background: '#ffffff',
          foreground: '#000000'
        }
      });
    }
  }, []);

  // Resizable pane logic
  useEffect(() => {
    const resizer = resizerRef.current;
    const container = containerRef.current;
    if (!resizer || !container) return;

    let isDragging = false;

    const handleMouseDown = (e) => {
      e.preventDefault();
      isDragging = true;
      document.body.style.cursor = 'row-resize';
      document.body.style.userSelect = 'none';
    };

    const handleMouseMove = (e) => {
      if (!isDragging) return;
      const rect = container.getBoundingClientRect();
      const offsetY = e.clientY - rect.top;
      const percent = (offsetY / rect.height) * 100;
      container.style.gridTemplateRows = `${percent}% 5px auto`;
      
      // Resize the terminal to fit the new container size
      if (boardRef.current) {
        boardRef.current.resize();
      }
    };

    const handleMouseUp = () => {
      if (isDragging) {
        isDragging = false;
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      }
    };

    resizer.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      resizer.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, []);

  // Resize terminal when container size changes
  useEffect(() => {
    const terminalContainer = replContainerRef.current;
    if (!terminalContainer) return;

    const resizeObserver = new ResizeObserver(() => {
      if (boardRef.current) {
        boardRef.current.resize();
      }
    });

    resizeObserver.observe(terminalContainer);

    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  const handleDisconnect = async () => {
    const board = boardRef.current;
    if (!board || isConnecting) return;

    setIsConnecting(true);
    try {
      if (!connected) return;
      setStatusBanner({
        type: 'info',
        message: 'Disconnecting...'
      });
      await logInteractionSafe('disconnect');
      await board.disconnect();
    }
    finally {
      setIsConnecting(false);
    }
  };

  // Connect micro:bit via a linear state machine:
  //   idle → probing → (flashing → reconnecting →) probing → connected
  // No "arm + click again" step: flashing happens inline on the first click.
  const connectMicrobit = async (board) => {
    setConnectPhase('probing');
    setFlashProgress(undefined);
    setFlashMessage('Opening micro:bit serial port...');

    // Step 1: Try serial, preferring an already-authorized port (no picker).
    const cachedPort = await findAuthorizedMicrobitSerialPort();
    if (!cachedPort) {
      setStatusBanner({
        type: 'info',
        message: 'Waiting for micro:bit serial device selection...'
      });
    }

    try {
      await board.connect(replContainerRef.current, true, {
        boardType: 'microbit',
        serialPort: cachedPort || null,
      });
      setConnectedBoard('microbit');
      setConnectPhase('idle');
      return;
    } catch (error) {
      if (!looksLikeMissingMicroPython(error)) throw error;
      // Serial probe failed in a way consistent with no MicroPython installed.
      // Fall through to flash.
    }

    // Step 2: Open WebUSB + flash. This prompts the USB picker only if the
    // device is not already authorized.
    setConnectPhase('flashing');
    setFlashProgress(undefined);
    setFlashMessage('Opening WebUSB link to micro:bit...');

    let installerSession = null;
    try {
      installerSession = await openMicrobitUsbLink({
        reuseExisting: true,
        onStatus: (message) => setFlashMessage(message),
      });

      await installerSession.flashBundledFirmware({
        onStatus: (message) => setFlashMessage(message),
        onProgress: (pct) => setFlashProgress(pct),
      });
    } finally {
      if (installerSession) {
        try { await installerSession.close(); } catch {}
      }
    }

    // Step 3: Wait for the board to re-enumerate as a serial device, then
    // reconnect silently using the cached grant.
    setConnectPhase('reconnecting');
    setFlashProgress(undefined);
    setFlashMessage('Waiting for micro:bit to reappear...');

    const reenumeratedPort = await waitForMicrobitSerialPort(8000);
    if (!reenumeratedPort) {
      throw new Error(
        'micro:bit did not reappear after flashing. Unplug/replug the board, then click Connect again.'
      );
    }

    setFlashMessage('Reconnecting to micro:bit REPL...');
    await board.connect(replContainerRef.current, true, {
      boardType: 'microbit',
      serialPort: reenumeratedPort,
    });
    setConnectedBoard('microbit');
    setConnectPhase('idle');
  };

  const connectPico = async (board) => {
    setStatusBanner({
      type: 'info',
      message: 'Waiting for Pico serial device selection...'
    });
    await board.connect(replContainerRef.current, true, { boardType: 'pico' });
    await board.interrupt(150);
    if (activePlatform?.stopCode) {
      // paste, not eval — eval strips the trailing newline that closes the
      // for-block, so the stop loop never actually runs and pins stay high.
      await board.paste(activePlatform.stopCode, { hidden: true });
    }
    setConnectedBoard('pico');
  };

  const handleConnect = async (targetBoard) => {
    const board = boardRef.current;
    if (!board || isConnecting || connected) return;

    setIsConnecting(true);
    void logInteractionSafe(`connect_${targetBoard}`);

    try {
      if (targetBoard === 'microbit') {
        await connectMicrobit(board);
        // Interrupt any running program after successful micro:bit connect.
        await board.interrupt(150);
        // Stop any platform-specific hardware (e.g. Cutebot motors). No-op for
        // plain micro:bit since its stopCode is empty.
        if (activePlatform?.stopCode) {
          try {
            await board.paste(activePlatform.stopCode, { hidden: true });
          } catch (error) {
            console.error('Failed to run platform stop code on connect:', error);
          }
        }
        // Install any platform-required files (e.g. cutebot.py). Skips the
        // upload when the file already exists with the expected size.
        try {
          await applyPostConnectFiles(board, activePlatform);
        } catch (error) {
          console.error('Post-connect file install failed:', error);
          setStatusBanner({
            type: 'error',
            message: `Failed to install ${error?.label || 'driver'} on micro:bit — try reconnecting.`,
          });
        }
      } else {
        await connectPico(board);
      }
      setConnectedPlatformId(activePlatform?.id || null);
    } catch (error) {
      console.error('Connection failed:', error);
      setConnected(false);
      setConnectedBoard(null);
      setConnectedPlatformId(null);
      setMode('disconnected');
      setIsRunning(false);
      const message = getConnectionErrorMessage(error);
      setStatusBanner({ type: 'error', message });
      const terminal = board.terminal;
      if (terminal) terminal.write(`\r\n${message}\r\n`);
    } finally {
      setConnectPhase('idle');
      setFlashProgress(undefined);
      setFlashMessage('');
      setIsConnecting(false);
    }
  };

  // Interrupt the running program and run the platform's stop code. No guard —
  // callers that hold `operationInFlightRef` reuse this without re-entering it.
  const stopRunningCode = async () => {
    const board = boardRef.current;
    if (!board || !connected) return;

    setIsRunning(false);
    await board.interrupt();
    await new Promise(resolve => setTimeout(resolve, 100));

    if (activePlatform?.stopCode) {
      try {
        await board.paste(activePlatform.stopCode, { hidden: true });
      } catch (error) {
        console.error('Failed to run platform stop code:', error);
      }
    }
  };

  const handleRun = async () => {
    const board = boardRef.current;
    if (!board || !connected) return;
    if (operationInFlightRef.current) return;
    operationInFlightRef.current = true;

    try {
      const codeToRun = editorRef.current?.getCode() || currentCodeContent;

      await createSnapshot('run_device');
      await logInteractionSafe('run_device');

      if (isRunning) {
        await stopRunningCode();
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      setIsRunning(true);
      try {
        await board.paste(codeToRun, { hidden: false });
        board.terminal?.focus();
      } catch (error) {
        console.error('Run failed:', error);
        setIsRunning(false);
      }
    } finally {
      operationInFlightRef.current = false;
    }
  };

  const handleCtrlC = async () => {
    const board = boardRef.current;
    if (!board || !connected) return;
    if (operationInFlightRef.current) return;
    operationInFlightRef.current = true;

    try {
      await logInteractionSafe('send_ctrl_c');
      await stopRunningCode();
    } finally {
      operationInFlightRef.current = false;
    }
  };

  const handleReset = async () => {
    const board = boardRef.current;
    if (!board || !connected) return;

    await logInteractionSafe('reset_device');

    setIsRunning(false);
    await board.reset();
    await new Promise(resolve => setTimeout(resolve, 1000));
    await board.interrupt();
    setMode('repl');
    board.terminal?.focus();
  };

  const handleClear = async () => {
    // Log interaction and console before clearing
    await logInteractionSafe('clear_console');
    await logConsoleSafe(buffer, 'clear_console');

    if (boardRef.current?.terminal) {
      boardRef.current.terminal.clear();
    }
    setBuffer('');
  };

  const handleSaveToMain = async () => {
    const board = boardRef.current;
    if (!board || !connected) {
      alert('Cannot save to main.py. Please connect to the Pico W first.');
      return;
    }

    const codeToSave = editorRef.current?.getCode() || currentCodeContent;
    
    // Create snapshot before saving to main.py
    await createSnapshot('save_to_main_py');
    
    // Log interaction before saving to main.py
    await logInteractionSafe('save_to_main_py');

    try {
      await board.upload('main.py', codeToSave);
      await board.reset();
      setMode('repl');
      board.terminal?.focus();
    } catch (error) {
      console.error('Failed to save to main.py:', error);
      alert(`Failed to save to main.py: ${error.message}`);
    }
  };

  return (
    <div className="spike-editor">
      <FlashProgressModal
        open={connectPhase === 'flashing' || connectPhase === 'reconnecting'}
        phase={connectPhase}
        progress={flashProgress}
        message={flashMessage}
      />
      <CodeTabs
        codeRecords={codeRecords}
        currentCodeId={currentCodeId}
        onSwitchCode={switchCode}
        onCreateCode={createNewCode}
        onRenameCode={updateCodeName}
      />
      <div className="parent" ref={containerRef}>
        <div className="child top-child">
          <div className="editor-wrapper">
            <CodeEditor
              ref={editorRef}
              initialCode={currentCodeContent}
              onChange={handleCodeChange}
            />
          </div>
        </div>

        <div className="resizer" ref={resizerRef}></div>

        <div className="child bottom-child">
          <div className="status-and-control-row">
            <ControlPanel
              connected={connected}
              connectedBoard={connectedBoard}
              platformConnectionType={activePlatform?.connectionType}
              isConnecting={isConnecting}
              onConnectMicrobit={() => handleConnect('microbit')}
              onConnectPico={() => handleConnect('pico')}
              onDisconnect={handleDisconnect}
              onRun={handleRun}
              onCtrlC={handleCtrlC}
              onReset={handleReset}
              onClear={handleClear}
              onSaveToMain={handleSaveToMain}
            />
            {!connected && (
              <div className={`status-banner ${statusBanner.type}`}>
                {statusBanner.message}
              </div>
            )}
          </div>
          <div className="terminal-wrapper" ref={replContainerRef}>
            {/* The micro_repl Board will render the xterm terminal here */}
          </div>
        </div>
      </div>
    </div>
  );
});

SPIKEEditor.displayName = 'SPIKEEditor';

export default SPIKEEditor;

