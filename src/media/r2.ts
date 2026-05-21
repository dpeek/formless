import type { MediaObjectStore } from "./core.ts";

export function mediaObjectStoreFromR2Bucket(bucket: R2Bucket): MediaObjectStore {
  return {
    async getObject(key) {
      const object = await bucket.get(key);

      if (!object) {
        return undefined;
      }

      return {
        body: object.body,
        httpEtag: object.httpEtag,
        writeHttpMetadata(headers) {
          object.writeHttpMetadata(headers);
        },
      };
    },
    async putObject(write) {
      await bucket.put(write.key, write.bytes, {
        httpMetadata: {
          cacheControl: write.cacheControl,
          contentType: write.contentType,
        },
      });
    },
  };
}
