export type CommandEnvelope<TDetails = unknown> =
  | { ok: true; details: TDetails }
  | { ok: false; code: string; message: string; details?: TDetails };

export function printEnvelope(envelope: CommandEnvelope, json = false): void {
  if (json) {
    console.log(JSON.stringify(envelope, null, 2));
    return;
  }

  if (envelope.ok) {
    console.log("OK");
    if (typeof envelope.details === "string") console.log(envelope.details);
    return;
  }

  console.error(`${envelope.code}: ${envelope.message}`);
}
