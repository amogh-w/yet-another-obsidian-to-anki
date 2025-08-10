/** Global debug flag — set to false to silence all logs */
export const DEBUG = false;

/** Prefix for all logs */
const PREFIX = "[YetAnotherObsidianToAnkiPlugin]";

function logWithLevel(level: "log" | "info" | "warn" | "error", ...args: unknown[]) {
  if (!DEBUG) return; // Stop all logs if DEBUG is false
  console[level](PREFIX, ...args);
}

/** Debug log */
export function logDebug(...args: unknown[]) {
  logWithLevel("log", ...args);
}

/** Info log */
export function logInfo(...args: unknown[]) {
  logWithLevel("info", ...args);
}

/** Warning log */
export function logWarn(...args: unknown[]) {
  logWithLevel("warn", ...args);
}

/** Error log */
export function logError(...args: unknown[]) {
  logWithLevel("error", ...args);
}