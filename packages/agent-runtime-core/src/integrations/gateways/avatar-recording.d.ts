import type { AvatarAnimation, AvatarExpression, AvatarGateway, AvatarMovement } from './avatar.js';
export type AvatarEvent = {
    type: 'expression';
    expression: AvatarExpression;
    recordedAt: string;
} | {
    type: 'animation';
    animation: AvatarAnimation;
    recordedAt: string;
} | {
    type: 'movement';
    movement: AvatarMovement;
    recordedAt: string;
};
export interface AvatarEventRecorder {
    record(event: AvatarEvent): Promise<void> | void;
}
export declare class InMemoryAvatarEventRecorder implements AvatarEventRecorder {
    private readonly events;
    record(event: AvatarEvent): Promise<void>;
    list(): AvatarEvent[];
}
export type RecordingAvatarGatewayOptions = {
    base: AvatarGateway;
    recorder: AvatarEventRecorder;
};
export declare class RecordingAvatarGateway implements AvatarGateway {
    private readonly base;
    private readonly recorder;
    constructor(options: RecordingAvatarGatewayOptions);
    setExpression(expression: AvatarExpression): Promise<void>;
    playAnimation(animation: AvatarAnimation): Promise<void>;
    move(movement: AvatarMovement): Promise<void>;
}
