import { familyOf } from "./family.ts";

// Stored as an index: append only, reordering would relabel the database.
export const KIND_IDS = [
  "monument",
  "museum",
  "city",
  "nature",
  "event",
  "transport",
  "other",
] as const;

export type Kind = (typeof KIND_IDS)[number];

export const kindId = (kind: Kind) => KIND_IDS.indexOf(kind);

const word = (words: string) => new RegExp(`(?:^|[^\\p{L}])(?:${words})(?![\\p{L}])`, "iu");

// First match wins: a "siège militaire" is an event, a "musée d'art" is not a monument.
const RULES: [Exclude<Kind, "monument" | "other">, RegExp][] = [
  [
    "event",
    word(
      "bataille|siège militaire|accident(?: \\S+)?|catastrophe|assassinat|attentat|massacre|séisme|incendie|émeute|festival|événement|évènement|édition|saison sportive|exposition|concours|naufrage|battle|siege|disaster|earthquake|event|massacre|attack",
    ),
  ],
  ["museum", word("musée(?: \\S+)?|museum|art museum|galerie d'art|art gallery")],
  [
    "city",
    word(
      "commune(?: \\S+)?|municipalité|ville|village|hameau|établissement humain|localité|lieu-dit|district|subdivision|human settlement|census-designated place|unincorporated community|neighbou?rhood|quartier|arrondissement|canton|comarque|locality|municipality|city|town|entité singulière de population|métropole|région",
    ),
  ],
  [
    "transport",
    word(
      "gare|station de métro|métro|aéroport|port|tramway|ligne de chemin de fer|route|autoroute|rue|avenue|boulevard|quai|col routier|railway station|airport|road|street",
    ),
  ],
  [
    "nature",
    word(
      "montagne|sommet|lac|fleuve|rivière|cours d'eau|vallée|grotte|aire protégée|massif(?: \\S+)?|chaîne de montagnes|plage|île|forêt|cascade|volcan|selle|glacier|parc|jardin(?: \\S+)?|espace vert|mountain|lake|river|valley|cave|island|forest|waterfall|beach|park|garden",
    ),
  ],
];

export function kindOf(types: Record<string, string>): Kind {
  const labels = Object.values(types).join(" | ");
  for (const [kind, rule] of RULES) {
    if (rule.test(labels)) return kind;
  }
  return familyOf(types) ? "monument" : "other";
}
