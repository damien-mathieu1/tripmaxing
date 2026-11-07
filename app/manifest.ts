import type { MetadataRoute } from "next";
import messages from "@/messages/fr.json";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "tripmaxing",
    short_name: "tripmaxing",
    description: messages.meta.description,
    start_url: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#e11d48",
    theme_color: "#e11d48",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
