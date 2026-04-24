/**
 * Thin Office.js helpers. The taskpane uses exactly two operations:
 *
 *   1. `getCurrentItemSummary` — pull subject + sender + item id for UI preview.
 *   2. `readCurrentItemAsEml`  — call `getAsFileAsync` to retrieve the raw
 *      .eml as a base64 string. Both received and sent items are supported —
 *      Outlook surfaces `item.getAsFileAsync` in read mode on either folder
 *      (SOW §6.18: "Handles both received and sent items.").
 */

export interface OutlookItemSummary {
  readonly itemId: string;
  readonly subject: string;
  readonly fromAddress: string | undefined;
  readonly fromName: string | undefined;
}

export function getCurrentItemSummary(): OutlookItemSummary | null {
  if (typeof Office === 'undefined' || !Office.context?.mailbox?.item) return null;
  const item = Office.context.mailbox.item;
  const addr = item.from?.emailAddress ?? item.sender?.emailAddress;
  const name = item.from?.displayName ?? item.sender?.displayName;
  return {
    itemId: item.itemId,
    subject: item.subject,
    fromAddress: addr,
    fromName: name,
  };
}

export function readCurrentItemAsEml(): Promise<{
  base64: string;
  subject: string;
  fromAddress: string | undefined;
}> {
  return new Promise((resolve, reject) => {
    if (typeof Office === 'undefined' || !Office.context?.mailbox?.item) {
      reject(new Error('No Outlook item selected'));
      return;
    }
    const item = Office.context.mailbox.item;
    item.getAsFileAsync(
      Office.MailboxEnums.EmailFileType.Eml,
      undefined,
      (result) => {
        if (result.status !== 'succeeded') {
          reject(new Error(result.error?.message ?? 'getAsFileAsync failed'));
          return;
        }
        // Office returns the EML as a base64-encoded string already.
        resolve({
          base64: result.value,
          subject: item.subject,
          fromAddress: item.from?.emailAddress ?? item.sender?.emailAddress,
        });
      },
    );
  });
}
