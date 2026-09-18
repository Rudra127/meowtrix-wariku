// @file backend/index.js
// IMPORTANT: config must be imported first so .env.<NODE_ENV> is loaded before anything reads process.env.
import { config, reportMissingConfig } from "./config/index.js";

import chalk from "chalk";
import express from "express";
import { createServer } from "http";
import databaseConnection from "./database/connection.js";
import expressApp from "./express-app.js";

const StartServer = async () => {
  reportMissingConfig();

  const app = express();
  const server = createServer(app);

  await databaseConnection();
  await expressApp(app);

  server
    .listen(config.port, () => {
      console.log(chalk.greenBright(`API listening on http://localhost:${config.port} (${config.env})`));
    })
    .on("error", (err) => {
      console.error(err);
      process.exit(1);
    });
};

StartServer();
