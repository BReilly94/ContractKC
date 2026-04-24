/**
 * Minimal ambient declarations so `pnpm typecheck` works without running
 * `pnpm install` in this package. Once dependencies are installed the real
 * @types packages take precedence and these shims become inert.
 *
 * If you add a new import, add its shim here OR install the real @types
 * package and delete the shim entry.
 */

declare module 'react' {
  // Keep ReactNode/FC permissive in the shim — once the real @types/react
  // is installed these shims become inert. exactOptionalPropertyTypes
  // requires the child-type round-trip to be assignable so we use `any`
  // here deliberately (scoped to placeholder, not app code).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type ReactNode = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  export type FC<P = Record<string, unknown>> = (props: P) => any;
  export type ChangeEvent<T = unknown> = { target: T & { value: string } };
  export type FormEvent<T = unknown> = { preventDefault: () => void; target: T };
  export type MouseEvent<T = unknown> = {
    preventDefault: () => void;
    currentTarget: T;
  };
  export function useState<S>(initial: S | (() => S)): [S, (next: S | ((prev: S) => S)) => void];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...args: never[]) => unknown>(
    cb: T,
    deps: readonly unknown[],
  ): T;
  export function useRef<T>(initial: T): { current: T };
  const React: { createElement: (...args: unknown[]) => unknown; Fragment: unknown };
  export default React;
}

declare module 'react/jsx-runtime' {
  export const jsx: (...args: unknown[]) => unknown;
  export const jsxs: (...args: unknown[]) => unknown;
  export const Fragment: unknown;
}

// eslint-disable-next-line @typescript-eslint/no-namespace
declare namespace React {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type ReactNode = any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type FC<P = Record<string, unknown>> = (props: P) => any;
}

declare module 'react-dom/client' {
  export interface Root {
    render(children: unknown): void;
    unmount(): void;
  }
  export function createRoot(container: Element | DocumentFragment): Root;
}

declare namespace JSX {
  interface IntrinsicElements {
    [elemName: string]: Record<string, unknown>;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Element = any;
}

/**
 * Office.js ambient shim — the real @types/office-js exposes the full surface;
 * we declare just what the add-in touches.
 */
declare const Office: {
  onReady(cb?: (info: { host: string; platform: string }) => void): Promise<{
    host: string;
    platform: string;
  }>;
  context: {
    mailbox: {
      item: OfficeItem | null;
      userProfile: { emailAddress: string; displayName: string };
    };
    roamingSettings: {
      get(name: string): unknown;
      set(name: string, value: unknown): void;
      saveAsync(cb?: (res: { status: string }) => void): void;
    };
  };
  MailboxEnums: {
    EmailFileType: {
      readonly Eml: 'eml';
      readonly Mime: 'mime';
      readonly Msg: 'msg';
    };
  };
  AsyncResultStatus: { Succeeded: 'succeeded'; Failed: 'failed' };
  actions: {
    associate(actionId: string, handler: (event: OfficeActionEvent) => void): void;
  };
};

interface OfficeItem {
  itemId: string;
  subject: string;
  from?: { emailAddress: string; displayName: string };
  sender?: { emailAddress: string; displayName: string };
  getAsFileAsync(
    type: 'eml' | 'mime' | 'msg',
    options: { asyncContext?: unknown } | undefined,
    cb: (res: OfficeAsyncResult<string>) => void,
  ): void;
}

interface OfficeAsyncResult<T> {
  status: 'succeeded' | 'failed';
  value: T;
  error?: { name: string; message: string; code: number };
}

interface OfficeActionEvent {
  completed(options?: { allowEvent?: boolean }): void;
}
