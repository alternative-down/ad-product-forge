export function buildGatewayModelId(gatewayId: string, providerId: string, modelId: string) {
  return `${gatewayId}/${providerId}/${modelId}`;
}
