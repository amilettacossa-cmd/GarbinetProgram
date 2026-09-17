import "jsr:@supabase/functions-js/edge-runtime.d.ts";
const encoder = new TextEncoder();
const brothers = new Set([
  "Alejandro Montaño", "David Gisbert", "Enrique Llorente",
  "Juan Pablo Campoverde", "Dario Stella", "Leonel Muñiz", "Luis Varela",
  "José Luis Villanueva", "Domingo Figueroa", "Werner Kupke",
  "Alonso Martínez", "Rigo Peidró",
]);
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: {
    ...cors, "Content-Type": "application/json", "Cache-Control": "no-store",
  }});
}
function encode64(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
function decode64(value: string) {
  const normal = value.replaceAll("-", "+").replaceAll("_", "/");
  return Uint8Array.from(atob(normal.padEnd(Math.ceil(normal.length / 4) * 4, "=")), c => c.charCodeAt(0));
}
async function passwordHash(password: string) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(password));
  return Array.from(new Uint8Array(digest)).map(byte => byte.toString(16).padStart(2, "0")).join("");
}
async function signingKey(secret: string) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign", "verify"]);
}
async function createToken(role: string, secret: string) {
  const payload = encode64(encoder.encode(JSON.stringify({ role, exp: Date.now() + 12 * 60 * 60 * 1000 })));
  const signature = await crypto.subtle.sign("HMAC", await signingKey(secret), encoder.encode(payload));
  return `${payload}.${encode64(new Uint8Array(signature))}`;
}
async function getRole(request: Request, secret: string) {
  try {
    const token = request.headers.get("Authorization")?.replace(/^Bearer\s+/i, "") ?? "";
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payload, signature] = parts;
    if (!await crypto.subtle.verify("HMAC", await signingKey(secret), decode64(signature), encoder.encode(payload))) return null;
    const data = JSON.parse(new TextDecoder().decode(decode64(payload)));
    if (typeof data.exp !== "number" || data.exp <= Date.now() || !["viewer", "admin"].includes(data.role)) return null;
    return data.role;
  } catch { return null; }
}
function meetingDates(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const dates: string[] = [];
  const day = new Date(Date.UTC(year, monthNumber - 1, 1));
  while (day.getUTCMonth() === monthNumber - 1) {
    if ([0, 4].includes(day.getUTCDay())) dates.push(day.toISOString().slice(0, 10));
    day.setUTCDate(day.getUTCDate() + 1);
  }
  return dates;
}
Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return reply({ error: "Método no permitido." }, 405);
  try {
    const viewerHash = Deno.env.get("VIEWER_PASSWORD_HASH") ?? "";
    const adminHash = Deno.env.get("ADMIN_PASSWORD_HASH") ?? "";
    const secret = Deno.env.get("SESSION_SECRET") ?? "";
    const projectUrl = Deno.env.get("SUPABASE_URL") ?? "";
    let databaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    if (!databaseKey) {
      const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
      const candidate = keys.default || Object.values(keys)[0];
      databaseKey = typeof candidate === "string" ? candidate : "";
    }
    if (!/^[a-f0-9]{64}$/i.test(viewerHash) || !/^[a-f0-9]{64}$/i.test(adminHash) || secret.length < 32 || !projectUrl || !databaseKey) {
      return reply({ error: "La configuración del servidor está incompleta." }, 500);
    }
    let body;
    try { body = await request.json(); } catch { return reply({ error: "Solicitud no válida." }, 400); }
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply({ error: "Solicitud no válida." }, 400);
    if (body.action === "login") {
      if (!["viewer", "admin"].includes(body.role) || typeof body.password !== "string" || body.password.length > 256) return reply({ error: "Solicitud no válida." }, 400);
      const expected = body.role === "admin" ? adminHash : viewerHash;
      if (await passwordHash(body.password) !== expected.toLowerCase()) return reply({ error: "Contraseña incorrecta." }, 401);
      return reply({ token: await createToken(body.role, secret) });
    }
    const role = await getRole(request, secret);
    if (!role) return reply({ error: "La sesión ha caducado. Vuelve a entrar." }, 401);
    if (typeof body.month !== "string" || !/^(20\d{2}|21\d{2})-(0[1-9]|1[0-2])$/.test(body.month)) return reply({ error: "Mes no válido." }, 400);
    const headers: Record<string, string> = { apikey: databaseKey, "Content-Type": "application/json" };
    if (!databaseKey.startsWith("sb_secret_")) headers.Authorization = `Bearer ${databaseKey}`;
    const tableUrl = `${projectUrl}/rest/v1/assignments`;
    if (body.action === "get-program") {
      const [year, monthNumber] = body.month.split("-").map(Number);
      const nextMonth = new Date(Date.UTC(year, monthNumber, 1)).toISOString().slice(0, 10);
      const url = new URL(tableUrl);
      url.searchParams.set("select", "service_date,brother_name");
      url.searchParams.append("service_date", `gte.${body.month}-01`);
      url.searchParams.append("service_date", `lt.${nextMonth}`);
      url.searchParams.set("order", "service_date.asc");
      const result = await fetch(url, { headers });
      if (!result.ok) return reply({ error: "No se ha podido cargar el programa." }, 500);
      return reply({ assignments: await result.json() });
    }
    if (body.action === "save-program") {
      if (role !== "admin") return reply({ error: "No tienes autorización para guardar." }, 403);
      const expectedDates = meetingDates(body.month);
      const items = body.assignments;
      if (!Array.isArray(items) || items.length !== expectedDates.length || items.some(item => !item || typeof item.service_date !== "string" || typeof item.brother_name !== "string" || !brothers.has(item.brother_name))) {
        return reply({ error: "Completa todos los jueves y domingos." }, 400);
      }
      const submittedDates = items.map(item => item.service_date).sort();
      if (submittedDates.some((date, index) => date !== expectedDates[index])) return reply({ error: "Las fechas del programa no son válidas." }, 400);
      const updatedAt = new Date().toISOString();
      const assignments = items.map(item => ({ service_date: item.service_date, brother_name: item.brother_name, updated_at: updatedAt }));
      const result = await fetch(`${tableUrl}?on_conflict=service_date`, {
        method: "POST", headers: { ...headers, Prefer: "resolution=merge-duplicates,return=minimal" }, body: JSON.stringify(assignments),
      });
      if (!result.ok) return reply({ error: "No se ha podido guardar el programa." }, 500);
      return reply({ ok: true });
    }
    return reply({ error: "Acción no reconocida." }, 400);
  } catch { return reply({ error: "Error del servidor. Inténtalo de nuevo." }, 500); }
});
