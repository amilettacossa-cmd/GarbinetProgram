import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const VIEWER_HASH = Deno.env.get("VIEWER_PASSWORD_HASH") ?? "";
const ADMIN_HASH = Deno.env.get("ADMIN_PASSWORD_HASH") ?? "";
const SESSION_SECRET = Deno.env.get("SESSION_SECRET") ?? "";
const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const encoder = new TextEncoder();
const allowedBrothers = new Set([
  "Alejandro Montaño", "David Gisbert", "Enrique Llorente",
  "Juan Pablo Campoverde", "Dario Stella", "Leonel Muñiz", "Luis Varela",
  "José Luis Villanueva", "Domingo Figueroa", "Werner Kupke",
  "Alonso Martínez", "Rigo Peidró"
]);

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

function base64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

async function sha256(value: string) {
  return base64url(new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value))));
}

async function hmac(value: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return base64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(value))));
}

async function createToken(role: "viewer" | "admin") {
  const payload = base64url(encoder.encode(JSON.stringify({ role, exp: Date.now() + 12 * 60 * 60 * 1000 })));
  return `${payload}.${await hmac(payload)}`;
}

async function getRole(request: Request) {
  const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const [payload, signature] = token.split(".");
  if (!payload || !signature || signature !== await hmac(payload)) return null;
  try {
    const normal = payload.replaceAll("-", "+").replaceAll("_", "/");
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(normal), c => c.charCodeAt(0))));
    return data.exp > Date.now() && ["viewer", "admin"].includes(data.role) ? data.role : null;
  } catch { return null; }
}

function validMonth(month: unknown): month is string {
  return typeof month === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "Método no permitido." }, 405);
  if (!VIEWER_HASH || !ADMIN_HASH || !SESSION_SECRET || !SUPABASE_URL || !SERVICE_KEY) {
    return json({ error: "La configuración del servidor está incompleta." }, 500);
  }

  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return json({ error: "Solicitud no válida." }, 400); }

  if (body.action === "login") {
    if (body.role !== "viewer" && body.role !== "admin" || typeof body.password !== "string") {
      return json({ error: "Solicitud no válida." }, 400);
    }
    const digest = await sha256(body.password);
    const expectedHex = body.role === "admin" ? ADMIN_HASH : VIEWER_HASH;
    const expectedBytes = new Uint8Array(expectedHex.match(/.{2}/g)!.map(byte => parseInt(byte, 16)));
    if (digest !== base64url(expectedBytes)) return json({ error: "Contraseña incorrecta." }, 401);
    return json({ token: await createToken(body.role) });
  }

  const role = await getRole(request);
  if (!role) return json({ error: "La sesión ha caducado. Vuelve a entrar." }, 401);
  const db = createClient(SUPABASE_URL, SERVICE_KEY);

  if (body.action === "get-program") {
    if (!validMonth(body.month)) return json({ error: "Mes no válido." }, 400);
    const start = `${body.month}-01`;
    const [year, month] = body.month.split("-").map(Number);
    const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    const { data, error } = await db.from("assignments").select("service_date,brother_name").gte("service_date", start).lt("service_date", next).order("service_date");
    if (error) return json({ error: "No se ha podido cargar el programa." }, 500);
    return json({ assignments: data });
  }

  if (body.action === "save-program") {
    if (role !== "admin") return json({ error: "No tienes autorización para guardar." }, 403);
    if (!validMonth(body.month) || !Array.isArray(body.assignments)) return json({ error: "Programa no válido." }, 400);
    const assignments = body.assignments as Array<{ service_date?: unknown; brother_name?: unknown }>;
    const [year, month] = body.month.split("-").map(Number);
    const expectedDates: string[] = [];
    for (let day = new Date(Date.UTC(year, month - 1, 1)); day.getUTCMonth() === month - 1; day.setUTCDate(day.getUTCDate() + 1)) {
      if (day.getUTCDay() === 0 || day.getUTCDay() === 2) expectedDates.push(day.toISOString().slice(0, 10));
    }
    const submittedDates = assignments.map(item => item.service_date).sort();
    const valid = submittedDates.length === expectedDates.length && submittedDates.every((date, index) => date === expectedDates[index]) && assignments.every(item => {
      if (typeof item.service_date !== "string" || typeof item.brother_name !== "string") return false;
      if (!item.service_date.startsWith(`${body.month}-`) || !allowedBrothers.has(item.brother_name)) return false;
      const day = new Date(`${item.service_date}T12:00:00Z`).getUTCDay();
      return day === 0 || day === 2;
    });
    if (!valid) return json({ error: "Completa correctamente todos los martes y domingos." }, 400);
    const start = `${body.month}-01`;
    const next = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    const { error: deleteError } = await db.from("assignments").delete().gte("service_date", start).lt("service_date", next);
    if (deleteError) return json({ error: "No se ha podido actualizar el programa." }, 500);
    const { error: insertError } = await db.from("assignments").insert(assignments);
    if (insertError) return json({ error: "No se ha podido guardar el programa." }, 500);
    return json({ ok: true });
  }

  return json({ error: "Acción no reconocida." }, 400);
});
