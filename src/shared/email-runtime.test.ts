import { describe, expect, it } from "vite-plus/test";
import {
  emailDeliveryIdempotencyScope,
  parseEmailDeliveryScheduleRequest,
  renderEmailDeliveryMessage,
} from "./email-runtime.ts";

describe("email runtime contracts", () => {
  it("normalizes schedule requests without retaining rendered body in the idempotency scope", () => {
    const request = parseEmailDeliveryScheduleRequest({
      messageKind: "site.contactNotification",
      source: {
        storageIdentity: "app:site",
        operationId: "operation_123",
      },
      idempotencyKey: "contact-message-1",
      sender: { id: "email-sender:contact@mail.example.com" },
      recipients: [{ address: " Owner@Example.com ", displayName: "Owner" }],
      replyTo: { address: " Visitor@Example.net " },
      canonicalOrigin: "https://www.example.com/contact",
      message: {
        subject: "New contact message",
        text: "Plain text body",
        html: "<p>HTML body</p>",
      },
    });

    expect(request).toEqual({
      messageKind: "site.contactNotification",
      source: {
        storageIdentity: "app:site",
        operationId: "operation_123",
      },
      idempotencyKey: "contact-message-1",
      sender: { id: "email-sender:contact@mail.example.com" },
      recipients: [{ address: "Owner@example.com", displayName: "Owner" }],
      replyTo: { address: "Visitor@example.net" },
      canonicalOrigin: "https://www.example.com",
      message: {
        subject: "New contact message",
        text: "Plain text body",
        html: "<p>HTML body</p>",
      },
    });
    expect(emailDeliveryIdempotencyScope(request)).toBe(
      ["app:site", "site.contactNotification", "operation_123", "", "contact-message-1"].join("\n"),
    );
    expect(emailDeliveryIdempotencyScope(request)).not.toContain("Plain text body");
  });

  it("rejects invalid visitor reply-to addresses at the boundary", () => {
    expect(() =>
      parseEmailDeliveryScheduleRequest({
        messageKind: "site.contactNotification",
        source: {
          storageIdentity: "app:site",
          recordId: "record_123",
        },
        idempotencyKey: "contact-message-1",
        sender: { id: "email-sender:contact@mail.example.com" },
        recipients: [{ address: "owner@example.com" }],
        replyTo: { address: "not-an-email" },
        canonicalOrigin: "https://www.example.com",
        message: {
          subject: "New contact message",
          text: "Plain text body",
        },
      }),
    ).toThrow("Email delivery reply-to must be a valid email address.");
  });

  it("renders text and HTML message bodies through plain hooks", async () => {
    await expect(
      renderEmailDeliveryMessage(
        {
          canonicalOrigin: "https://www.example.com",
          facts: { name: "Ada" },
          kind: "site.contactNotification",
        },
        {
          "site.contactNotification": ({ canonicalOrigin, facts }) => ({
            subject: `Message from ${(facts as { name: string }).name}`,
            text: `Open ${canonicalOrigin}/admin`,
            html: `<p>Open <a href="${canonicalOrigin}/admin">admin</a></p>`,
          }),
        },
      ),
    ).resolves.toEqual({
      subject: "Message from Ada",
      text: "Open https://www.example.com/admin",
      html: '<p>Open <a href="https://www.example.com/admin">admin</a></p>',
    });
  });
});
