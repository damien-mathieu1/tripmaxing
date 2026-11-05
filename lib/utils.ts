export { cn } from "cn";

/** Wikidata labels and descriptions are lowercase by convention. */
export const capitalize = (text: string) => text.charAt(0).toLocaleUpperCase("fr") + text.slice(1);
