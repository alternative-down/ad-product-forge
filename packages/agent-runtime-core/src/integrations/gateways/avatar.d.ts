export type AvatarExpression = {
    name: string;
    intensity?: number;
};
export type AvatarAnimation = {
    name: string;
    loop?: boolean;
};
export type AvatarMovement = {
    x?: number;
    y?: number;
    z?: number;
    speed?: number;
};
export interface AvatarGateway {
    setExpression(expression: AvatarExpression): Promise<void>;
    playAnimation(animation: AvatarAnimation): Promise<void>;
    move(movement: AvatarMovement): Promise<void>;
}
