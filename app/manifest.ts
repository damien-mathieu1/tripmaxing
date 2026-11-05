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
    background_color: "#000000",
    theme_color: "#000000",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
