# Security Policy

MCPWarden sits between model-proposed workflows and real MCP tools. Security reports are taken seriously, especially issues that weaken policy checks, approval enforcement, trust labels, secret handling, or local service protections.

## Supported Versions

The project is pre-1.0. Security fixes target the latest `main` branch and the latest published npm version.

## Reporting A Vulnerability

Please do not disclose suspected vulnerabilities publicly until they have been triaged.

Report security issues through GitHub private vulnerability reporting when available for the repository. If private reporting is not available, open a GitHub issue with minimal public detail and mark it as security-sensitive so maintainers can move the discussion to a private channel.

Include:

- affected version or commit.
- reproduction steps or proof of concept.
- expected and actual behavior.
- impact and preconditions.
- whether live MCP tools, custom policies, or non-default service binding are involved.

## Security Scope

High-priority areas include:

- imported MCP tool fail-closed behavior.
- approval-required effects.
- denied effects such as `read.secrets` and `shell.exec`.
- workflow trust labels and prompt-injection boundaries.
- local HTTP service authorization and browser-origin protections.
- traces, artifacts, and returned outputs that may contain secrets.

Operator-controlled local config is considered trusted input. If a lower-trust actor can modify `mcpw.config.json`, `mcpw.overrides.json`, package scripts, or the configured MCP server command, treat that as a separate local project compromise.

## Disclosure Expectations

The expected initial response target is 7 days. Confirmed vulnerabilities should receive a fix plan, mitigation guidance, or status update within 30 days when feasible.
