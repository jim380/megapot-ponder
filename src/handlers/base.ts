import { generateEventId } from "../utils/calculations";

export async function handleReorg(event: any, context: any, eventType: string) {
  if (!event.removed) {
    return;
  }

  const eventId = generateEventId(event.transaction.hash, event.log.logIndex);
  const timestamp = Number(event.block.timestamp);

  console.log(
    `Reorg detected for ${eventType} event ${eventId} at block ${event.block.number}`
  );
}
