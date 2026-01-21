import pino from 'pino';

let logger: pino.Logger | null = null;

export function initLogger(level: string = 'info', pretty: boolean = true): pino.Logger {
  const options: pino.LoggerOptions = {
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

export function getLogger(): pino.Logger {
  if (!logger) {
    logger = initLogger();
  }
  return logger;
}

export function setLogger(newLogger: pino.Logger): void {
  logger = newLogger;
}
