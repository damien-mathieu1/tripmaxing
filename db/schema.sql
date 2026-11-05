create extension if not exists postgis;

-- Every byte counts: the whole world has to fit a 500 MB free database.
-- Fixed-size columns come first, widest to narrowest, to avoid alignment padding.
create table if not exists places (
  -- Wikidata Q number.
  id integer primary key,
  views_recent integer,
  trend real,
  -- Index in KINDS, see lib/places/kind.ts.
  kind smallint not null,
  langs smallint not null,
  -- Article size in bytes, capped: only short articles matter.
  size smallint,
  geom geometry(Point, 4326) not null,
  lang text not null,
  title text not null,
  -- Null when the article is not somewhere you can visit: still a pin, never a trip stop.
  family text,
  image text
) with (fillfactor = 90, autovacuum_vacuum_scale_factor = 0.02);

create index if not exists places_geom on places using gist (geom);
-- Zoomed out tiles only need popular places: a small index keeps them fast.
create index if not exists places_popular on places using gist (geom) where views_recent >= 63;
create index if not exists places_rising on places using gist (geom)
  where trend >= 1.5 and views_recent >= 100;

create table if not exists app_state (
  key text primary key,
  value text not null
);

create table if not exists api_blocks (
  host text primary key,
  until timestamptz not null
);
