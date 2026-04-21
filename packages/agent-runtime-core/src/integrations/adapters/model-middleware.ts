import type { StepModelAdapter } from '../../core/model.js';

export type StepModelMiddleware = (model: StepModelAdapter) => StepModelAdapter;

export function applyStepModelMiddlewares(
  model: StepModelAdapter,
  middlewares: StepModelMiddleware[],
): StepModelAdapter {
  let currentModel = model;

  for (let index = middlewares.length - 1; index >= 0; index -= 1) {
    const middleware = middlewares[index];

    if (!middleware) {
      continue;
    }

    currentModel = middleware(currentModel);
  }

  return currentModel;
}

export function defineStepModelMiddleware(
  middleware: StepModelMiddleware,
): StepModelMiddleware {
  return middleware;
}
