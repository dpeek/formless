import { describe, expect, it } from "vite-plus/test";
import rawCrmSeedRecords from "../../schema/apps/crm/seed-records.json";
import rawCrmSchema from "../../schema/apps/crm/schema.json";
import type { StoredRecord } from "../shared/protocol.ts";
import { isValidStoredFieldValue, parseAppSchema, type AppSchema } from "@dpeek/formless-schema";
import { selectPrimaryScreenModels } from "./views.ts";

const crmSchema = parseAppSchema(rawCrmSchema);
const crmSeedRecords = rawCrmSeedRecords as unknown as StoredRecord[];

describe("crm source schema", () => {
  it("parses the checked-in flat CRM entities", () => {
    expect(Object.keys(crmSchema.entities)).toEqual([
      "company",
      "contact",
      "email-address",
      "audience",
      "subscription",
      "campaign",
      "campaign-message",
      "broadcast",
      "broadcast-recipient",
      "delivery-event",
    ]);
    expect(crmSchema.entities.contact?.fields.company).toMatchObject({
      type: "reference",
      to: "company",
      displayField: "name",
    });
    expect(crmSchema.entities["broadcast-recipient"]?.fields.subscription).toMatchObject({
      type: "reference",
      to: "subscription",
    });
    expect(crmSchema.entities["delivery-event"]?.mutations).toEqual({
      create: { enabled: false },
      patch: { enabled: false },
      delete: { enabled: false },
    });
  });

  it("defines CRM relationship metadata and membership constraints", () => {
    expect(crmSchema.entities["email-address"]?.constraints?.uniqueNormalizedAddress).toEqual({
      kind: "unique",
      fields: ["normalizedAddress"],
    });
    expect(crmSchema.entities.subscription?.constraints?.uniqueEmailAudience).toEqual({
      kind: "unique",
      fields: ["emailAddress", "audience"],
    });
    expect(crmSchema.relationships?.contactEmailAddresses).toMatchObject({
      kind: "toMany",
      from: { entity: "contact" },
      to: { entity: "email-address", field: "contact" },
      inverse: "emailAddressContact",
    });
    expect(crmSchema.relationships?.audienceEmailAddresses).toMatchObject({
      kind: "manyToMany",
      through: {
        entity: "subscription",
        fromField: "audience",
        toField: "emailAddress",
        uniqueConstraint: "uniqueEmailAudience",
      },
    });
    expect(crmSchema.relationships?.broadcastRecipientDeliveryEvents).toMatchObject({
      kind: "toMany",
      from: { entity: "broadcast-recipient" },
      to: { entity: "delivery-event", field: "broadcastRecipient" },
    });
  });

  it("defines generated admin queries, views, and primary workspace screens", () => {
    expect(Object.keys(crmSchema.queries)).toEqual([
      "companyAll",
      "companyCustomers",
      "contactAll",
      "contactLeads",
      "contactCustomers",
      "emailAddressAll",
      "emailAddressActive",
      "audienceAll",
      "audienceActive",
      "subscriptionAll",
      "subscriptionSubscribed",
      "subscriptionUnsubscribed",
      "campaignAll",
      "campaignDraft",
      "campaignActive",
      "campaignMessageAll",
      "campaignMessageReady",
      "broadcastAll",
      "broadcastDraft",
      "broadcastScheduled",
      "broadcastSent",
      "broadcastRecipientAll",
      "broadcastRecipientQueued",
      "broadcastRecipientSent",
      "broadcastRecipientNeedsReview",
      "deliveryEventAll",
      "deliveryEventBounces",
    ]);
    expect(crmSchema.itemViews.contactListItem?.fields).toMatchObject({
      label: { editor: "text", commit: "field-commit" },
      company: { editor: "reference", commit: "immediate" },
      lifecycle: { editor: "enum", commit: "immediate" },
    });
    expect(crmSchema.tableViews.subscriptionTable?.columns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: "referenceField", referenceField: "emailAddress" }),
        expect.objectContaining({ type: "referenceField", referenceField: "audience" }),
        expect.objectContaining({ type: "field", field: "status" }),
      ]),
    );
    expect(crmSchema.views.contactCreate).toMatchObject({
      type: "create",
      entity: "contact",
    });
    const deliveryEventHome = crmSchema.views.deliveryEventHome;
    expect(deliveryEventHome).toMatchObject({
      type: "collection",
      entity: "delivery-event",
    });
    expect(deliveryEventHome?.type === "collection" ? deliveryEventHome.actions : "missing").toBe(
      undefined,
    );

    expect(
      selectPrimaryScreenModels(crmSchema).map((screen) => ({
        label: screen.label,
        path: screen.path,
        sections: screen.layout.sections.map((section) => section.viewName),
      })),
    ).toEqual([
      {
        label: "Contacts",
        path: "/",
        sections: ["contactHome", "emailAddressHome", "companyHome"],
      },
      {
        label: "Audiences",
        path: "/audiences",
        sections: ["audienceHome", "subscriptionHome"],
      },
      {
        label: "Campaigns",
        path: "/campaigns",
        sections: ["campaignHome", "campaignMessageHome"],
      },
      {
        label: "Broadcasts",
        path: "/broadcasts",
        sections: ["broadcastHome", "broadcastRecipientHome", "deliveryEventHome"],
      },
    ]);
  });

  it("keeps demo seed records stored-record shaped and schema-valid", () => {
    expect(crmSeedRecords.map((record) => record.entity)).toEqual([
      "company",
      "company",
      "contact",
      "contact",
      "contact",
      "email-address",
      "email-address",
      "email-address",
      "audience",
      "audience",
      "subscription",
      "subscription",
      "subscription",
      "campaign",
      "campaign-message",
      "broadcast",
      "broadcast-recipient",
      "broadcast-recipient",
      "delivery-event",
      "delivery-event",
      "delivery-event",
    ]);

    expect(validateStoredRecords(crmSchema, crmSeedRecords)).toEqual([]);
  });
});

function validateStoredRecords(schema: AppSchema, records: StoredRecord[]): string[] {
  const errors: string[] = [];
  const recordsById = new Map<string, StoredRecord>();

  for (const record of records) {
    if (record.id.trim() === "") {
      errors.push("empty record id");
      continue;
    }

    if (recordsById.has(record.id)) {
      errors.push(`duplicate record id ${record.id}`);
      continue;
    }

    if (!isIsoTimestamp(record.createdAt)) {
      errors.push(`${record.id} createdAt is not an ISO timestamp`);
    }

    recordsById.set(record.id, record);
  }

  for (const record of records) {
    const entity = schema.entities[record.entity];

    if (!entity) {
      errors.push(`${record.id} references unknown entity ${record.entity}`);
      continue;
    }

    for (const [fieldName, value] of Object.entries(record.values)) {
      if (!entity.fields[fieldName]) {
        errors.push(`${record.id} includes unknown field ${record.entity}.${fieldName}`);
      }

      if (!isFlatStoredValue(value)) {
        errors.push(`${record.id} field ${record.entity}.${fieldName} is not flat`);
      }
    }

    for (const [fieldName, field] of Object.entries(entity.fields)) {
      const value = record.values[fieldName];

      if (!isValidStoredFieldValue(value, field)) {
        errors.push(`${record.id} has invalid field ${record.entity}.${fieldName}`);
        continue;
      }

      if (field.type !== "reference" || value === undefined) {
        continue;
      }

      const target = typeof value === "string" ? recordsById.get(value) : undefined;

      if (!target) {
        errors.push(
          `${record.id} ${record.entity}.${fieldName} references missing record ${value}`,
        );
        continue;
      }

      if (target.entity !== field.to) {
        errors.push(`${record.id} ${record.entity}.${fieldName} must reference ${field.to}`);
      }
    }
  }

  for (const [entityName, entity] of Object.entries(schema.entities)) {
    const entityRecords = records.filter((record) => record.entity === entityName);

    for (const [constraintName, constraint] of Object.entries(entity.constraints ?? {})) {
      if (constraint.kind !== "unique") {
        continue;
      }

      const seen = new Set<string>();

      for (const record of entityRecords) {
        const key = JSON.stringify(constraint.fields.map((fieldName) => record.values[fieldName]));

        if (seen.has(key)) {
          errors.push(`${entityName}.${constraintName} is duplicated by ${record.id}`);
        }

        seen.add(key);
      }
    }
  }

  return errors;
}

function isFlatStoredValue(value: unknown) {
  return ["string", "boolean", "number"].includes(typeof value);
}

function isIsoTimestamp(value: string) {
  return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value);
}
