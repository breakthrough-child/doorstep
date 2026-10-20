// Map Ring Partner API resources to Doorstep's domain model.
// Field names follow the published schema (api-documentation.html, Oct 2026); where the docs
// and the Playground disagree we follow the Playground and log it in FRICTION_LOG.md.

import type { DoorEvent, EventKind, EventOrigin } from "../types";
import { asArray, indexIncluded, resolveOne, type Document, type Resource } from "./jsonapi";

export interface RingDeviceAttributes {
  name?: string;
  image_url?: string;
  [k: string]: unknown;
}

export interface RingStatusAttributes {
  online?: boolean;
  [k: string]: unknown;
}

export interface RingCapabilitiesAttributes {
  video?: { codecs?: string[]; max_resolution?: number; supported_resolutions?: number[]; ratio?: string };
  motion_detection?: { configurations?: unknown };
  image_enhancements?: { configurations?: unknown };
  components?: { items?: Array<{ component_id: string; component_type: string; component_name: string }> };
  [k: string]: unknown;
}

export interface RingConfigurationsAttributes {
  e2e_encryption?: { enabled?: boolean };
  motion_detection?: { enabled?: string };
  image_enhancements?: { privacy_zones?: Array<{ id: string; vertices: Array<{ x: number; y: number }> }> };
  [k: string]: unknown;
}

export interface RingHistoryEventAttributes {
  event_type?: string;
  sub_type?: string;
  start?: number | string;
  end?: number | string;
  is_third_party_reviewed?: boolean;
  [k: string]: unknown;
}

export interface Device {
  id: string;
  name: string;
  imageUrl: string | null;
  online: boolean | null;
  /** Camera components on multi-lens devices; empty for single-lens. */
  components: Array<{ id: string; name: string }>;
  privacyZoneCount: number;
  e2eEncrypted: boolean;
  maxResolution: number | null;
}

export function normalizeDevices(doc: Document<RingDeviceAttributes>): Device[] {
  const idx = indexIncluded(doc);
  return asArray(doc.data).map((d) => {
    const status = resolveOne<RingStatusAttributes>(d, "status", idx);
    const caps = resolveOne<RingCapabilitiesAttributes>(d, "capabilities", idx);
    const conf = resolveOne<RingConfigurationsAttributes>(d, "configurations", idx);
    return {
      id: d.id,
      name: d.attributes?.name?.trim() || "Ring camera",
      imageUrl: d.attributes?.image_url ?? null,
      online: typeof status?.attributes?.online === "boolean" ? status.attributes.online : null,
      components: (caps?.attributes?.components?.items ?? []).map((c) => ({ id: c.component_id, name: c.component_name })),
      privacyZoneCount: conf?.attributes?.image_enhancements?.privacy_zones?.length ?? 0,
      // Docs: JSON boolean — compare to true, never to a string.
      e2eEncrypted: conf?.attributes?.e2e_encryption?.enabled === true,
      maxResolution: caps?.attributes?.video?.max_resolution ?? null,
    };
  });
}

/**
 * Map Ring's event type (+ optional subtype) to a Doorstep EventKind.
 * Accepts every spelling we've seen across docs/webhooks/history: "motion" + sub_type "human",
 * dotted "motion.human", webhook-style "package_delivery", and "ding"/"button_press".
 */
export function mapEventKind(eventType: string, subType?: string | null): EventKind {
  const [base, dotted] = eventType.toLowerCase().split(".", 2) as [string, string | undefined];
  const sub = (subType ?? dotted ?? "").toLowerCase();
  if (base === "ding" || base === "button_press" || base === "doorbell") return "ding";
  if (base === "on_demand" || base === "live_view") return "on_demand";
  if (base.includes("package") || sub.includes("package")) return "package";
  if (base === "motion" || base === "motion_detected") {
    if (sub === "human" || sub === "person") return "person";
    if (sub === "vehicle") return "vehicle";
    if (sub === "animal") return "animal";
    return "motion";
  }
  if (base === "human" || base === "person") return "person";
  if (base === "vehicle") return "vehicle";
  return "motion";
}

function toMs(v: number | string | undefined): number | null {
  if (v === undefined || v === null) return null;
  if (typeof v === "number") return v < 1e12 ? v * 1000 : v; // tolerate epoch seconds
  const n = Number(v);
  if (!Number.isNaN(n)) return n < 1e12 ? n * 1000 : n;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

export function normalizeHistoryEvents(
  doc: Document<RingHistoryEventAttributes>,
  fallbackDeviceId: string,
  origin: EventOrigin,
): DoorEvent[] {
  return asArray(doc.data).flatMap((r: Resource<RingHistoryEventAttributes>) => {
    const a = r.attributes ?? {};
    const start = toMs(a.start);
    if (start === null) return [];
    const src = r.relationships?.source?.data;
    const deviceId = src && !Array.isArray(src) ? src.id : fallbackDeviceId;
    const rawType = String(a.event_type ?? "motion");
    const rawSub = a.sub_type ? String(a.sub_type) : rawType.includes(".") ? rawType.split(".")[1]! : null;
    return [
      {
        id: r.id,
        deviceId,
        kind: mapEventKind(rawType, a.sub_type ?? null),
        startMs: start,
        endMs: toMs(a.end),
        origin,
        rawType,
        rawSubType: rawSub,
      },
    ];
  });
}
