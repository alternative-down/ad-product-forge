import type { StepModelAdapter } from '../../core/model.js';
export type StepModelMiddleware = (model: StepModelAdapter) => StepModelAdapter;
export declare function applyStepModelMiddlewares(model: StepModelAdapter, middlewares: StepModelMiddleware[]): StepModelAdapter;
export declare function defineStepModelMiddleware(middleware: StepModelMiddleware): StepModelMiddleware;
