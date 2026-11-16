#!/usr/bin/env node

// CNCjs MCP Server — bridges Claude Code to CNCjs for GRBL CNC control

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { client } from "./cncjs-client.js";
import { registerQueryTools } from "./tools/query.js";
import { registerConnectionTools } from "./tools/connection.js";
import { registerSafetyTools } from "./tools/safety.js";
import { registerControlTools } from "./tools/control.js";
import { registerManagementTools } from "./tools/management.js";
import { registerAnalysisTools } from "./tools/analysis.js";
import { registerDesignTools } from "./tools/design.js";
import { registerFusion360Tools } from "./tools/fusion360.js";
import { registerFreeCADTools } from "./tools/freecad.js";
import { registerIllustratorTools } from "./tools/illustrator.js";
import { registerMarketplaceTools } from "./tools/marketplace.js";
import { registerCarpentryTools } from "./tools/carpentry.js";
import { registerLightTools } from "./tools/light.js";

const server = new McpServer({
  name: "cncjs-mcp",
  version: "1.0.0",
});

// Monitoring-only by default. Tools that can cause motion, start jobs,
// write machine state, or load G-code into CNCjs are only registered when
// CNC_ENABLE_CONTROL=1 is set in the environment. Default surface:
// read-only queries, G-code analysis, and the stop-only safety tools
// (feed hold, emergency stop).
const ENABLE_CONTROL = process.env.CNC_ENABLE_CONTROL === "1";

registerQueryTools(server);
registerSafetyTools(server, { enableControl: ENABLE_CONTROL });
registerAnalysisTools(server);
registerLightTools(server); // shop light only — never touches the CNC

if (ENABLE_CONTROL) {
  registerConnectionTools(server);
  registerControlTools(server);
  registerManagementTools(server);
  registerDesignTools(server);
  registerFusion360Tools(server);
  registerFreeCADTools(server);
  registerIllustratorTools(server);
  registerMarketplaceTools(server);
  registerCarpentryTools(server);
  console.error("[cncjs-mcp] CNC_ENABLE_CONTROL=1 — control tools REGISTERED");
} else {
  console.error("[cncjs-mcp] Monitoring mode — control tools not registered (set CNC_ENABLE_CONTROL=1 to enable)");
}

// Auto-connect to CNCjs on startup (best-effort, non-blocking).
// In monitoring mode the connection tools are not registered, so also
// attach to a serial port that is ALREADY open in CNCjs (attaching to an
// in-use port only joins the existing session — it never opens the port).
async function tryConnect(): Promise<void> {
  try {
    await client.connectToServer();
    console.error("[cncjs-mcp] Auto-connected to CNCjs server");
    const attached = await client.attachToActivePort();
    if (attached) {
      console.error(`[cncjs-mcp] Attached to active port: ${attached}`);
    } else {
      console.error("[cncjs-mcp] No port currently open in CNCjs (re-checking every 15s)");
    }
    // Re-attach if the UI opens/reopens the port later. attachToActivePort
    // is a no-op while already attached and only ever joins in-use ports.
    setInterval(() => {
      client.attachToActivePort().catch(() => {});
    }, 15000);
  } catch (e: any) {
    console.error(`[cncjs-mcp] CNCjs not available at startup (will connect on first use): ${e.message}`);
  }
}

// Start server
async function main(): Promise<void> {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("[cncjs-mcp] MCP server running on stdio");

  // Try to connect to CNCjs in background
  tryConnect();
}

main().catch((e) => {
  console.error("[cncjs-mcp] Fatal error:", e);
  process.exit(1);
});
