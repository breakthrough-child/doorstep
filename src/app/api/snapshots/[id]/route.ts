import fs from "node:fs";
import path from "node:path";
import { getEvent } from "@/lib/store";

// Serves a stored snapshot for an event. Images are shown uncropped so the Ring watermark stays intact.
const ALLOWED_ROOTS = ["data", "fixtures", "scenarios"].map((d) => path.resolve(process.cwd(), d) + path.sep);

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const event = getEvent(decodeURIComponent(id));
  if (!event?.snapshotPath) return new Response("Not found", { status: 404 });
  const abs = path.resolve(process.cwd(), event.snapshotPath);
  if (!ALLOWED_ROOTS.some((r) => abs.startsWith(r)) || !fs.existsSync(abs)) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(fs.readFileSync(abs)), {
    headers: {
      "Content-Type": abs.endsWith(".png") ? "image/png" : "image/jpeg",
      "Cache-Control": "private, max-age=3600",
    },
  });
}
