import type { McpGateway, McpSession, McpTransport } from './contracts.js';
export type SdkMcpGatewayOptions = {
    clientName?: string;
    clientVersion?: string;
};
export declare class SdkMcpGateway implements McpGateway {
    private readonly clientName;
    private readonly clientVersion;
    constructor(options?: SdkMcpGatewayOptions);
    createSession(transport: McpTransport): Promise<McpSession>;
}
