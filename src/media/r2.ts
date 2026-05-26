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
        customMetadata: object.customMetadata,
        httpEtag: object.httpEtag,
        writeHttpMetadata(headers) {
          object.writeHttpMetadata(headers);
        },
      };
    },
    async listObjects(options) {
      const listing = await bucket.list({
        limit: options.limit,
        prefix: options.prefix,
      });
      const objects = await Promise.all(
        listing.objects.map(async (object) => {
          const metadataObject =
            object.customMetadata === undefined || object.httpMetadata === undefined
              ? await bucket.head(object.key)
              : object;

          return {
            contentType: metadataObject?.httpMetadata?.contentType,
            customMetadata: metadataObject?.customMetadata,
            key: object.key,
            size: object.size,
          };
        }),
      );

      return {
        objects,
      };
    },
    async putObject(write) {
      await bucket.put(write.key, write.bytes, {
        httpMetadata: {
          cacheControl: write.cacheControl,
          contentType: write.contentType,
        },
        ...(write.customMetadata ? { customMetadata: write.customMetadata } : {}),
      });
    },
  };
}
