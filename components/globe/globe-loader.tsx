"use client";

import dynamic from "next/dynamic";

export const GlobeLoader = dynamic(() => import("./globe").then((module) => module.Globe), {
  ssr: false,
});
