"""Collect geolocated Wikipedia articles around a city, enriched with views and Wikidata. Usage: python3 fetch.py Porto --lang pt"""
import argparse, json, os, sys, time, urllib.parse, urllib.request

UA = "wikitrip-prototype/0.1 (open-source travel planner prototype)"
WIKIDATA = "https://www.wikidata.org/w/api.php"
SPARQL = "https://query.wikidata.org/sparql"


def get(url, params, headers=None):
    req = urllib.request.Request(url + "?" + urllib.parse.urlencode(params), headers={"User-Agent": UA, **(headers or {})})
    for attempt in range(6):
        time.sleep(1)  # Wikimedia throttles bursts with 429
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                d = json.load(r)
            if "error" in d:
                raise RuntimeError(d["error"])
            return d
        except urllib.error.HTTPError as e:
            if e.code not in (429, 500, 502, 503, 504) or attempt == 5:
                raise
            wait = int(e.headers.get("Retry-After") or 2 ** attempt * 5)
            print(f"HTTP {e.code}, waiting {wait}s", file=sys.stderr)
            time.sleep(wait)


def locate(city):
    hits = get(WIKIDATA, dict(action="wbsearchentities", format="json", search=city, language="fr", type="item", limit=5))["search"]
    for hit in hits:
        claims = get(WIKIDATA, dict(action="wbgetclaims", format="json", entity=hit["id"], property="P625"))["claims"]
        if claims.get("P625"):
            c = claims["P625"][0]["mainsnak"]["datavalue"]["value"]
            print(f"{city}: {hit.get('label')} ({hit.get('description', '?')}) {hit['id']}", file=sys.stderr, flush=True)
            return c["latitude"], c["longitude"]
    raise SystemExit(f"Ville introuvable sur Wikidata : {city}")


def places(lat, lon, radius_km, lang):
    """One Wikidata query: list=geosearch rides on CirrusSearch and fails with too-busy when walked over a grid."""
    q = f"""SELECT ?i ?title ?c ?links ?type ?typeLabel WHERE {{
      SERVICE wikibase:around {{ ?i wdt:P625 ?c. bd:serviceParam wikibase:center "Point({lon} {lat})"^^geo:wktLiteral.
                                 bd:serviceParam wikibase:radius "{radius_km}". }}
      ?a schema:about ?i; schema:isPartOf <https://{lang}.wikipedia.org/>; schema:name ?title.
      ?i wikibase:sitelinks ?links. OPTIONAL {{ ?i wdt:P31 ?type }}
      SERVICE wikibase:label {{ bd:serviceParam wikibase:language "fr,en". }} }}"""
    pages = {}
    for b in get(SPARQL, dict(query=q), {"Accept": "application/sparql-results+json"})["results"]["bindings"]:
        lon_, lat_ = b["c"]["value"][6:-1].split()
        p = pages.setdefault(b["title"]["value"], dict(title=b["title"]["value"], qid=b["i"]["value"].rsplit("/", 1)[1],
                                                       lat=float(lat_), lon=float(lon_), langs=int(b["links"]["value"]), types={}))
        if "type" in b:
            p["types"][b["type"]["value"].rsplit("/", 1)[1]] = b["typeLabel"]["value"]
    return pages


def enrich(pages, lang):
    titles = list(pages)
    for i in range(0, len(titles), 50):
        params = dict(action="query", format="json", formatversion=2, titles="|".join(titles[i:i + 50]),
                      prop="info|pageviews|pageimages|description", pvipdays=60, piprop="name", pilimit=50)
        cont = {}
        while True:  # pageviews are truncated per response: follow continue or zeros are fake
            d = get(f"https://{lang}.wikipedia.org/w/api.php", {**params, **cont})
            for x in d["query"]["pages"]:
                p = pages.get(x["title"])
                if not p:
                    continue
                p["bytes"] = x.get("length", p.get("bytes", 0))
                p["description"] = x.get("description", p.get("description"))
                p["image"] = x.get("pageimage", p.get("image"))
                if x.get("pageviews"):
                    p["views"] = sum(v or 0 for v in x["pageviews"].values())
            if "continue" not in d:
                break
            cont = d["continue"]
        print(f"enrich {i + 50}/{len(titles)}", file=sys.stderr, flush=True)


def load(city, lang="fr", radius_km=6):
    path = f"{city.lower().replace(' ', '-')}-{lang}.json"
    if os.path.exists(path):
        return json.load(open(path))
    lat, lon = locate(city)
    pages = places(lat, lon, radius_km, lang)
    print(len(pages), "pages", file=sys.stderr, flush=True)
    enrich(pages, lang)
    data = dict(city=city, lang=lang, lat=lat, lon=lon, pages=list(pages.values()))
    json.dump(data, open(path, "w"), ensure_ascii=False, indent=0)
    return data


if __name__ == "__main__":
    args = argparse.ArgumentParser()
    args.add_argument("city")
    args.add_argument("--lang", default="fr")
    args.add_argument("--radius", type=int, default=6)
    args = args.parse_args()
    load(args.city, args.lang, args.radius)
