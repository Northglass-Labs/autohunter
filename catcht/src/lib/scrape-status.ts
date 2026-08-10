export function browserFallbackForStatus(status: number): boolean {
  return status === 401 || status === 403 || status === 429;
}
