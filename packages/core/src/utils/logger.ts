import { pino, Logger, LoggerOptions } from 'pino';

let logger: Logger | null = null;

export function initLogger(level: string = 'info', pretty: boolean = true): Logger {
  const options: LoggerOptions = {
    level,
  };

  if (pretty) {
    logger = pino({
      ...options,
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname',
        },
      },
    });
  } else {
    logger = pino(options);
  }

  return logger;
}

export function getLogger(): Logger {
  if (!logger) {
    logger = initLogger();
  }
  return logger;
}

export function setLogger(newLogger: Logger): void {
  logger = newLogger;
}
