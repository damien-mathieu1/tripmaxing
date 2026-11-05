const PLACE = new RegExp(
  "(?:^|[^\\p{L}])(" +
    [
      "église|chapelle|basilique|cathédrale|abbaye|couvent|monastère|musée|jardin|parc|pont|fort|redoute|château",
      "site archéologique|monument|mémorial|statue|sculpture|fontaine|passage|galerie|escalier|cimetière",
      "maison|villa|hôtel particulier|usine|grenier|atelier|théâtre|tour|aqueduc|amphithéâtre|palais",
      "place|rue piétonne|ruines?|traboule|fresque|cour d'immeuble|temple|sanctuaire|mosquée|synagogue|moulin|phare",
      "church|chapel|basilica|cathedral|abbey|convent|monastery|museum|garden|park|bridge|castle|archaeological site",
      "memorial|fountain|gallery|stairway|cemetery|house|mansion|factory|theatre|theater|aqueduct|palace|square|shrine",
      "mosque|mill|lighthouse|tower|dolmen|menhir",
    ].join("|") +
    ")(?![\\p{L}])",
  "iu",
);
const NOT_PLACE =
  /stationnement|commercial|exposition|d'art contemporain|maison d'édition|parking|shopping|publishing/i;
const DESTROYED = "Q19860854";

// Labels are French, then English when Wikidata has no French label.
export function familyOf(types: Record<string, string>): string | null {
  if (DESTROYED in types) return null;
  const labels = Object.values(types).join(" | ");
  if (NOT_PLACE.test(labels)) return null;
  return PLACE.exec(labels)?.[1].toLowerCase() ?? null;
}
