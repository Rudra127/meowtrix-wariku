import "./helpers.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { fieldsFromClerkUser, fieldsFromClerkWebhook } from "../database/repository/user-repository.js";
import UserService from "../services/user-service.js";

const fakeRepo = () => {
  const calls = [];
  return {
    calls,
    updateByClerkId: async (clerkId, updates) => {
      calls.push({ clerkId, updates });
      return { clerkId, ...updates };
    },
  };
};

describe("UserService.updateMe", () => {
  it("applies only whitelisted fields and normalises currency", async () => {
    const repo = fakeRepo();
    const service = new UserService(repo);
    await service.updateMe("user_1", { currency: "usd", isOnboarded: true, role: "admin", email: "x@y.z" });
    assert.deepEqual(repo.calls[0], { clerkId: "user_1", updates: { currency: "USD", isOnboarded: true } });
  });

  it("rejects invalid values", async () => {
    const service = new UserService(fakeRepo());
    await assert.rejects(service.updateMe("user_1", { currency: "dollars" }), { code: "VALIDATION_ERROR" });
    await assert.rejects(service.updateMe("user_1", { isOnboarded: "yes" }), { code: "VALIDATION_ERROR" });
  });

  it("rejects an empty update (cannot escalate role)", async () => {
    const service = new UserService(fakeRepo());
    await assert.rejects(service.updateMe("user_1", { role: "admin" }), { code: "VALIDATION_ERROR" });
  });
});

describe("Clerk → local field mapping", () => {
  it("maps Backend API users, picking the primary email", () => {
    const fields = fieldsFromClerkUser({
      primaryEmailAddressId: "e2",
      emailAddresses: [
        { id: "e1", emailAddress: "old@x.com" },
        { id: "e2", emailAddress: "main@x.com" },
      ],
      firstName: "Asha",
      lastName: null,
      imageUrl: "https://img",
      publicMetadata: { role: "admin" },
    });
    assert.deepEqual(fields, { email: "main@x.com", firstName: "Asha", lastName: "", imageUrl: "https://img", role: "admin" });
  });

  it("maps webhook payloads and never trusts unknown roles", () => {
    const fields = fieldsFromClerkWebhook({
      primary_email_address_id: "e1",
      email_addresses: [{ id: "e1", email_address: "a@x.com" }],
      first_name: "A",
      last_name: "B",
      image_url: "",
      public_metadata: { role: "superuser" },
    });
    assert.equal(fields.role, "user");
    assert.equal(fields.email, "a@x.com");
  });
});

describe("UserService.completeOnboarding", () => {
  it("saves level + goal and marks the user onboarded", async () => {
    const repo = fakeRepo();
    await new UserService(repo).completeOnboarding("user_1", { level: "beginner", goal: "saving", currency: "usd" });
    const { updates } = repo.calls[0];
    assert.equal(updates.level, "beginner");
    assert.equal(updates.goal, "saving");
    assert.equal(updates.currency, "USD");
    assert.equal(updates.isOnboarded, true);
    assert.ok(updates.onboardedAt instanceof Date);
  });

  it("rejects missing/unknown answers with per-field details", async () => {
    const service = new UserService(fakeRepo());
    await assert.rejects(service.completeOnboarding("user_1", { level: "guru", goal: "crypto" }), (err) => {
      assert.equal(err.code, "VALIDATION_ERROR");
      assert.ok(err.details.level && err.details.goal);
      return true;
    });
    await assert.rejects(service.completeOnboarding("user_1", {}), { code: "VALIDATION_ERROR" });
  });

  it("PATCH /users/me can change level/goal later, but only to known values", async () => {
    const repo = fakeRepo();
    await new UserService(repo).updateMe("user_1", { level: "advanced", goal: "investing" });
    assert.deepEqual(repo.calls[0].updates, { level: "advanced", goal: "investing" });
    await assert.rejects(new UserService(fakeRepo()).updateMe("user_1", { goal: "lottery" }), { code: "VALIDATION_ERROR" });
  });
});
