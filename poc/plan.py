"""Build walkable day trips and a map. Usage: python3 plan.py Porto --lang pt [--days 3] [--stops 6] [--t 1]"""
import argparse, html, json, math
from collections import Counter

from fetch import load
from score import family, rank

DETOUR, KMH, VISIT_MIN = 1.3, 4.5, 30  # shortcut: straight line x detour, use a routing API for real walking times
COLORS = ["#d7263d", "#1b6ca8", "#2e8b57", "#8e44ad", "#e67e22", "#16a085", "#7f8c8d"]


def km(a, b):
    p1, p2 = math.radians(a["lat"]), math.radians(b["lat"])
    h = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(b["lon"] - a["lon"]) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def length(route):
    return sum(km(a, b) for a, b in zip(route, route[1:]))


def order(stops):
    route, left = stops[:1], stops[1:]
    while left:
        nxt = min(left, key=lambda p: km(route[-1], p))
        route.append(nxt)
        left.remove(nxt)
    improved = True
    while improved:  # 2-opt on an open path, cheap at this size
        improved = False
        for i in range(1, len(route) - 1):
            for j in range(i + 1, len(route)):
                candidate = route[:i] + route[i:j + 1][::-1] + route[j + 1:]
                if length(candidate) < length(route) - 1e-9:
                    route, improved = candidate, True
    return route


def pick_day(seed, pool, stops, radius, per_family=2):
    seen, day = Counter([family(seed)]), [seed]
    for p in pool:  # pool is best-first
        if len(day) == stops:
            break
        if p is not seed and km(seed, p) <= radius and seen[family(p)] < per_family:
            seen[family(p)] += 1
            day.append(p)
    return day


def plan(pages, days, stops, t, radius=1.5):
    pool = rank(pages, t)[:days * stops * 8]
    trip = []
    for _ in range(days):
        for seed in pool:
            day = pick_day(seed, pool, stops, radius)
            if len(day) == stops:
                break
        else:
            break  # no area left that can fill a whole day
        trip.append(order(day))
        pool = [p for p in pool if p not in day]
    return trip


def minutes(route):
    return length(route) * DETOUR / KMH * 60 + len(route) * VISIT_MIN


def render(trip, t, city, lang, lat, lon):
    days = [dict(color=COLORS[i % len(COLORS)], km=round(length(r) * DETOUR, 1), hours=round(minutes(r) / 60, 1),
                 stops=[dict(title=p["title"], lat=p["lat"], lon=p["lon"], description=p.get("description") or "") for p in r])
            for i, r in enumerate(trip)]
    data = dict(city=city, lang=lang, center=[lat, lon], days=days)
    payload = json.dumps(data, ensure_ascii=False).replace("<", "\\u003c")  # titles are third-party text
    return TEMPLATE.replace("__DATA__", payload).replace("__T__", html.escape(str(t)))


TEMPLATE = """<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>wikitrip</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
<style>body{margin:0;display:flex;height:100vh;font:15px system-ui,sans-serif}#side{width:340px;overflow:auto;padding:16px;box-sizing:border-box}
#map{flex:1}h1{font-size:20px;margin:0 0 4px}h2{font-size:16px;margin:18px 0 4px}ol{padding-left:22px;margin:6px 0}li{margin:5px 0}
small{color:#555}.warn{background:#fff4d6;padding:8px;border-radius:6px;font-size:13px;margin-top:10px}
@media(max-width:700px){body{flex-direction:column-reverse}#side{width:auto;height:45vh}}</style></head>
<body><aside id="side"><h1 id="title"></h1><small>Curseur insolite : __T__</small>
<p class="warn">Accès non vérifié : certains lieux peuvent être fermés, privés ou sans vestige visible. Distances et durées estimées.</p></aside>
<main id="map" aria-label="Carte de l'itinéraire"></main>
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script><script>
const {city,lang,center,days}=__DATA__, side=document.getElementById('side'), map=L.map('map');
document.getElementById('title').textContent='Itinéraire '+city;
L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap | Textes : Wikipédia CC BY-SA'}).addTo(map);
const url=s=>`https://${lang}.wikipedia.org/wiki/`+encodeURIComponent(s.title.replaceAll(' ','_'));
const link=s=>{const a=document.createElement('a');a.href=url(s);a.target='_blank';a.rel='noopener';a.textContent=s.title;return a};
const bounds=[];
days.forEach((d,i)=>{
  const h=document.createElement('h2');h.textContent=`Jour ${i+1}`;h.style.color=d.color;
  const info=document.createElement('small');info.textContent=`≈ ${d.km} km à pied, ≈ ${d.hours} h avec visites`;
  const ol=document.createElement('ol');side.append(h,info,ol);
  const line=d.stops.map(s=>[s.lat,s.lon]);bounds.push(...line);
  L.polyline(line,{color:d.color,weight:3,dashArray:'6 6'}).addTo(map);
  d.stops.forEach((s,n)=>{
    const li=document.createElement('li');li.append(link(s));ol.append(li);
    const box=document.createElement('div'),b=document.createElement('b');b.append(link(s));box.append(b);
    if(s.description){const p=document.createElement('div');p.textContent=s.description;box.append(p)}
    L.circleMarker([s.lat,s.lon],{radius:8,color:d.color,fillOpacity:.85}).bindPopup(box).bindTooltip(`J${i+1}.${n+1}`).addTo(map);
  });
});
// The container can be 0px wide at load: zooming then maxes out, so fit again on every resize.
new ResizeObserver(()=>{map.invalidateSize();if(map.getSize().x)bounds.length?map.fitBounds(bounds,{padding:[30,30]}):map.setView(center,13)}).observe(document.getElementById('map'));
</script></body></html>"""


def self_check():
    pts = [dict(lat=45.0, lon=4.0 + x / 100) for x in (0, 3, 1, 2)]
    assert length(order(pts)) <= length(pts) and sorted(p["lon"] for p in order(pts)) == sorted(p["lon"] for p in pts)
    base = dict(types={"Q33506": "musée"}, image="x", views=10, langs=1, bytes=9000)
    pages = [dict(base, title=f"m{i}", lat=45 + i / 1000, lon=4.0, types={"Q": ["musée", "fort", "pont"][i % 3]}) for i in range(12)]
    trip = plan(pages, days=2, stops=3, t=1)
    titles = [p["title"] for r in trip for p in r]
    assert len(trip) == 2 and len(titles) == len(set(titles)) == 6
    assert plan(pages, days=2, stops=30, t=1) == []  # never returns a partly filled day


if __name__ == "__main__":
    self_check()
    a = argparse.ArgumentParser()
    a.add_argument("city")
    a.add_argument("--lang", default="fr")
    a.add_argument("--radius", type=int, default=6)
    a.add_argument("--days", type=int, default=3)
    a.add_argument("--stops", type=int, default=6)
    a.add_argument("--t", type=float, default=1)
    a.add_argument("--out")
    args = a.parse_args()
    d = load(args.city, args.lang, args.radius)
    trip = plan(d["pages"], args.days, args.stops, args.t)
    for i, r in enumerate(trip, 1):
        print(f"\nJour {i}: ~{length(r) * DETOUR:.1f} km, ~{minutes(r) / 60:.1f} h")
        for p in r:
            print(f"  {p['title']} ({p.get('views', 0)} vues)")
    if len(trip) < args.days:
        print(f"\nseulement {len(trip)} jours complets trouvés sur {args.days}")
    out = args.out or f"{args.city.lower().replace(' ', '-')}-{args.lang}.html"
    open(out, "w").write(render(trip, args.t, d["city"], d["lang"], d["lat"], d["lon"]))
    print(f"\n{len(d['pages'])} articles, carte : {out}")
