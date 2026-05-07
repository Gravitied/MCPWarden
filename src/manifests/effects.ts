export const knownEffects = [
  "read.repo",
  "write.repo",
  "read.tests",
  "run.tests",
  "network.github",
  "write.github.issues",
  "agent.debugger",
  "agent.coder",
  "read.secrets",
  "shell.exec"
] as const;

export type Effect = (typeof knownEffects)[number];

export function isEffect(value: string): value is Effect {
  return (knownEffects as readonly string[]).includes(value);
}
