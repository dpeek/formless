import { Button } from "@dpeek/formless-ui/button";
import { Loader2Icon, RocketIcon } from "lucide-react";
import { useState } from "react";

import {
  triggerLocalSitePublish,
  type LocalSitePublishBrokerConfig,
} from "../client/local-publish.ts";
import { setSyncStatus } from "../client/sync-status.ts";

export function LocalSitePublishControl({ broker }: { broker: LocalSitePublishBrokerConfig }) {
  const [isPublishing, setIsPublishing] = useState(false);

  async function publish() {
    if (isPublishing) {
      return;
    }

    setIsPublishing(true);
    setSyncStatus({ state: "syncing", message: "Publishing Site..." });

    try {
      const result = await triggerLocalSitePublish(broker);
      const target = result.publish.target ?? "configured target";

      setSyncStatus({
        state: "idle",
        message: `Published ${result.publish.sourceRecordCount} records to ${target}.`,
      });
    } catch (error) {
      setSyncStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Publish failed.",
      });
    } finally {
      setIsPublishing(false);
    }
  }

  return (
    <Button
      aria-label="Publish Site through local CLI"
      isDisabled={isPublishing}
      onPress={() => void publish()}
      type="button"
      intent="outline"
    >
      {isPublishing ? (
        <Loader2Icon aria-hidden="true" className="animate-spin" data-icon="inline-start" />
      ) : (
        <RocketIcon aria-hidden="true" data-icon="inline-start" />
      )}
      <span>Publish</span>
    </Button>
  );
}
