const ControlPanel = ({
  connected,
  connectedBoard = null,
  platformConnectionType = null,
  isConnecting = false,
  onConnectMicrobit,
  onConnectPico,
  onConnectEsp32,
  onFlashEsp32,
  esp32FlashRequired = false,
  onDisconnect,
  onRun,
  onCtrlC,
  onReset,
  onClear,
  onSaveToMain,
  onDownload,
  onClearDownload,
  onClearMain
}) => {
  return (
    <div className="control-panel right-panel">
      <div className="button-group">
        {connected ? (
          <button
            onClick={onDisconnect}
            className="button disconnect-button"
            disabled={isConnecting}
          >
            {isConnecting ? 'Disconnecting...' : 'Disconnect'}
          </button>
        ) : (
          <>
            {platformConnectionType === 'microbit' && (
              <button
                onClick={onConnectMicrobit}
                className="button connect-button"
                disabled={isConnecting}
              >
                {isConnecting ? 'Connecting...' : 'Connect micro:bit'}
              </button>
            )}
            {platformConnectionType === 'pico' && (
              <button
                onClick={onConnectPico}
                className="button connect-button"
                disabled={isConnecting}
              >
                {isConnecting ? 'Connecting...' : 'Connect Pico'}
              </button>
            )}
            {platformConnectionType === 'esp32' && (
              <button
                onClick={onConnectEsp32}
                className="button connect-button"
                disabled={isConnecting}
              >
                {isConnecting ? 'Connecting...' : 'Connect ESP32'}
              </button>
            )}
            {platformConnectionType === 'esp32' && esp32FlashRequired && (
              <button
                onClick={onFlashEsp32}
                className="button run-button"
                disabled={isConnecting}
              >
                {isConnecting ? 'Flashing...' : 'Flash MicroPython'}
              </button>
            )}
          </>
        )}
        <button onClick={onClear} className="button clear-console-button" disabled={isConnecting}>
          Clear Console
        </button>
      </div>

      {connected && (
        <div className="button-group">
          <button onClick={onRun} className="button run-button">
            ▶ Run Program
          </button>
          {connectedBoard === 'pico' && (
            <button onClick={onSaveToMain} className="button run-button">
              Save to main.py
            </button>
          )}
          {connectedBoard === 'microbit' && (
            <button onClick={onDownload} className="button run-button">
              Download
            </button>
          )}
          {connectedBoard === 'microbit' && (
            <button onClick={onClearDownload} className="button clear-console-button">
              Clear Download
            </button>
          )}
          {connectedBoard === 'esp32' && (
            <button onClick={onSaveToMain} className="button run-button">
              Save to main.py
            </button>
          )}
          {connectedBoard === 'esp32' && (
            <button onClick={onClearMain} className="button clear-console-button">
              Clear main.py
            </button>
          )}
          <button onClick={onCtrlC} className="button stop-button">
            Stop Program
          </button>
          <button onClick={onReset} className="button stop-button">
            Reset Device
          </button>
        </div>
      )}
    </div>
  );
};

export default ControlPanel;

