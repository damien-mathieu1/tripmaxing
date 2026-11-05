"""Rank places from touristy (t=0) to offbeat (t=1). Usage: python3 score.py [lyon.json]"""
import bisect, json, re, sys
from collections import Counter

# shortcut: matches French and English type labels (SPARQL asks fr, then en), move to Wikidata P279 classes if coverage is poor
PLACE = re.compile(r"\b(église|chapelle|basilique|cathédrale|abbaye|couvent|monastère|musée|jardin|parc|pont|fort|redoute|château"
                   r"|site archéologique|monument|mémorial|statue|sculpture|fontaine|passage|galerie|escalier|cimetière"
                   r"|maison|villa|hôtel particulier|usine|grenier|atelier|théâtre|tour|aqueduc|amphithéâtre|palais"
                   r"|place|rue piétonne|ruines?|traboule|fresque|cour d'immeuble|temple|sanctuaire|mosquée|synagogue|moulin|phare"
                   r"|church|chapel|basilica|cathedral|abbey|convent|monastery|museum|garden|park|bridge|castle|archaeological site"
                   r"|memorial|fountain|gallery|stairway|cemetery|house|mansion|factory|theat(?:re|er)|aqueduct|palace|square|shrine"
                   r"|mosque|mill|lighthouse|tower)\b", re.I)
NOT_PLACE = re.compile(r"stationnement|commercial|exposition|d'art contemporain|maison d'édition|parking|shopping|publishing", re.I)
GONE = {"Q19860854"}  # destroyed building: nothing left to see


def visitable(p):
    labels = " | ".join(p.get("types", {}).values())
    return bool(PLACE.search(labels)) and not NOT_PLACE.search(labels) and not GONE & set(p["types"])


def rank(pages, t):
    pages = [p for p in pages if visitable(p)]
    counts = Counter(label for p in pages for label in p["types"].values())

    def pct(key):
        values = sorted(key(p) for p in pages)
        return lambda p: bisect.bisect_left(values, key(p)) / len(values)

    views, langs = pct(lambda p: p.get("views", 0)), pct(lambda p: p["langs"])
    commonness = pct(lambda p: min(counts[label] for label in p["types"].values()))

    def score(p):
        fame = (views(p) + langs(p)) / 2
        # A short article can describe a great place: only stubs lose points.
        quality = min(1, p.get("bytes", 0) / 5000) * (1 if p.get("image") else 0.6)
        return quality + t * (1 - fame + 1 - commonness(p)) + (1 - t) * fame

    return sorted(pages, key=score, reverse=True)


def family(p):
    return PLACE.search(" | ".join(p["types"].values())).group(1).lower()


def top(pages, t, n=15, per_family=2):
    seen, picked = Counter(), []
    for p in rank(pages, t):
        seen[family(p)] += 1
        if seen[family(p)] <= per_family:
            picked.append(p)
    return picked[:n]


def self_check():
    base = dict(types={"Q33506": "musée"}, image="x.jpg")
    famous = dict(base, title="famous", views=90000, langs=40, bytes=60000)
    gem = dict(base, title="gem", views=80, langs=1, bytes=40000)
    stub = dict(base, title="stub", views=10, langs=1, bytes=500, image=None)
    street = dict(base, title="street", types={"Q79007": "rue"}, views=5, langs=1, bytes=30000)
    ruin = dict(base, title="ruin", types={"Q33506": "musée", "Q19860854": "détruit"}, views=5, langs=1, bytes=30000)
    pages = [famous, gem, stub, street, ruin]
    assert [p["title"] for p in rank(pages, 1)][0] == "gem"
    assert [p["title"] for p in rank(pages, 0)][0] == "famous"
    assert {p["title"] for p in rank(pages, 1)} == {"famous", "gem", "stub"}
    church = dict(base, types={"Q16970": "église"}, views=100, langs=2, bytes=50000)
    churches = [dict(church, title=f"church{i}") for i in range(5)]
    traboule = dict(base, title="traboule", types={"Q1": "traboule"}, views=100, langs=2, bytes=6000)
    assert rank(churches + [traboule], 1)[0]["title"] == "traboule"
    assert len(top(churches + [traboule], 1)) == 3


if __name__ == "__main__":
    self_check()
    pages = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "lyon-fr.json"))["pages"]
    print(sum(map(visitable, pages)), "visitable of", len(pages))
    for t in (0, 0.5, 1):
        print(f"\n--- t={t} ---")
        for p in top(pages, t):
            print(f"{p['title'][:45]:45} {p.get('views', 0):>7} vues {p['langs']:>3} langues {p.get('bytes', 0):>7} o  {', '.join(p['types'].values())[:40]}")
