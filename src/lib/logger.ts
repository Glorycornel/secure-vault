const isDev = process.env.NODE_ENV !== "production";

type LogArgs = unknown[];

export function devLog(...args: LogArgs) {
  if (isDev) {
    console.log(...args);
  }
}

export function devWarn(...args: LogArgs) {
  if (isDev) {
    console.warn(...args);
  }
}

export function devError(...args: LogArgs) {
  if (isDev) {
    console.error(...args);
  }
}
