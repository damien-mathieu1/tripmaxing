import { describe, expect, it } from "vitest";
import { order, planTrip, routeKm } from "./plan";
import { type Candidate, rank } from "./score";

let nextId = 0;
const place = (title: string, extra: Partial<Candidate> = {}): Candidate => ({
  id: nextId++,
  title,
  lang: "fr",
  lat: 45,
  lon: 4,
  family: "musée",
  views: 10,
  langs: 1,
  bytes: 9000,
  image: "x.jpg",
  trend: 1,
  ...extra,
});

describe("rank", () => {
  const famous = place("famous", { views: 90000, langs: 40, bytes: 60000 });
  const gem = place("gem", { views: 80, langs: 1, bytes: 40000 });
  const stub = place("stub", { views: 10, langs: 1, bytes: 500, image: null });

  it("follows the offbeat slider", () => {
    expect(rank([famous, gem, stub], 1)[0].title).toBe("gem");
    expect(rank([famous, gem, stub], 0)[0].title).toBe("famous");
  });

  it("skips dead pages and photo-less places in niche mode", () => {
    const empty = place("empty", { views: 3, langs: 1, image: null });
    const alive = place("alive", { views: 120, langs: 2 });
    const big = place("big", { views: 90000, langs: 60 });
    expect(rank([empty, alive, big], 1)[0].title).toBe("alive");
  });

  it("prefers a castle to an ordinary house", () => {
    const house = place("house", { family: "maison" });
    const castle = place("castle", { family: "château" });
    expect(rank([house, castle], 0.5)[0].title).toBe("castle");
  });

  it("does not punish a short article of a rare type", () => {
    const churches = [1, 2, 3, 4, 5].map((n) =>
      place(`church${n}`, {
        family: "église",
        views: 100,
        langs: 2,
        bytes: 50000,
      }),
    );
    const traboule = place("traboule", {
      family: "traboule",
      views: 100,
      langs: 2,
      bytes: 6000,
    });
    expect(rank([...churches, traboule], 1)[0].title).toBe("traboule");
  });

  it("lifts rising places when asked", () => {
    const rising = place("rising", { trend: 4 });
    const flat = place("flat", { trend: 1, views: 11 });
    expect(rank([flat, rising], 0.5, 2)[0].title).toBe("rising");
  });
});

describe("order", () => {
  it("never lengthens the route and keeps every stop", () => {
    const stops = [0, 3, 1, 2].map((x) => ({ lat: 45, lon: 4 + x / 100 }));
    const route = order(stops);
    expect(routeKm(route)).toBeLessThanOrEqual(routeKm(stops));
    expect(route).toHaveLength(4);
  });
});

describe("planTrip", () => {
  const families = ["musée", "fort", "pont"];
  const places = Array.from({ length: 12 }, (_, i) =>
    place(`p${i}`, { lat: 45 + i / 1000, family: families[i % 3] }),
  );

  it("uses each place once", () => {
    const titles = planTrip(places, { days: 2, stops: 3, offbeat: 1 }).flatMap((day) =>
      day.stops.map((stop) => stop.title),
    );
    expect(titles).toHaveLength(6);
    expect(new Set(titles).size).toBe(6);
  });

  it("never returns a partly filled day", () => {
    expect(planTrip(places, { days: 2, stops: 30, offbeat: 1 })).toEqual([]);
  });

  it("keeps the walk under the limit", () => {
    const spread = places.map((p, i) => ({ ...p, lat: 45 + i / 200 }));
    const [day] = planTrip(spread, {
      days: 1,
      stops: 6,
      offbeat: 1,
      dayRadiusKm: 5,
      maxWalkMinutes: 40,
    });
    expect(day.minutes - day.stops.length * 30).toBeLessThanOrEqual(40);
    expect(day.stops.length).toBeGreaterThanOrEqual(2);
  });

  it("offers more suggestions than stops, without a fixed route", () => {
    const days = planTrip(places, { days: 1, stops: 9, minStops: 3, offbeat: 1, suggest: true });
    expect(days[0].stops.length).toBeGreaterThan(3);
  });

  it("suggests from the richest area, not the first one found", () => {
    const lonely = place("lonely", { lat: 50, views: 80, langs: 2 });
    const crowd = Array.from({ length: 10 }, (_, i) =>
      place(`crowd${i}`, { lat: 45 + i / 1000, family: families[i % 3] }),
    );
    const [day] = planTrip([lonely, ...crowd], {
      days: 1,
      stops: 8,
      minStops: 1,
      offbeat: 1,
      suggest: true,
    });
    expect(day.stops.length).toBeGreaterThan(5);
  });

  it("moves to another area when one exists", () => {
    const far = places.map((p) => ({
      ...p,
      id: p.id + 1000,
      title: `far${p.title}`,
      lat: p.lat + 1,
    }));
    const [first, second] = planTrip([...places, ...far], { days: 2, stops: 3, offbeat: 1 });
    expect(Math.abs(first.stops[0].lat - second.stops[0].lat)).toBeGreaterThan(0.5);
  });
});
