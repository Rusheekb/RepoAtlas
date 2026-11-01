/**
 * A prototype-less object for maps keyed by untrusted strings (file paths, package names from repositories).
 * Keys like "__proto__" or "constructor" are then stored as ordinary own properties and can never reach
 * Object.prototype.
 */
export function dict<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>
}
