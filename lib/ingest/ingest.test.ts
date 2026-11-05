import { describe, expect, it } from "vitest";
import { KIND_IDS } from "../places/kind";
import { parsePlace, parseViews, trendOf } from "./parse";
import { summarizeViews } from "./refresh";

const labels = new Map([
  ["Q33506", "musée"],
  ["Q16970", "église"],
]);
const line = (coord = "POINT(4.8 45.7)", types = '"http://x/Q33506 http://x/Q7"') =>
  `<http://www.wikidata.org/entity/Q123>\t"Musée \\"Gadagne\\""@fr\t${coord}\t12\t<http://commons.wikimedia.org/wiki/Special:FilePath/A%20b%C3%A9.jpg>\t${types}`;

describe("parsePlace", () => {
  it("reads a place", () => {
    expect(parsePlace(line(), "fr", labels)).toEqual({
      id: 123,
      lang: "fr",
      title: 'Musée "Gadagne"',
      lon: 4.8,
      lat: 45.7,
      langs: 12,
      image: "A bé.jpg",
      kind: KIND_IDS.indexOf("museum"),
      family: "musée",
    });
  });

  it("keeps a place without image or type", () => {
    const place = parsePlace(
      '<http://www.wikidata.org/entity/Q1>\t"X"@en\tPOINT(1 2)\t3\t\t',
      "en",
      labels,
    );
    expect(place).toMatchObject({ image: null, family: null, kind: KIND_IDS.indexOf("other") });
  });

  it("rejects coordinates that are not on Earth", () => {
    expect(parsePlace(line("<http://x/Q405> POINT(1 2)"), "fr", labels)).toBeNull();
    expect(parsePlace(line("POINT(1 200)"), "fr", labels)).toBeNull();
  });
});

describe("parseViews", () => {
  it("reads a dump line", () => {
    expect(parseViews("fr.wikipedia Parc_de_la_Tête 12 desktop 34 A5B6")).toEqual({
      project: "fr.wikipedia",
      title: "Parc de la Tête",
      views: 34,
    });
  });
});

describe("trends", () => {
  it("compares the last 30 days with the 30 before", () => {
    const pageviews: Record<string, number | null> = {};
    for (let day = 0; day < 60; day++) {
      pageviews[`2026-${day < 30 ? "01" : "02"}-${String((day % 30) + 1).padStart(2, "0")}`] =
        day < 30 ? 1 : 3;
    }
    expect(summarizeViews(pageviews)).toEqual({ recent: 90, trend: 2.5 });
  });

  it("stays finite without views", () => {
    expect(trendOf(0, 0)).toBe(1);
    expect(summarizeViews({ "2026-01-01": null }).trend).toBe(1);
  });
});
