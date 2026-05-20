const ControlPanel = ({
  connected,
  connectedBoard = null,
  platformConnectionType = null,
  isConnecting = false,
  onConnectMicrobit,
  onConnectPico,
  onDisconnect,
  onRun,
  onCtrlC,
  onReset,
  onClear,
  onSaveToMain
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

