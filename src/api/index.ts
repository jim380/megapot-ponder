import { db } from "ponder:api";
import schema from "ponder:schema";
import { Hono } from "hono";
import { client, graphql } from "ponder";
import {
  validateRoundIntegrity,
  validateWinner,
  assignTicketNumbers,
} from "./integrity";
import {
  getUserTickets,
  getTicketOwner,
  getRoundTicketHolders,
} from "./tickets";
import { calculateTicketNumbers, findWinnerByBps } from "./ticket-numbering";

const app = new Hono();

app.use("/sql/*", client({ db, schema }));

app.use("/", graphql({ db, schema }));
app.use("/graphql", graphql({ db, schema }));

app.get("/api/integrity/round/:roundId", async (c) => {
  const roundId = c.req.param("roundId");
  const result = await validateRoundIntegrity(roundId);
  return c.json(result);
});

app.post("/api/integrity/validate-winner", async (c) => {
  const { roundId, winnerAddress, winningTicketNumber } = await c.req.json();
  const result = await validateWinner(
    roundId,
    winnerAddress,
    BigInt(winningTicketNumber)
  );
  return c.json(result);
});

app.post("/api/integrity/assign-tickets/:roundId", async (c) => {
  const roundId = c.req.param("roundId");
  const result = await assignTicketNumbers(roundId);
  return c.json(result);
});

app.get("/api/tickets/user/:userAddress", async (c) => {
  const userAddress = c.req.param("userAddress");
  const roundId = c.req.query("roundId");
  const result = await getUserTickets(userAddress, roundId);
  return c.json(result);
});

app.get("/api/tickets/owner/:roundId/:ticketNumber", async (c) => {
  const roundId = c.req.param("roundId");
  const ticketNumber = c.req.param("ticketNumber");
  const result = await getTicketOwner(roundId, BigInt(ticketNumber));
  return c.json(result);
});

app.get("/api/tickets/round/:roundId/holders", async (c) => {
  const roundId = c.req.param("roundId");
  const result = await getRoundTicketHolders(roundId);
  return c.json(result);
});

app.get("/api/tickets/round/:roundId/numbers", async (c) => {
  const roundId = c.req.param("roundId");
  const result = await calculateTicketNumbers(roundId);
  return c.json(result);
});

app.get("/api/tickets/round/:roundId/winner/:bps", async (c) => {
  const roundId = c.req.param("roundId");
  const bps = c.req.param("bps");
  const result = await findWinnerByBps(roundId, BigInt(bps));
  return c.json(result);
});

export default app;
