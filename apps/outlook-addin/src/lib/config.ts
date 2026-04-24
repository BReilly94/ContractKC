/**
 * Runtime config for the add-in. In the Outlook sandbox there are no
 * `process.env.*` variables available; webpack inlines values at build time
 * via DefinePlugin. The placeholders below are rewritten in webpack.config.cjs.
 *
 * Never put secrets here — the taskpane ships to the user's mailbox and is
 * trivially inspectable. Bearer tokens come from the user session, not a
 * baked-in key.
 */

declare const __API_BASE_URL__: string;
declare const __AUTH_MODE__: 'local-dev' | 'azure-ad';

export const API_BASE_URL: string =
  typeof __API_BASE_URL__ === 'string' ? __API_BASE_URL__ : 'http://localhost:4000';

export const AUTH_MODE: 'local-dev' | 'azure-ad' =
  typeof __AUTH_MODE__ === 'string' ? __AUTH_MODE__ : 'local-dev';
