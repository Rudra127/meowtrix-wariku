// @file backend/scripts/check-groww.js
// Proves the Groww credentials work end to end, without touching the app or the database.
// Run: npm run groww:check
//
// It exists because one detail is genuinely ambiguous in Groww's docs: the Authorization header on
// the token endpoint is described only as "User API Key", which could mean `Bearer <key>` or the bare
// key. Rather than guess, this script tries the configured form and, if that is rejected, retries
// with the other one and tells you which worked.
//
// Never prints the key, the secret, or the access token.
import "../config/index.js";

import chalk from "chalk";
import { config, isGrowwConfigured } from "../config/index.js";
import * as groww from "../lib/groww.js";
import GrowwService from "../services/groww-service.js";

const rupees = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const ok = (msg) => console.log(`${chalk.green("✓")} ${msg}`);
const bad = (msg) => console.log(`${chalk.red("✗")} ${msg}`);
const note = (msg) => console.log(`  ${chalk.gray(msg)}`);

const run = async () => {
  console.log(chalk.bold("\nGroww credential check\n"));

  if (!isGrowwConfigured()) {
    bad("GROWW_API_KEY / GROWW_API_SECRET are not set in backend/.env.dev");
    note("Generate them at groww.in -> Settings -> Trading APIs -> Generate API key,");
    note("then add both to backend/.env.dev and re-run. A Trading API subscription is required.");
    process.exitCode = 1;
    return;
  }
  ok("Credentials are present");
  note(`Base URL: ${config.groww.baseUrl}`);
  note(
    config.groww.ownerEmail
      ? `Portfolio restricted to: ${config.groww.ownerEmail}`
      : "GROWW_PORTFOLIO_OWNER_EMAIL is blank — every signed-in user would see these holdings"
  );

  // --- 1. Mint a token, trying both header forms ------------------------------------------
  const configuredRaw = process.env.GROWW_RAW_AUTH_HEADER === "1";
  let session = null;

  for (const useRaw of [configuredRaw, !configuredRaw]) {
    process.env.GROWW_RAW_AUTH_HEADER = useRaw ? "1" : "0";
    const form = useRaw ? "bare API key" : "Bearer <API key>";
    try {
      session = await groww.createAccessToken();
      ok(`Access token minted using the ${form} Authorization header`);
      if (useRaw !== configuredRaw) {
        console.log(
          chalk.yellow(
            `  → Add GROWW_RAW_AUTH_HEADER=${useRaw ? "1" : "0"} to backend/.env.dev so the app uses this form.`
          )
        );
      }
      break;
    } catch (err) {
      bad(`Token mint failed with the ${form} header: ${err?.message}`);
    }
  }

  if (!session) {
    note("Both header forms were rejected. Most likely causes, in order:");
    note("  1. No active Trading API subscription on the Groww account (₹499 + tax / month).");
    note("  2. The API key needs its daily approval on the Groww Cloud API keys page.");
    note("  3. The key or secret was copied with a stray space or newline.");
    process.exitCode = 1;
    return;
  }
  note(`Token expires: ${session.expiresAt.toISOString()}`);
  if (session.sessionName) note(`Session: ${session.sessionName}`);

  // --- 2. Holdings -------------------------------------------------------------------------
  const service = new GrowwService();
  let portfolio;
  try {
    portfolio = await service.getPortfolio();
    ok(`Holdings read: ${portfolio.count} holding(s)`);
  } catch (err) {
    bad(`Holdings read failed: ${err?.message}`);
    process.exitCode = 1;
    return;
  }

  if (portfolio.count === 0) {
    note("The account holds no equity. That is a valid answer, but it means the AI has nothing to");
    note("analyse — consider testing with an account that has holdings.");
  } else {
    console.log(chalk.bold("\n  Holdings"));
    for (const h of portfolio.holdings.slice(0, 15)) {
      const pnl = h.priced ? `${h.pnl >= 0 ? "+" : ""}${rupees(h.pnl)} (${h.pnlPct}%)` : chalk.yellow("no live price");
      console.log(
        `   ${h.symbol.padEnd(14)} ${String(h.quantity).padStart(6)} @ ${rupees(h.averagePrice).padStart(12)}  ` +
          `now ${rupees(h.currentValue).padStart(12)}  ${pnl}`
      );
    }
    if (portfolio.holdings.length > 15) note(`… and ${portfolio.holdings.length - 15} more`);

    console.log(chalk.bold("\n  Totals"));
    note(`Invested: ${rupees(portfolio.investedValue)}`);
    note(`Current:  ${rupees(portfolio.currentValue)}`);
    note(`P&L:      ${portfolio.pnl >= 0 ? "+" : ""}${rupees(portfolio.pnl)} (${portfolio.pnlPct}%)`);
  }

  if (!portfolio.pricesComplete && portfolio.count > 0) {
    console.log(
      chalk.yellow(`\n  ⚠ ${portfolio.unpricedCount} holding(s) had no live price, so their current value shows cost.`)
    );
    note("Usually the market being closed, or live data not being on the subscription.");
    note("The assistant is told to caveat totals when this happens.");
  }

  // --- 3. Positions (optional; an empty book is normal) -----------------------------------
  try {
    const positions = await service.getPositions();
    ok(`Positions read: ${positions.count} open position(s)`);
  } catch (err) {
    bad(`Positions read failed (not fatal): ${err?.message}`);
  }

  console.log(chalk.greenBright("\nGroww is wired up correctly.\n"));
};

run().catch((err) => {
  console.error(chalk.red("\nUnexpected failure:"), err);
  process.exitCode = 1;
});
