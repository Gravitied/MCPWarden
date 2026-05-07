export type RefExpr = { $ref: string };

export function isRefExpr(value: unknown): value is RefExpr {
  return (
    typeof value === "object" &&
    value !== null &&
    "$ref" in value &&
    typeof (value as { $ref: unknown }).$ref === "string"
  );
}

export function collectRefs(value: unknown, refs: string[] = []): string[] {
  if (isRefExpr(value)) {
    refs.push(value.$ref);
    return refs;
  }

  if (Array.isArray(value)) {
    for (const item of value) collectRefs(item, refs);
    return refs;
  }

  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) collectRefs(item, refs);
  }

  return refs;
}
