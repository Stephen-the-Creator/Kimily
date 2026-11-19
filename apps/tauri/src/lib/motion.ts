// Durations for Svelte transitions. CSS animations already settle at once under "reduce motion" (app.css), but Svelte
// runs its transitions through the Web Animations API, which that rule doesn't reach; this gives them the same answer.
const query = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : null;

/** `ms`, or 0 when the user asked the system for less motion. */
export function motion(ms: number): number {
  return query?.matches ? 0 : ms;
}
