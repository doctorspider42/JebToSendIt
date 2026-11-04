'use strict';

// Keep the updater in the main process; renderers only receive display state.
function createUpdates({ updater, supported, onChange = () => {}, onReady = () => {} }) {
  let state = { status: supported ? 'idle' : 'unsupported' };
  let checking = false;
  let startupTimer, interval;
  const getState = () => ({ ...state });
  const setState = (next) => { state = next; onChange(getState()); };
  const fail = () => setState({ status: 'error' });

  if (supported) {
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = true;
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.on('checking-for-update', () => setState({ status: 'checking' }));
    updater.on('update-available', (info) => setState({ status: 'downloading', version: info.version, percent: 0 }));
    updater.on('download-progress', (progress) => setState({
      status: 'downloading', version: state.version,
      percent: Math.max(0, Math.min(100, Math.round(progress.percent || 0))),
    }));
    updater.on('update-not-available', () => setState({ status: 'current' }));
    updater.on('update-downloaded', (info) => {
      setState({ status: 'ready', version: info.version });
      onReady(getState());
    });
    updater.on('error', fail);
  }

  async function check() {
    if (!supported || checking || ['checking', 'downloading', 'ready', 'installing'].includes(state.status)) return getState();
    checking = true;
    setState({ status: 'checking' });
    try {
      const result = await updater.checkForUpdates();
      // electron-updater returns the download promise separately from the check.
      if (result?.downloadPromise) void result.downloadPromise.catch(fail);
    } catch { fail(); }
    finally { checking = false; }
    return getState();
  }

  return {
    getState, check,
    start() {
      if (!supported || startupTimer || interval) return;
      startupTimer = setTimeout(() => { void check(); }, 30_000);
      interval = setInterval(() => { void check(); }, 6 * 60 * 60 * 1000);
      startupTimer.unref?.();
      interval.unref?.();
    },
    install() {
      if (state.status !== 'ready') return false;
      setState({ status: 'installing', version: state.version });
      try { updater.quitAndInstall(false, true); return true; }
      catch { fail(); return false; }
    },
    dispose() { clearTimeout(startupTimer); clearInterval(interval); },
  };
}

function supportsUpdates({ isPackaged, platform, portable = false }) {
  return isPackaged && (platform === 'darwin' || (platform === 'win32' && !portable));
}

module.exports = { createUpdates, supportsUpdates };
