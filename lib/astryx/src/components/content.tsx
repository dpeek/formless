import { VStack } from "@astryxdesign/core/VStack";
import { Heading, Text } from "@astryxdesign/core/Text";

export function FormlessMainContent() {
  return (
    <VStack gap={4}>
      <Heading level={1}>Formless</Heading>
      <Text type="body" as="p">
        Astryx shell watcher probe for iterating on the Formless product experience.
      </Text>
    </VStack>
  );
}
