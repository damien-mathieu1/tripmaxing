import { expect, it } from "vitest";
import { familyOf } from "./family";

it("groups visitable types in French and English", () => {
  expect(familyOf({ Q1: "église catholique" })).toBe("église");
  expect(familyOf({ Q1: "Buddhist temple" })).toBe("temple");
  expect(familyOf({ Q1: "traboule" })).toBe("traboule");
});

it("does not match inside a word", () => {
  expect(familyOf({ Q1: "tournoi" })).toBeNull();
  expect(familyOf({ Q1: "aéroport" })).toBeNull();
});

it("rejects destroyed and non visitable places", () => {
  expect(familyOf({ Q1: "musée", Q19860854: "bâtiment détruit" })).toBeNull();
  expect(familyOf({ Q1: "parc de stationnement" })).toBeNull();
  expect(familyOf({ Q1: "rue" })).toBeNull();
  expect(familyOf({ Q1: "magasin phare" })).toBeNull();
  expect(familyOf({ Q1: "galerie d'art" })).toBeNull();
});
