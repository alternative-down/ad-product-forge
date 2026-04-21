import { describe, expect, it } from 'vitest';

import { InMemoryBlobStore } from '../integrations/assets/in-memory-blob-store.js';
import { PersistingVisionGateway } from '../integrations/gateways/persisting-vision.js';

describe('persisting vision gateway', () => {
  it('persists analyzed input images to the blob store', async () => {
    const blobs = new InMemoryBlobStore();
    const gateway = new PersistingVisionGateway({
      vision: {
        async analyze() {
          return {
            text: 'detected castle',
          };
        },
      },
      blobs,
      createBlobMetadata: ({ request, imageIndex, response }) => ({
        prompt: request.prompt,
        imageIndex,
        analysis: response.text,
      }),
    });

    const response = await gateway.analyze({
      prompt: 'describe this image',
      images: [
        {
          mimeType: 'image/png',
          bytes: new Uint8Array([1, 2, 3]),
        },
      ],
    });
    const records = await blobs.list();

    expect(response.text).toBe('detected castle');
    expect(records).toHaveLength(1);
    expect(records[0]?.metadata).toEqual({
      prompt: 'describe this image',
      imageIndex: 0,
      analysis: 'detected castle',
    });
  });
});
