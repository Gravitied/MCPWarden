export type DashboardInput = {
  version: string;
  sources: Array<{ id: string; kind: string; tools: number }>;
  runs: Array<{ runId: string; workflow: string; ok: boolean }>;
  findings: Array<{ severity: string; title: string }>;
};

export function renderDashboardHtml(input: DashboardInput): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>MCPWarden Dashboard</title>
<style>
body{font-family:Arial,sans-serif;margin:0;background:#f7f7f5;color:#1f2933}
header{padding:20px 28px;background:#111827;color:white}
main{display:grid;gap:16px;padding:20px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
section{background:white;border:1px solid #d6d3cc;border-radius:8px;padding:16px}
h1,h2{margin:0 0 12px}
table{width:100%;border-collapse:collapse}
td,th{border-bottom:1px solid #ece9e1;padding:8px;text-align:left}
.ok{color:#047857}.bad{color:#b91c1c}
</style>
</head>
<body>
<header><h1>MCPWarden Dashboard</h1><div>Version ${escapeHtml(input.version)}</div></header>
<main>
${section("Sources", table(["Source", "Kind", "Tools"], input.sources.map((item) => [item.id, item.kind, String(item.tools)])))}
${section("Runs", table(["Run", "Workflow", "Status"], input.runs.map((item) => [item.runId, item.workflow, item.ok ? "ok" : "failed"])))}
${section("Security Findings", table(["Severity", "Finding"], input.findings.map((item) => [item.severity, item.title])))}
</main>
</body>
</html>`;
}

function section(title: string, body: string): string {
  return `<section><h2>${escapeHtml(title)}</h2>${body}</section>`;
}

function table(headers: string[], rows: string[][]): string {
  return `<table><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows
    .map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`)
    .join("")}</tbody></table>`;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char] ?? char);
}
