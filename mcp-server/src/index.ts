import { main } from "./server.js";
import { getRootLogger, logError } from "./logging/index.js";

const logger = getRootLogger();

process.on("uncaughtException", (error) => {
  logError(logger, error, "Uncaught Exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.fatal(
    {
      reason,
      promise: promise.toString(),
    },
    "Unhandled Promise Rejection"
  );
  process.exit(1);
});

main().catch((error) => {
  logError(logger, error, "Failed to start server from main entry point");
  process.exit(1);
});
