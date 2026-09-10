import { HttpError } from '../lib/errors.js';
import { config } from '../config.js';

export function notFoundHandler(req, res) {
  res.status(404).json({ error: { message: `No route for ${req.method} ${req.path}`, status: 404 } });
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
export function errorHandler(error, req, res, next) {
  const status = error instanceof HttpError ? error.status : 500;
  if (status >= 500 && config.env !== 'test') console.error(error);
  res.status(status).json({
    error: {
      message: status >= 500 ? 'Something went wrong on our side' : error.message,
      status,
      ...(error.details ? { details: error.details } : {}),
    },
  });
}
