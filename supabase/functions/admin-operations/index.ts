import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.119.0";
import {
  buildRecoveryUrl,
  isRecord,
  validateRestaurantInput,
  validateRestaurantUpdate,
} from "../_shared/validation.ts";

const LOCAL_APP_ORIGINS = new Set([
  "http://localhost:5173",
  "http://127.0.0.1:5173",
]);

function allowedOrigins(): Set<string> {
  const origins = new Set(LOCAL_APP_ORIGINS);
  const configured = Deno.env.get("APP_BASE_URL");
  if (configured) {
    try {
      origins.add(new URL(configured).origin);
    } catch {
      // Invalid configured URLs are rejected when a recovery link is requested.
    }
  }
  return origins;
}

function isAllowedOrigin(origin: string): boolean {
  if (allowedOrigins().has(origin)) return true;
  try {
    const parsed = new URL(origin);
    const loopback = parsed.hostname === "localhost" ||
      parsed.hostname === "127.0.0.1";
    const port = Number(parsed.port);
    const devPort = parsed.port === "4173" || (port >= 5173 && port <= 5190);
    return loopback && parsed.protocol === "http:" && devPort &&
      parsed.origin === origin;
  } catch {
    return false;
  }
}

function responseHeaders(origin: string | null): Headers {
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  });
  if (origin && isAllowedOrigin(origin)) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set(
      "Access-Control-Allow-Headers",
      "authorization, apikey, content-type, x-client-info",
    );
    headers.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  }
  return headers;
}

function json(data: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: responseHeaders(origin),
  });
}

function requiredEnv(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new Error(`Missing server configuration: ${name}`);
  return value;
}

async function cleanupCreatedUser(
  admin: SupabaseClient,
  actorId: string,
  userId: string,
): Promise<boolean> {
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (!error) return true;
  // Record only identifiers/action metadata. Never log email, tokens or links.
  await admin.from("admin_audit_events").insert({
    actor_user_id: actorId,
    action: "owner_provisioning_rollback_failed",
    target_user_id: userId,
  });
  return false;
}

async function createRestaurant(
  admin: SupabaseClient,
  actorId: string,
  body: Record<string, unknown>,
) {
  const input = validateRestaurantInput(body);
  if (!input) {
    return {
      status: 400,
      body: { error: "Revisa los datos del restaurante y del dueño." },
    };
  }

  const { data: priorRestaurant, error: slugLookupError } = await admin
    .from("restaurants").select("id").eq("slug", input.slug).maybeSingle();
  if (slugLookupError) throw slugLookupError;
  if (priorRestaurant) {
    return {
      status: 409,
      body: { error: "Ese identificador ya está en uso." },
    };
  }

  const temporaryPassword = Array.from(
    crypto.getRandomValues(new Uint8Array(32)),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
  const { data: created, error: createError } = await admin.auth.admin
    .createUser({
      email: input.ownerEmail,
      password: temporaryPassword,
      email_confirm: true,
    });
  if (createError || !created.user) {
    if (createError?.status === 422 || createError?.code === "email_exists") {
      return {
        status: 409,
        body: {
          error:
            "Ya existe una cuenta con ese correo. Usa la opción de asignar acceso.",
        },
      };
    }
    throw createError ?? new Error("No se pudo crear la cuenta de acceso.");
  }

  const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "http://localhost:5173";
  const { data: linkData, error: linkError } = await admin.auth.admin
    .generateLink({
      type: "recovery",
      email: input.ownerEmail,
    });
  if (linkError || !linkData.properties?.hashed_token) {
    const rolledBack = await cleanupCreatedUser(
      admin,
      actorId,
      created.user.id,
    );
    return {
      status: 502,
      body: {
        error: "No se pudo preparar la entrega segura de acceso.",
        partialState: !rolledBack,
      },
    };
  }

  const recoveryUrl = buildRecoveryUrl(
    appBaseUrl,
    linkData.properties.hashed_token,
  );
  if (!recoveryUrl) {
    const rolledBack = await cleanupCreatedUser(
      admin,
      actorId,
      created.user.id,
    );
    return {
      status: 500,
      body: {
        error: "La URL de la aplicación no está configurada de forma segura.",
        partialState: !rolledBack,
      },
    };
  }

  const { data: restaurantId, error: createRestaurantError } = await admin.rpc(
    "admin_create_restaurant",
    {
      p_actor_user_id: actorId,
      p_owner_user_id: created.user.id,
      p_slug: input.slug,
      p_name: input.name,
      p_description: input.description,
      p_product_limit: input.productLimit,
    },
  );
  if (createRestaurantError || !restaurantId) {
    const rolledBack = await cleanupCreatedUser(
      admin,
      actorId,
      created.user.id,
    );
    if (createRestaurantError?.code === "23505") {
      return {
        status: 409,
        body: {
          error: "El identificador o la asignación ya existe.",
          partialState: !rolledBack,
        },
      };
    }
    return {
      status: 500,
      body: {
        error: "No se pudo completar el alta del restaurante.",
        partialState: !rolledBack,
      },
    };
  }

  return {
    status: 201,
    body: {
      restaurant: {
        id: restaurantId,
        slug: input.slug,
        name: input.name,
        is_active: true,
        product_limit: input.productLimit,
      },
      owner: { id: created.user.id, email: input.ownerEmail },
      recoveryUrl,
    },
  };
}

async function listRestaurants(admin: SupabaseClient) {
  const { data: restaurants, error } = await admin
    .from("restaurants")
    .select("id,slug,name,description,is_active,product_limit,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  const restaurantIds = (restaurants ?? []).map((restaurant) => restaurant.id);
  if (!restaurantIds.length) return { status: 200, body: { restaurants: [] } };

  const { data: memberships, error: membershipError } = await admin
    .from("restaurant_members").select("restaurant_id,user_id").in(
      "restaurant_id",
      restaurantIds,
    );
  if (membershipError) throw membershipError;
  const users = await Promise.all(
    (memberships ?? []).map(async (membership) => {
      const { data, error: userError } = await admin.auth.admin.getUserById(
        membership.user_id,
      );
      if (userError) return { ...membership, email: null };
      return { ...membership, email: data.user.email ?? null };
    }),
  );
  return {
    status: 200,
    body: {
      restaurants: (restaurants ?? []).map((restaurant) => ({
        ...restaurant,
        owners: users.filter((user) => user.restaurant_id === restaurant.id)
          .map((user) => ({ id: user.user_id, email: user.email })),
      })),
    },
  };
}

async function getRestaurantMenu(admin: SupabaseClient, body: Record<string, unknown>) {
  const restaurantId = typeof body.restaurantId === "string" ? body.restaurantId : "";
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(restaurantId)) return { status: 400, body: { error: "Selecciona un restaurante válido." } };
  const { data: restaurant, error: restaurantError } = await admin.from("restaurants")
    .select("id,slug,name,description,is_active,menu_theme,menu_accent_color,menu_logo_path,menu_cover_path")
    .eq("id", restaurantId).maybeSingle();
  if (restaurantError) throw restaurantError;
  if (!restaurant) return { status: 404, body: { error: "No se encontró el restaurante." } };
  const [{ data: categories, error: categoryError }, productsWithImages] = await Promise.all([
    admin.from("categories").select("id,restaurant_id,name,sort_order,is_visible").eq("restaurant_id", restaurantId).order("sort_order").order("id"),
    admin.from("products").select("id,restaurant_id,category_id,name,description,price_cents,status,sort_order,image_path").eq("restaurant_id", restaurantId).order("sort_order").order("id"),
  ]);
  const productsResult = productsWithImages.error?.code === "42703"
    ? await admin.from("products").select("id,restaurant_id,category_id,name,description,price_cents,status,sort_order").eq("restaurant_id", restaurantId).order("sort_order").order("id")
    : productsWithImages;
  if (categoryError || productsResult.error) throw categoryError ?? productsResult.error;
  return { status: 200, body: { restaurant, categories, products: productsResult.data } };
}

async function updateRestaurant(
  admin: SupabaseClient,
  actorId: string,
  body: Record<string, unknown>,
) {
  const input = validateRestaurantUpdate(body);
  if (!input) {
    return {
      status: 400,
      body: { error: "Revisa nombre, descripción, estado y límite." },
    };
  }
  const { error } = await admin.rpc("admin_update_restaurant", {
    p_actor_user_id: actorId,
    p_restaurant_id: input.restaurantId,
    p_name: input.name,
    p_description: input.description,
    p_product_limit: input.productLimit,
    p_is_active: input.isActive,
  });
  if (error?.code === "23503") {
    return { status: 404, body: { error: "No se encontró el restaurante." } };
  }
  if (error) throw error;
  return { status: 200, body: { ok: true } };
}

async function assignOwner(
  admin: SupabaseClient,
  actorId: string,
  body: Record<string, unknown>,
) {
  const restaurantId = typeof body.restaurantId === "string"
    ? body.restaurantId
    : "";
  const ownerUserId = typeof body.ownerUserId === "string"
    ? body.ownerUserId
    : "";
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(restaurantId) || !uuid.test(ownerUserId)) {
    return {
      status: 400,
      body: {
        error: "El restaurante y el usuario deben ser identificadores válidos.",
      },
    };
  }
  const { data: account, error: lookupError } = await admin.auth.admin
    .getUserById(ownerUserId);
  if (lookupError || !account.user) {
    return {
      status: 404,
      body: { error: "No se encontró la cuenta del dueño." },
    };
  }
  const { error } = await admin.rpc("admin_assign_owner", {
    p_actor_user_id: actorId,
    p_restaurant_id: restaurantId,
    p_owner_user_id: ownerUserId,
  });
  if (error?.code === "23505") {
    return {
      status: 409,
      body: { error: "La cuenta ya tiene un restaurante asignado." },
    };
  }
  if (error?.code === "23503") {
    return {
      status: 404,
      body: { error: "No se encontró el restaurante o la cuenta." },
    };
  }
  if (error) throw error;
  return { status: 200, body: { ok: true } };
}

async function assignOwnerByEmail(
  admin: SupabaseClient,
  actorId: string,
  body: Record<string, unknown>,
) {
  const restaurantId = typeof body.restaurantId === "string"
    ? body.restaurantId
    : "";
  const email = typeof body.ownerEmail === "string"
    ? body.ownerEmail.trim().toLowerCase()
    : "";
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(restaurantId) || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return {
      status: 400,
      body: { error: "Ingresa un restaurante y correo válidos." },
    };
  }

  let matchedUserId: string | null = null;
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 1000,
    });
    if (error) throw error;
    const match = data.users.find((user) =>
      user.email?.toLowerCase() === email
    );
    if (match) {
      matchedUserId = match.id;
      break;
    }
    if (data.users.length < 1000) break;
  }
  if (!matchedUserId) {
    return {
      status: 404,
      body: { error: "No se encontró esa cuenta de acceso." },
    };
  }
  const { error } = await admin.rpc("admin_assign_owner", {
    p_actor_user_id: actorId,
    p_restaurant_id: restaurantId,
    p_owner_user_id: matchedUserId,
  });
  if (error?.code === "23505") {
    return {
      status: 409,
      body: { error: "La cuenta ya tiene un restaurante asignado." },
    };
  }
  if (error?.code === "23503") {
    return {
      status: 404,
      body: { error: "No se encontró el restaurante o la cuenta." },
    };
  }
  if (error) throw error;
  return { status: 200, body: { ok: true } };
}

async function generateRecoveryLink(
  admin: SupabaseClient,
  actorId: string,
  body: Record<string, unknown>,
) {
  const restaurantId = typeof body.restaurantId === "string"
    ? body.restaurantId
    : "";
  const ownerUserId = typeof body.ownerUserId === "string"
    ? body.ownerUserId
    : "";
  const uuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(restaurantId) || !uuid.test(ownerUserId)) {
    return {
      status: 400,
      body: { error: "Selecciona un dueño y restaurante válidos." },
    };
  }
  const { data: membership, error: membershipError } = await admin.from(
    "restaurant_members",
  )
    .select("user_id").eq("restaurant_id", restaurantId).eq(
      "user_id",
      ownerUserId,
    ).maybeSingle();
  if (membershipError) throw membershipError;
  if (!membership) {
    return {
      status: 404,
      body: { error: "El dueño no está asignado a ese restaurante." },
    };
  }

  const { data: account, error: userError } = await admin.auth.admin
    .getUserById(ownerUserId);
  const email = account.user?.email;
  if (userError || !email) {
    return {
      status: 404,
      body: { error: "No se encontró un correo de acceso para ese dueño." },
    };
  }

  const { data: linkData, error: linkError } = await admin.auth.admin
    .generateLink({ type: "recovery", email });
  if (linkError || !linkData.properties?.hashed_token) {
    return {
      status: 502,
      body: { error: "No se pudo generar el enlace temporal." },
    };
  }
  const recoveryUrl = buildRecoveryUrl(
    Deno.env.get("APP_BASE_URL") ?? "http://localhost:5173",
    linkData.properties.hashed_token,
  );
  if (!recoveryUrl) {
    return {
      status: 500,
      body: {
        error: "La URL de la aplicación no está configurada de forma segura.",
      },
    };
  }

  const { error: auditError } = await admin.rpc("admin_record_recovery_event", {
    p_actor_user_id: actorId,
    p_restaurant_id: restaurantId,
    p_target_user_id: ownerUserId,
  });
  if (auditError) throw auditError;
  return { status: 200, body: { recoveryUrl, expiresInSeconds: 3600 } };
}

Deno.serve(async (request: Request) => {
  const origin = request.headers.get("Origin");
  const headers = responseHeaders(origin);
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers });
  }
  if (origin && !isAllowedOrigin(origin)) {
    return json({ error: "Origen no permitido." }, 403, null);
  }
  if (request.method !== "POST") {
    return json({ error: "Método no permitido." }, 405, origin);
  }

  const authHeader = request.headers.get("Authorization") ?? "";
  const bearer = authHeader.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!bearer) return json({ error: "Sesión requerida." }, 401, origin);

  let body: unknown;
  try {
    if (Number(request.headers.get("Content-Length") ?? 0) > 16_384) {
      return json({ error: "Solicitud demasiado grande." }, 413, origin);
    }
    body = await request.json();
  } catch {
    return json({ error: "La solicitud debe ser JSON válido." }, 400, origin);
  }
  if (!isRecord(body) || typeof body.action !== "string") {
    return json({ error: "Acción no válida." }, 400, origin);
  }

  let actorId = "";
  try {
    const url = requiredEnv("SUPABASE_URL");
    const anonKey = requiredEnv("SUPABASE_ANON_KEY");
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const caller = createClient(url, anonKey, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    const { data: { user }, error: identityError } = await caller.auth.getUser(
      bearer,
    );
    if (identityError || !user) {
      return json({ error: "La sesión no es válida o venció." }, 401, origin);
    }
    actorId = user.id;
    const { data: role, error: roleError } = await caller.from(
      "platform_admins",
    )
      .select("user_id").eq("user_id", actorId).maybeSingle();
    if (roleError || !role) {
      return json(
        { error: "No tienes permisos de administración." },
        403,
        origin,
      );
    }

    const admin = createClient(url, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
        detectSessionInUrl: false,
      },
    });
    let result: { status: number; body: unknown };
    switch (body.action) {
      case "listRestaurants":
        result = await listRestaurants(admin);
        break;
      case "getRestaurantMenu":
        result = await getRestaurantMenu(admin, body);
        break;
      case "createRestaurant":
        result = await createRestaurant(admin, actorId, body);
        break;
      case "updateRestaurant":
        result = await updateRestaurant(admin, actorId, body);
        break;
      case "assignOwner":
        result = await assignOwner(admin, actorId, body);
        break;
      case "assignOwnerByEmail":
        result = await assignOwnerByEmail(admin, actorId, body);
        break;
      case "generateRecoveryLink":
        result = await generateRecoveryLink(admin, actorId, body);
        break;
      default:
        return json({ error: "Acción no reconocida." }, 400, origin);
    }
    return json(result.body, result.status, origin);
  } catch (error) {
    const code = typeof error === "object" && error !== null && "code" in error
      ? String(error.code)
      : "unknown";
    console.error("Admin operation failed", {
      action: body.action,
      actorId: actorId || null,
      code,
    });
    return json(
      { error: "No se pudo completar la operación administrativa." },
      500,
      origin,
    );
  }
});
