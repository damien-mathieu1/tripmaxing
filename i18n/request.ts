import { getRequestConfig } from "next-intl/server";
import messages from "@/messages/fr.json";

// Single language for now: adding one means a messages file and a locale choice here.
export const LOCALE = "fr";

export default getRequestConfig(async () => ({ locale: LOCALE, messages }));
