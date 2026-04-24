import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App.js';

/**
 * Taskpane bootstrap. `Office.onReady` resolves once the host is ready to
 * hand us the current mailbox item; we then mount the React tree.
 */
Office.onReady(() => {
  const container = document.getElementById('root');
  if (!container) {
    // eslint-disable-next-line no-console
    console.error('[ckb-addin] root container missing');
    return;
  }
  const root = createRoot(container);
  root.render(React.createElement(App));
});
