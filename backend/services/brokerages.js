// @file backend/services/brokerages.js
// The registry of brokerages the app supports, plus helpers for "which one is this user on?".
//
// Adding a broker: write lib/<broker>.js against the uniform interface, then add one line here.
import * as kite from "../lib/kite.js";
import * as upstox from "../lib/upstox.js";
import BrokerageService from "./brokerage-service.js";

/** Every supported provider, whether configured or not. Order = display order in Profile. */
export const brokerages = [new BrokerageService(upstox), new BrokerageService(kite)];

/** All known provider ids, for validating `:provider` route params. */
export const PROVIDERS = brokerages.map((b) => b.provider);

export const brokerageFor = (provider) => brokerages.find((b) => b.provider === provider) ?? null;

/** Statuses for every provider — what the Profile "Connected accounts" section renders. */
export const brokerageStatuses = (user) => Promise.all(brokerages.map((b) => b.getStatus(user)));

/**
 * The brokerage the user currently has a *usable* connection to, or null. Used by the AI tools so
 * "what are my holdings?" works regardless of which broker they linked. If somehow two are connected,
 * the first in `brokerages` order wins.
 */
export const connectedBrokerage = async (user) => {
  for (const service of brokerages) {
    // Skip unconfigured providers cheaply before touching the database.
    if (!service.isConfigured()) continue;
    const status = await service.getStatus(user);
    if (status.connected) return service;
  }
  return null;
};

/** A compact summary for the AI system prompt: is any broker usable, does one need reconnecting? */
export const brokerageContext = async (user) => {
  let linked = false;
  let needsReauth = false;
  let label = "";
  for (const service of brokerages) {
    if (!service.isConfigured()) continue;
    const status = await service.getStatus(user);
    if (status.connected) {
      linked = true;
      label = service.label;
      break;
    }
    if (status.needsReauth) {
      needsReauth = true;
      label = service.label;
    }
  }
  return { linked, needsReauth, label };
};
