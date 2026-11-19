import { describe, expect, it } from "vitest";
import { looksSecret } from "./secret-text";

describe("looksSecret", () => {
  it("catches passwords, keys and card numbers", () => {
    for (const text of [
      "Tr0ub4dor&3",
      "hunter2!Secret",
      "sk-ant-api03-abcdefghijklmnopqrstuvwxyz012345",
      "sk_live_51HabcdefghijklmnopQRSTU",
      "ghp_abcdefghijklmnopqrstuvwxyz0123456789",
      "AKIAIOSFODNN7EXAMPLE",
      "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl0w5N_XgL0n3I9PlFUP0THsR8U",
      "-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----",
      "4111 1111 1111 1111",
    ]) {
      expect(looksSecret(text), text).toBe(true);
    }
  });

  it("keeps ordinary text, links, addresses and IBANs", () => {
    for (const text of [
      "Bitte morgen um 8 Uhr auf der Baustelle sein.",
      "https://example.com/Path?Query=1&x=2",
      "C:\\Users\\steff\\Desktop\\Ablage",
      "info@example.com",
      "DE89 3704 0044 0532 0130 00",
      "Kernbohrung 120mm",
      "+49 171 1234567",
      "Musterstraße 12, 10115 Berlin",
      "1234 5678 9012 3456",
    ]) {
      expect(looksSecret(text), text).toBe(false);
    }
  });
});
