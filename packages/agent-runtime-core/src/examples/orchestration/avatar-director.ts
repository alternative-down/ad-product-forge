import type { StepRecord } from '../../core/types.js';
import type { AvatarGateway } from '../../integrations/gateways/avatar.js';

export type AvatarDirectorOptions = {
  avatar: AvatarGateway;
};

export class AvatarDirector {
  private readonly avatar: AvatarGateway;

  constructor(options: AvatarDirectorOptions) {
    this.avatar = options.avatar;
  }

  async presentStep(record: StepRecord): Promise<void> {
    const hasReasoning = record.modelResponse.segments.some(
      (segment) => segment.kind === 'reasoning',
    );
    const messageSegments = record.modelResponse.segments
      .filter((segment) => segment.kind === 'message')
      .map((segment) => segment.text.trim())
      .filter((text) => text.length > 0);

    if (hasReasoning) {
      await this.avatar.setExpression({
        name: 'thinking',
        intensity: 0.8,
      });
    }

    if (messageSegments.length > 0) {
      await this.avatar.playAnimation({
        name: 'talk',
      });
      return;
    }

    if (record.actionResults.length > 0) {
      await this.avatar.playAnimation({
        name: 'act',
      });
      return;
    }

    await this.avatar.setExpression({
      name: 'neutral',
      intensity: 0.4,
    });
  }
}
