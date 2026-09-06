/**
 * A dependency-free structured logger.
 *
 * Services are launched together by `scripts/dev.js`, so every line is prefixed
 * with the service name and colour-coded to stay readable in one terminal.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };

const COLOURS = {
  debug: '[38;5;245m',
  info: '[38;5;37m',
  warn: '[38;5;178m',
  error: '[38;5;167m',
  dim: '[38;5;240m',
  reset: '[0m',
};

const useColour = process.stdout.isTTY && process.env.NO_COLOR === undefined;

/**
 * @param {string} name
 */
export function createLogger(name) {
  const threshold = LEVELS[process.env.LOG_LEVEL ?? 'info'] ?? LEVELS.info;

  const emit = (level, message, error) => {
    if (LEVELS[level] < threshold) return;

    const time = new Date().toISOString().slice(11, 23);
    const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;

    const line = useColour
      ? `${COLOURS.dim}${time}${COLOURS.reset} ${COLOURS[level]}${level.padEnd(5)}${COLOURS.reset} ${COLOURS.dim}${name}${COLOURS.reset} ${message}`
      : `${time} ${level.padEnd(5)} ${name} ${message}`;

    stream.write(`${line}\n`);

    if (error instanceof Error && error.stack && threshold <= LEVELS.debug) {
      stream.write(`${error.stack}\n`);
    }
  };

  return {
    debug: (message) => emit('debug', message),
    info: (message) => emit('info', message),
    warn: (message) => emit('warn', message),
    /** @param {string} message @param {unknown} [error] */
    error: (message, error) => emit('error', message, error),
  };
}
