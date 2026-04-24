/**
 * Ribbon command handlers.
 *
 * The primary entry point in Phase 1 is the taskpane ("Send to Contract"
 * button opens the taskpane), so the command surface here is deliberately
 * thin. A `quickSend` handler is stubbed for a future ribbon button that
 * forwards to the last-used contract without opening the taskpane; the
 * current implementation just opens the taskpane so the user sees what
 * would happen.
 *
 * Office requires that commands.html loads this bundle and registers the
 * action IDs declared in manifest.xml (`ckb.showTaskpane`, `ckb.quickSend`).
 */

Office.onReady(() => {
  Office.actions.associate('ckb.showTaskpane', showTaskpane);
  Office.actions.associate('ckb.quickSend', quickSend);
});

function showTaskpane(event: OfficeActionEvent): void {
  // Outlook automatically opens the taskpane when the manifest action is of
  // type ShowTaskpane, so there is no imperative "open" API to call from here.
  // We simply complete the event; the ribbon button is what carries the open
  // intent.
  event.completed();
}

function quickSend(event: OfficeActionEvent): void {
  // Placeholder. Real implementation will read a persisted "last contract"
  // and POST via api-client. For now, surface a no-op so the manifest ID is
  // bound; developers who turn it on will see the button but get no action.
  event.completed();
}
