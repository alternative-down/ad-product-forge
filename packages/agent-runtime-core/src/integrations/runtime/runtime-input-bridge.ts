import { randomUUID } from 'node:crypto';

import type { RuntimeInput } from '../../core/types.js';

export type RuntimeInputTarget = {
  dispatch<TPayload>(
    input: Omit<RuntimeInput<TPayload>, 'receivedAt'> & { receivedAt?: string },
  ): Promise<void>;
};

export type RuntimeInputBridgeOptions<TEvent> = {
  runtime: RuntimeInputTarget;
  eventToInput(event: TEvent): {
    id?: string;
    type: string;
    payload: Record<string, unknown>;
    receivedAt?: string;
  };
};

export class RuntimeInputBridge<TEvent> {
  private readonly runtime: RuntimeInputTarget;
  private readonly eventToInput: RuntimeInputBridgeOptions<TEvent>['eventToInput'];

  constructor(options: RuntimeInputBridgeOptions<TEvent>) {
    this.runtime = options.runtime;
    this.eventToInput = options.eventToInput;
  }

  async push(event: TEvent) {
    const input = this.eventToInput(event);

    await this.runtime.dispatch({
      id: input.id ?? randomUUID(),
      type: input.type,
      payload: input.payload,
      receivedAt: input.receivedAt,
    });
  }

  createCallback() {
    return async (event: TEvent) => {
      await this.push(event);
    };
  }

  async consume(events: AsyncIterable<TEvent>) {
    for await (const event of events) {
      await this.push(event);
    }
  }
}
