import type { AvatarAnimation, AvatarExpression, AvatarGateway, AvatarMovement } from './avatar.js';

export type AvatarEvent =
  | { type: 'expression'; expression: AvatarExpression; recordedAt: string }
  | { type: 'animation'; animation: AvatarAnimation; recordedAt: string }
  | { type: 'movement'; movement: AvatarMovement; recordedAt: string };

export interface AvatarEventRecorder {
  record(event: AvatarEvent): Promise<void> | void;
}

export class InMemoryAvatarEventRecorder implements AvatarEventRecorder {
  private readonly events: AvatarEvent[] = [];

  async record(event: AvatarEvent): Promise<void> {
    await Promise.resolve();
    this.events.push(event);
  }

  list() {
    return [...this.events];
  }
}

export type RecordingAvatarGatewayOptions = {
  base: AvatarGateway;
  recorder: AvatarEventRecorder;
};

export class RecordingAvatarGateway implements AvatarGateway {
  private readonly base: AvatarGateway;
  private readonly recorder: AvatarEventRecorder;

  constructor(options: RecordingAvatarGatewayOptions) {
    this.base = options.base;
    this.recorder = options.recorder;
  }

  async setExpression(expression: AvatarExpression): Promise<void> {
    await this.base.setExpression(expression);
    await this.recorder.record({
      type: 'expression',
      expression,
      recordedAt: new Date().toISOString(),
    });
  }

  async playAnimation(animation: AvatarAnimation): Promise<void> {
    await this.base.playAnimation(animation);
    await this.recorder.record({
      type: 'animation',
      animation,
      recordedAt: new Date().toISOString(),
    });
  }

  async move(movement: AvatarMovement): Promise<void> {
    await this.base.move(movement);
    await this.recorder.record({
      type: 'movement',
      movement,
      recordedAt: new Date().toISOString(),
    });
  }
}
