import { currencyTemplate } from "./currency.js";
import { searchTemplate } from "./search.js";
import { weatherTemplate } from "./weather.js";

export * from "./currency.js";
export * from "./search.js";
export * from "./types.js";
export * from "./weather.js";

export const TEMPLATES = [weatherTemplate, searchTemplate, currencyTemplate];
