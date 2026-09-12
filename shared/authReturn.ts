// Only known in-app paths survive OAuth; never accept arbitrary redirect URLs.
export function safeReturnTo(value: string | null): string {
  return value && /^\/(?:create|dashboard|profile|chat\/[a-zA-Z0-9-]+|ride\/[a-fA-F0-9-]{36}(?:\?action=join)?)$/.test(value)
    ? value : '/profile';
}
export const signInPath = (destination: string) => '/signin?returnTo=' + encodeURIComponent(safeReturnTo(destination));
