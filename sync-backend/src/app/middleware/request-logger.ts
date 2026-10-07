import { pinoHttp } from 'pino-http';
import { logger } from '../../infrastructure/logger/logger.js';

/**
 * Access logging.
 *
 * Only a small allowlist of request fields is serialized — headers carrying
 * credentials never reach the log, and the join route's raw token lives in the
 * path, so the path is reported as the matched route where possible.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req) => (req as { requestId?: string }).requestId ?? 'unknown',
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: () => 'request completed',
  autoLogging: {
    ignore: (req) => req.url === '/health' || req.url === '/ready',
  },
  serializers: {
    req(req) {
      const rawUrl = typeof req.url === 'string' ? req.url : '';
      return {
        id: req.id,
        method: req.method,
        // The join routes embed the raw credential in the path — mask it.
        url: rawUrl.replace(/\/join\/[^/?]+/, '/join/[redacted]'),
        remoteAddress: req.remoteAddress,
      };
    },
    res(res) {
      return { statusCode: res.statusCode };
    },
  },
});
