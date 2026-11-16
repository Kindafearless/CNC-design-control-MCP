// Shop light control: Elgato Key Light Air over its LOCAL REST API.
// Not a machine tool — never touches the CNC controller or serial port.
// The light's IP is DHCP-assigned, so default to its mDNS name and let
// macOS resolve it; override with ELGATO_LIGHT_URL if needed.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const LIGHT_URL =
  process.env.ELGATO_LIGHT_URL || "http://elgato-key-light-air-5795.local:9123";

function text(s: string) {
  return { content: [{ type: "text" as const, text: s }] };
}

function err(s: string) {
  return { content: [{ type: "text" as const, text: s }], isError: true };
}

// Elgato reports temperature in mireds (143 ≈ 7000K cool … 344 ≈ 2900K warm).
const miredToKelvin = (m: number) => Math.round(1000000 / m / 50) * 50;
const kelvinToMired = (k: number) =>
  Math.min(344, Math.max(143, Math.round(1000000 / k)));

async function lightRequest(method: "GET" | "PUT", body?: unknown): Promise<any> {
  const res = await fetch(`${LIGHT_URL}/elgato/lights`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(5000),
  });
  if (!res.ok) throw new Error(`Light API HTTP ${res.status}`);
  return res.json();
}

function describeState(state: any): string {
  const l = state?.lights?.[0];
  if (!l) return "Light responded but reported no lights.";
  return (
    `Light is ${l.on ? "ON" : "OFF"}` +
    (l.on ? `, brightness ${l.brightness}%, ~${miredToKelvin(l.temperature)}K` : "") +
    ` (${LIGHT_URL})`
  );
}

export function registerLightTools(server: McpServer): void {
  server.tool(
    "get_light_state",
    "Get the shop light's state (on/off, brightness, color temperature). Local network only; does not touch the CNC.",
    {},
    async () => {
      try {
        return text(describeState(await lightRequest("GET")));
      } catch (e: any) {
        return err(`Cannot reach shop light at ${LIGHT_URL}: ${e.message}`);
      }
    }
  );

  server.tool(
    "set_light",
    "Set the shop light (on/off, brightness 3-100%, color temperature 2900-7000K). Local network only; does not touch the CNC.",
    {
      on: z.boolean().optional().describe("Turn the light on (true) or off (false)"),
      brightness: z.number().min(3).max(100).optional().describe("Brightness percent (3-100)"),
      kelvin: z.number().min(2900).max(7000).optional().describe("Color temperature in Kelvin (2900 warm - 7000 cool)"),
    },
    async ({ on, brightness, kelvin }) => {
      if (on === undefined && brightness === undefined && kelvin === undefined) {
        return err("Provide at least one of: on, brightness, kelvin.");
      }
      try {
        const light: Record<string, number> = {};
        if (on !== undefined) light.on = on ? 1 : 0;
        if (brightness !== undefined) light.brightness = Math.round(brightness);
        if (kelvin !== undefined) light.temperature = kelvinToMired(kelvin);
        const state = await lightRequest("PUT", { numberOfLights: 1, lights: [light] });
        return text(describeState(state));
      } catch (e: any) {
        return err(`Cannot reach shop light at ${LIGHT_URL}: ${e.message}`);
      }
    }
  );
}
