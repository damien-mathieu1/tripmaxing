import { expect, it } from "vitest";
import { kindOf } from "./kind";

it.each([
  ["église", "monument"],
  ["château fort", "monument"],
  ["musée d'art", "museum"],
  ["commune française", "city"],
  ["établissement humain", "city"],
  ["bataille", "event"],
  ["accident ferroviaire", "event"],
  ["siège militaire", "event"],
  ["gare ferroviaire", "transport"],
  ["rue", "transport"],
  ["montagne", "nature"],
  ["jardin public", "nature"],
  ["institut de recherche", "other"],
])("%s is %s", (label, kind) => {
  expect(kindOf({ Q1: label })).toBe(kind);
});

it("does not read a word inside another", () => {
  expect(kindOf({ Q1: "reportage" })).toBe("other");
});
