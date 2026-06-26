/**
 * Minimal Prometheus exposition (master spec §25). MVP exposes process + a few app
 * gauges; full OpenTelemetry tracing + the complete metric set wired to Prometheus/
 * Grafana/Loki is the post-MVP observability layer (ADR-10), deferred.
 */
export function GET() {
  const mem = process.memoryUsage();
  const lines = [
    "# HELP flowdesk_up Process liveness.",
    "# TYPE flowdesk_up gauge",
    "flowdesk_up 1",
    "# HELP flowdesk_resident_memory_bytes Resident memory.",
    "# TYPE flowdesk_resident_memory_bytes gauge",
    `flowdesk_resident_memory_bytes ${mem.rss}`,
    "# HELP flowdesk_uptime_seconds Process uptime.",
    "# TYPE flowdesk_uptime_seconds counter",
    `flowdesk_uptime_seconds ${Math.floor(process.uptime())}`,
  ];
  return new Response(lines.join("\n") + "\n", {
    headers: { "Content-Type": "text/plain; version=0.0.4" },
  });
}
