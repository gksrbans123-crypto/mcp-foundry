// Re-exported so downstream packages (apps/runtime-host's golden-path proof,
// P1 Inspector spike, packages/validator tests) can load a known-good spec
// without duplicating it, per plan P1 "fixture-first" phase.
import weather from "./weather.json" with { type: "json" };

export const weatherFixture: unknown = weather;
