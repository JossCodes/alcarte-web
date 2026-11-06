export interface RestaurantInput {
  slug: string;
  name: string;
  description: string;
  productLimit: number;
  ownerEmail: string;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function validateRestaurantInput(
  value: unknown,
): RestaurantInput | null {
  if (!isRecord(value)) return null;
  const slug = typeof value.slug === "string" ? value.slug.trim() : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const description = typeof value.description === "string"
    ? value.description.trim()
    : "";
  const ownerEmail = typeof value.ownerEmail === "string"
    ? value.ownerEmail.trim().toLowerCase()
    : "";
  const productLimit = value.productLimit;

  if (
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length < 2 ||
    slug.length > 60
  ) return null;
  if (name.length < 1 || name.length > 120 || description.length > 240) {
    return null;
  }
  if (
    typeof productLimit !== "number" || !Number.isInteger(productLimit) ||
    productLimit < 1 || productLimit > 40
  ) return null;
  if (
    ownerEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(ownerEmail)
  ) return null;

  return { slug, name, description, productLimit, ownerEmail };
}

export function validateRestaurantUpdate(value: unknown) {
  if (!isRecord(value)) return null;
  const id = typeof value.restaurantId === "string" ? value.restaurantId : "";
  const name = typeof value.name === "string" ? value.name.trim() : "";
  const description = typeof value.description === "string"
    ? value.description.trim()
    : "";
  const productLimit = value.productLimit;
  const isActive = value.isActive;
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(id)
  ) return null;
  if (name.length < 1 || name.length > 120 || description.length > 240) {
    return null;
  }
  if (
    typeof productLimit !== "number" || !Number.isInteger(productLimit) ||
    productLimit < 1 || productLimit > 40
  ) return null;
  if (typeof isActive !== "boolean") return null;
  return { restaurantId: id, name, description, productLimit, isActive };
}

export function buildRecoveryUrl(
  appBaseUrl: string,
  tokenHash: string,
): string | null {
  let base: URL;
  try {
    base = new URL(appBaseUrl);
  } catch {
    return null;
  }
  const localHttp = base.protocol === "http:" &&
    ["localhost", "127.0.0.1"].includes(base.hostname);
  if (
    (!localHttp && base.protocol !== "https:") || base.username ||
    base.password || base.pathname !== "/" || base.search || base.hash
  ) return null;
  if (!tokenHash || tokenHash.length > 2048) return null;
  const recovery = new URL("/reset-password", base.origin);
  recovery.hash = new URLSearchParams({
    token_hash: tokenHash,
    type: "recovery",
  }).toString();
  return recovery.toString();
}
