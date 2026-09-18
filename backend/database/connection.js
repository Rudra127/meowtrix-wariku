// @file backend/database/connection.js
import dns from "node:dns";
import mongoose from "mongoose";
import { config } from "../config/index.js";

/**
 * Some networks/ISPs refuse DNS SRV queries, which breaks `mongodb+srv://` URIs with
 * `querySrv EREFUSED`. Set `DNS_SERVERS=1.1.1.1,8.8.8.8` in .env.<NODE_ENV> to force Node
 * to use those resolvers directly. Leave unset to use the system DNS.
 */
const applyDnsOverride = () => {
  const raw = process.env.DNS_SERVERS?.trim();
  if (!raw) return;
  const servers = raw.split(",").map((s) => s.trim()).filter(Boolean);
  if (!servers.length) return;
  try {
    dns.setServers(servers);
    console.log(`ℹ️  Using DNS servers: ${servers.join(", ")}`);
  } catch (err) {
    console.warn(`⚠️  Could not set DNS servers (${err.message}) — falling back to system DNS`);
  }
};

const databaseConnection = async () => {
  if (!config.mongoUri) {
    if (config.isProd) {
      console.error("❌ MONGODB_URI is required in production");
      process.exit(1);
    }
    console.warn("⚠️  MONGODB_URI not set — starting without a database (authenticated routes will fail)");
    return;
  }

  applyDnsOverride();

  try {
    await mongoose.connect(config.mongoUri, { serverSelectionTimeoutMS: 10_000 });
    console.log("✅ Database connected");
  } catch (error) {
    console.error("❌ Database connection failed:", error.message);
    if (error.message?.includes("querySrv")) {
      console.error(
        "   ↳ SRV DNS lookup was refused by your resolver. Fixes:\n" +
          "     • Set DNS_SERVERS=1.1.1.1,8.8.8.8 in backend/.env.dev and re-run\n" +
          "     • Or switch to the non-SRV connection string from Atlas (Connect → Drivers → older Node.js)\n" +
          "     • Or switch to a different network / disable VPN"
      );
    }
    if (config.isProd) process.exit(1);
  }
};

export default databaseConnection;
