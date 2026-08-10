export function collectorSearch<
  T extends { ownerId?: unknown; ownerName?: unknown },
>(search: T): Omit<T, "ownerId" | "ownerName"> {
  const collectorFields: Partial<T> = { ...search };
  delete collectorFields.ownerId;
  delete collectorFields.ownerName;
  return collectorFields as Omit<T, "ownerId" | "ownerName">;
}
