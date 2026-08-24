# -*- coding: utf-8 -*-
"""Builds the real Granada out of OpenStreetMap, and bakes it into the mockup.

    python scripts/osm_granada.py --fetch          # pull fresh from Overpass
    python scripts/osm_granada.py                  # rebuild from the cache
    python scripts/osm_granada.py --preview out/   # PNGs to look at

Why this exists: the first Granada was drawn by hand -- five streets, one
block of houses, a lake down the right-hand side. Kevin asked for the whole
real city, so the streets, the blocks, the churches, the market, the cemetery
and the shoreline now come from OSM survey data instead of from me making it
up. Every corner you can walk round is a corner that is really there.

WHY THE TILE GRID IS BAKED HERE AND NOT IN THE BROWSER. The obvious design
ships the vector data and rasterises it in JS at boot. That means writing the
rasteriser twice -- once in Python so I can render a PNG and actually look at
the city, once in JS so the game can draw it -- and the two drift. So the
rasteriser lives here, once, and the mockup gets the finished grid. What comes
out of the PNG is exactly what the game renders.

What the game gets, injected between the markers in mockups/granada.html:

  tiles   run-length encoded terrain, one byte per tile
  tint    run-length encoded facade colour, same grid
  roads   the street graph, in tile coordinates -- this is what vehicles
          drive on, so it ships as lines and not as painted pixels
  spots   named real places, so an NPC can stand at the actual cathedral

Source: OpenStreetMap contributors, ODbL. Nothing here is redistributed as
map imagery -- it is survey geometry redrawn as tiles.
"""
import argparse, io, json, math, os, sys, urllib.parse, urllib.request, zlib

import numpy as np
from PIL import Image, ImageDraw

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CACHE = os.path.join(ROOT, 'reference', 'granada-osm.json')
HTML = os.path.join(ROOT, 'mockups', 'granada.html')

# ── the window on the world ──────────────────────────────────────────────
# West of the cemetery, east into the lake, south past the market and the
# terminal, north past El Socorro and Villa Sandino. Every district on the
# game spine is inside it, and so is about a kilometre of Cocibolca.
WEST, EAST = -85.9800, -85.9300
SOUTH, NORTH = 11.9130, 11.9530
METRES_PER_TILE = 5.0

LAT_M = 110574.0                      # metres per degree of latitude
LON_M = 111320.0 * math.cos(math.radians((SOUTH + NORTH) / 2))

W = int(round((EAST - WEST) * LON_M / METRES_PER_TILE))
H = int(round((NORTH - SOUTH) * LAT_M / METRES_PER_TILE))

# ── tiles ────────────────────────────────────────────────────────────────
# Kept in step with the TILES table in granada.html; the ids are the contract
# between the two files, so add at the end and never renumber.
(GROUND, COBBLE, GRASS, TREE, WATER, SHORE, ROOF, WALL, DOOR, PLAZA, FOUNT,
 AWNING, TABLE, KERB, TOWER, SAND, PATIO, PALM, ASPHALT, DIRT, SCRUB, PITCH,
 GRAVE, CHURCH, CWALL, WALLTOP) = range(26)

TILE_NAMES = ('GROUND COBBLE GRASS TREE WATER SHORE ROOF WALL DOOR PLAZA FOUNT '
              'AWNING TABLE KERB TOWER SAND PATIO PALM ASPHALT DIRT SCRUB PITCH '
              'GRAVE CHURCH CWALL WALLTOP').split()

# Must match SOLID in granada.html exactly -- checkworld.js counts the solid
# tiles on both sides and complains if they disagree. A grave is a stone in
# the grass, not a wall: you can walk through the cemetery.
SOLID = (TREE, WATER, ROOF, WALL, FOUNT, AWNING, TABLE, TOWER, PATIO, PALM,
         CHURCH, CWALL, WALLTOP)

# Road class -> (surface tile, width in tiles, does traffic drive here)
ROADS = {
    'motorway':     (ASPHALT, 4, True),  'trunk':        (ASPHALT, 4, True),
    'primary':      (ASPHALT, 3, True),  'secondary':    (ASPHALT, 3, True),
    'tertiary':     (COBBLE, 3, True),   'unclassified': (COBBLE, 2, True),
    'residential':  (COBBLE, 2, True),   'living_street':(COBBLE, 2, True),
    'service':      (DIRT, 1, True),     'track':        (DIRT, 1, False),
    'pedestrian':   (PLAZA, 2, False),   'footway':      (DIRT, 1, False),
    'path':         (DIRT, 1, False),    'steps':        (DIRT, 1, False),
    'bridleway':    (DIRT, 1, False),
    'motorway_link':(ASPHALT, 2, True),  'trunk_link':   (ASPHALT, 2, True),
    'primary_link': (ASPHALT, 2, True),  'secondary_link':(ASPHALT, 2, True),
    'tertiary_link':(COBBLE, 2, True),
}

# Areas, painted in this order so a pitch inside a park still reads as a pitch.
AREAS = [
    (('natural', 'wood'), TREE), (('natural', 'scrub'), SCRUB),
    (('natural', 'grassland'), GRASS), (('natural', 'heath'), SCRUB),
    (('natural', 'sand'), SAND), (('natural', 'beach'), SAND),
    (('natural', 'wetland'), SCRUB),
    (('landuse', 'forest'), TREE), (('landuse', 'grass'), GRASS),
    (('landuse', 'meadow'), GRASS), (('landuse', 'farmland'), GRASS),
    (('landuse', 'village_green'), GRASS), (('landuse', 'cemetery'), GRAVE),
    (('landuse', 'recreation_ground'), GRASS),
    (('leisure', 'park'), GRASS), (('leisure', 'garden'), GRASS),
    (('leisure', 'common'), GRASS), (('leisure', 'playground'), SAND),
    (('leisure', 'pitch'), PITCH), (('leisure', 'stadium'), PITCH),
    (('leisure', 'sports_centre'), PITCH), (('leisure', 'swimming_pool'), WATER),
    (('amenity', 'parking'), ASPHALT), (('amenity', 'marketplace'), AWNING),
    (('landuse', 'retail'), AWNING),
]

FACES = 7           # how many facade colours granada.html paints


# ── fetching ─────────────────────────────────────────────────────────────

# The public instance sheds load with a 504 whenever it feels like it, and a
# whole-city query is exactly the size that provokes one. Try the mirrors.
# Planet-wide instances ONLY. overpass.osm.ch was in this list for one build
# and it serves a Switzerland extract: it answered 200 OK with an almost empty
# result, which sailed through as a successful fetch and blanked the cache.
# Hence the sanity check in fetch() as well.
MIRRORS = ['https://overpass-api.de/api/interpreter',
           'https://overpass.kumi.systems/api/interpreter',
           'https://overpass.private.coffee/api/interpreter']


def overpass(query, tries=3):
    data = urllib.parse.urlencode({'data': query}).encode('utf-8')
    last = None
    for attempt in range(tries):
        for url in MIRRORS:
            req = urllib.request.Request(url, data)
            req.add_header('User-Agent',
                           'fluidez-granada-map/1.0 (language course mockup)')
            try:
                with urllib.request.urlopen(req, timeout=300) as r:
                    return json.loads(r.read().decode('utf-8'))
            except Exception as e:                 # 504, 429, connection reset
                last = '%s: %s' % (url.split('/')[2], e)
                print('   %s' % last)
    raise SystemExit('overpass would not answer -- %s' % last)


def fetch(raw=None):
    """Everything inside a box a little larger than the playable window.

    Pass --raw with Overpass JSON already on disk to rebuild the cache without
    going near the network; the public instances shed load constantly and a
    whole-city query is exactly the size they refuse.
    """
    if raw:
        els = []
        for path in raw:
            got = json.load(io.open(path, encoding='utf-8'))['elements']
            for e in got:
                if 'natural' not in (e.get('tags') or {}) and 'water' in os.path.basename(path):
                    e.setdefault('tags', {})['natural'] = 'water'
            els += got
            print('   %s: %d elements' % (os.path.basename(path), len(got)))
        return cache(els)
    box = '%f,%f,%f,%f' % (SOUTH - .012, WEST - .012, NORTH + .012, EAST + .012)
    keys = ('highway', 'building', 'natural', 'waterway', 'landuse', 'leisure',
            'amenity', 'tourism', 'historic', 'barrier', 'place', 'railway')
    q = ('[out:json][timeout:300];(' +
         ''.join('way["%s"](%s);' % (k, box) for k in keys) +
         ''.join('node["%s"](%s);' % (k, box) for k in
                 ('amenity', 'tourism', 'historic', 'place', 'shop')) +
         ');out geom;')
    print('fetching ways and nodes ...')
    els = overpass(q)['elements']
    # The lake is a multipolygon, so its rings are untagged member ways and the
    # query above cannot see them.
    q2 = ('[out:json][timeout:300];(rel["natural"="water"](%s););way(r)(%s);out geom;'
          % (box, box))
    print('fetching the lake ...')
    water = overpass(q2)['elements']
    for e in water:
        e.setdefault('tags', {})['natural'] = 'water'
    return cache(els + water)


def cache(elements):
    keep = distil(elements)
    streets = sum(1 for f in keep['f'] if f['k'].startswith('hw:'))
    if streets < 400:
        raise SystemExit(
            'refusing to cache: only %d streets came back, and Granada has '
            'over a thousand. That is a mirror serving the wrong region or a '
            'truncated answer, not a real result.' % streets)
    if not os.path.isdir(os.path.dirname(CACHE)):
        os.makedirs(os.path.dirname(CACHE))
    with io.open(CACHE, 'w', encoding='utf-8') as f:
        json.dump(keep, f, ensure_ascii=False, separators=(',', ':'))
    print('cached %d features (%d streets) -> %s' % (len(keep['f']), streets, CACHE))
    return keep


def distil(elements):
    """OSM is verbose and most of it is irrelevant. Keep the shape, the one
    tag that decides what it looks like, and the name if it has one."""
    out = []
    for e in elements:
        t = e.get('tags') or {}
        g = e.get('geometry')
        pts = ([[round(p['lat'], 6), round(p['lon'], 6)] for p in g] if g
               else ([[round(e['lat'], 6), round(e['lon'], 6)]]
                     if 'lat' in e else None))
        if not pts:
            continue
        kind = None
        if 'highway' in t and t['highway'] in ROADS:
            kind = 'hw:' + t['highway']
        elif 'building' in t:
            kind = 'bd:' + (t['building'] if t['building'] != 'yes' else 'house')
        elif t.get('natural') == 'water' or t.get('waterway') in ('riverbank',):
            kind = 'ar:water'
        elif t.get('waterway') in ('stream', 'river'):
            kind = 'wa:' + t['waterway']       # the cauces that cut the city
        elif t.get('place') == 'islet':
            kind = 'ar:islet'
        else:
            for (k, v), _ in AREAS:
                if t.get(k) == v:
                    kind = 'ar:%s=%s' % (k, v)
                    break
        if kind is None and t.get('name') and (
                'amenity' in t or 'tourism' in t or 'historic' in t or 'place' in t):
            kind = 'pt:' + (t.get('amenity') or t.get('tourism') or
                            t.get('historic') or t.get('place'))
        if kind is None:
            continue
        row = {'k': kind, 'p': pts}
        if t.get('name'):
            row['n'] = t['name']
        out.append(row)
    return {'source': 'OpenStreetMap contributors, ODbL',
            'window': [WEST, EAST, SOUTH, NORTH, METRES_PER_TILE], 'f': out}


# ── projection ───────────────────────────────────────────────────────────

def project(lat, lon):
    """Equirectangular, which is honest at this size: the window is 5 km wide
    and the error against a proper projection is under a tile."""
    x = (lon - WEST) * LON_M / METRES_PER_TILE
    y = (NORTH - lat) * LAT_M / METRES_PER_TILE       # north is up
    return x, y


def inside(pts, pad=40):
    return any(-pad <= x <= W + pad and -pad <= y <= H + pad for x, y in pts)


# ── rasterising ──────────────────────────────────────────────────────────

def flood_lake(rows):
    """Water is everywhere you can reach from the east edge without crossing
    the shore. Returns a boolean mask the size of the grid."""
    bar = Image.new('L', (W, H), 0)
    b = ImageDraw.Draw(bar)
    drew = 0
    for k, n, p in rows:
        if k == 'ar:water' and len(p) > 1:
            b.line(p, fill=255, width=1)
            drew += 1
    if not drew:
        return np.zeros((H, W), bool)
    for y in range(H):                       # seed the whole eastern margin
        if bar.getpixel((W - 1, y)) == 0:
            ImageDraw.floodfill(bar, (W - 1, y), 128)
    a = np.asarray(bar)
    mask = (a == 128) | (a == 255)           # the shore itself is water's edge
    if mask.mean() > .75:                    # the shore had a hole in it
        print('   WARNING: the lake flooded %.0f%% of the map -- shoreline gap'
              % (mask.mean() * 100))
    return mask


def dilate(m):
    out = m.copy()
    out[1:, :] |= m[:-1, :]; out[:-1, :] |= m[1:, :]
    out[:, 1:] |= m[:, :-1]; out[:, :-1] |= m[:, 1:]
    return out


def distance_to(mask, maxd):
    """How many tiles to the nearest True, capped. Four dilations is cheaper
    than any proper transform and the cap is all we need."""
    d = np.full(mask.shape, maxd + 1, np.int16)
    d[mask] = 0
    cur = mask
    for k in range(1, maxd + 1):
        nxt = dilate(cur)
        d[nxt & ~cur] = k
        cur = nxt
    return d


def infill_blocks(grid, tints, core):
    """Build the city OSM does not have.

    OSM maps Granada's streets completely and its buildings barely: 685
    footprints for a city of a hundred thousand, almost all of them hotels,
    churches and schools in the tourist core. Rendered as-is you get the real
    street grid running between empty brown lots, which reads as a city that
    was demolished rather than one you live in.

    So every street gets the frontage it really has: a band of houses along
    it, deep near Parque Central and thinning out towards the edge of town,
    with the middle of each block left as yards. The grid is surveyed; the
    houses standing on it are plausible infill, and they never overwrite a
    real building, a park, a pitch or the water.
    """
    street = np.isin(grid, [COBBLE, ASPHALT, PLAZA, KERB, DIRT])
    ds = distance_to(street, 8)
    yy, xx = np.mgrid[0:H, 0:W]
    km = np.hypot(xx - core[0], yy - core[1]) * METRES_PER_TILE / 1000.
    # A colonial house is about twenty metres front to back, so four tiles --
    # deeper than that and the block has no yard left, which is what the first
    # attempt got wrong: every block came out a ring of roof around a
    # courtyard the size of the block.
    depth = np.where(km < .7, 5, np.where(km < 1.4, 4, np.where(km < 2.2, 3, 2)))
    keep = np.where(km < .7, .96, np.where(km < 1.4, .90, np.where(km < 2.2, .70, .40)))
    # One draw per house, not per tile, so a house is kept or dropped whole.
    cell = (((xx // 3) * 73856093) ^ ((yy // 9) * 19349663)).astype(np.int64)
    draw = ((cell * 2654435761) % 997) / 997.0
    # Each house runs a tile shallower or deeper than its neighbour, so the
    # back of a block is ragged the way a real one is.
    jitter = ((cell * 2246822519) % 3).astype(np.int16) - 1
    band = (ds >= 1) & (ds <= depth + jitter) & (grid == GROUND) & (draw < keep)
    grid[band] = ROOF
    face = (((xx // 3) * 5 + (yy // 9) * 3) % FACES).astype(np.uint8)
    tints[band] = face[band]

    # What is left in the middle of a block is yard, and in this city that
    # means fruit trees. Only near the centre, where the blocks are full.
    inner = (ds > depth + 1) & (grid == GROUND) & (km < 1.6)
    seed = (((xx * 374761393) ^ (yy * 668265263)) % 101)
    grid[inner & (seed < 9)] = TREE
    return int(band.sum())


def rasterise(feat):
    """Paint the city as tiles. PIL does the polygons and the thick lines, so
    there is no hand-written scanline fill to get wrong."""
    img = Image.new('L', (W, H), GROUND)
    d = ImageDraw.Draw(img)
    tint = Image.new('L', (W, H), 0)
    dt = ImageDraw.Draw(tint)

    rows = []
    for f in feat['f']:
        pts = [project(la, lo) for la, lo in f['p']]
        if not inside(pts):
            continue
        rows.append((f['k'], f.get('n'), pts))

    area_order = dict((('ar:%s=%s' % kv), i) for i, (kv, _) in enumerate(AREAS))
    area_tile = dict((('ar:%s=%s' % kv), t) for kv, t in AREAS)

    # 1. Cocibolca. The lake is a multipolygon the size of a country, so what
    #    comes back inside the window is a handful of shoreline fragments and
    #    no ring to fill. Flooding in from the east edge -- which is a
    #    kilometre out in open water -- needs only the local shore and gets
    #    the coastline exactly right, bays and all.
    lake = flood_lake(rows)
    grid0 = np.asarray(img, dtype=np.uint8).copy()
    grid0[lake] = WATER
    img = Image.fromarray(grid0); d = ImageDraw.Draw(img)
    for k, n, p in rows:                       # islets are land in the lake
        if k == 'ar:islet' and len(p) > 2:
            d.polygon(p, fill=SCRUB)
    for k, n, p in rows:                       # the cauces, bridged by roads
        if k.startswith('wa:'):
            d.line(p, fill=WATER, width=1)

    # 2. landuse and leisure, biggest first so a pitch beats the park it is in
    def size(p):
        xs = [q[0] for q in p]; ys = [q[1] for q in p]
        return (max(xs) - min(xs)) * (max(ys) - min(ys))
    areas = [r for r in rows if r[0] in area_tile and len(r[2]) > 2]
    areas.sort(key=lambda r: -size(r[2]))
    for k, n, p in areas:
        d.polygon(p, fill=area_tile[k])

    # 3. the streets. Painted widest class first so a main road is not chopped
    #    up by every alley that meets it.
    streets = [r for r in rows if r[0].startswith('hw:')]
    streets.sort(key=lambda r: -ROADS[r[0][3:]][1])
    for k, n, p in streets:
        tile, wide, _ = ROADS[k[3:]]
        d.line(p, fill=tile, width=wide, joint='curve')
        for x, y in p:                          # PIL leaves gaps at the joins
            if wide > 1:
                d.ellipse([x - wide/2., y - wide/2., x + wide/2., y + wide/2.],
                          fill=tile)

    grid = np.asarray(img, dtype=np.uint8).copy()
    tints = np.asarray(tint, dtype=np.uint8).copy()

    # 4. kerbs: one tile of pavement wherever the ground meets a paved street
    paved = np.isin(grid, [COBBLE, ASPHALT])
    edge = np.zeros_like(paved)
    edge[1:, :] |= paved[:-1, :]; edge[:-1, :] |= paved[1:, :]
    edge[:, 1:] |= paved[:, :-1]; edge[:, :-1] |= paved[:, 1:]
    grid[edge & np.isin(grid, [GROUND, GRASS, SCRUB])] = KERB

    # 5. the buildings, last, because a house always wins against a street
    img = Image.fromarray(grid); d = ImageDraw.Draw(img)
    tint = Image.fromarray(tints); dt = ImageDraw.Draw(tint)
    houses = []
    for k, n, p in rows:
        if not k.startswith('bd:') or len(p) < 3:
            continue
        kind = k[3:]
        church = kind in ('church', 'cathedral', 'chapel')
        # crc32, not hash(): Python randomises hash() per process, and a map
        # whose houses change colour on every build is not a map.
        face = zlib.crc32(((n or '') + '%.5f' % p[0][0]).encode('utf-8')) % FACES
        d.polygon(p, fill=CHURCH if church else ROOF)
        dt.polygon(p, fill=face)
        houses.append((kind, n, p, church))

    grid = np.asarray(img, dtype=np.uint8).copy()
    tints = np.asarray(tint, dtype=np.uint8).copy()

    # 5b. the frontage OSM is missing, along every street
    core = (W // 2, H // 2)
    for k, n, p in rows:
        if n == u'Parque Central':
            core = (int(sum(q[0] for q in p) / len(p)),
                    int(sum(q[1] for q in p) / len(p)))
    built = infill_blocks(grid, tints, core)

    # 6. facades. A roof tile with open ground to the south becomes the wall
    #    you see, which is what makes a block read as houses and not as one
    #    slab of terracotta.
    roof = np.isin(grid, [ROOF, CHURCH])
    below = np.zeros_like(roof)
    below[:-1, :] = roof[1:, :]
    facade = roof & ~below
    grid[facade & (grid == ROOF)] = WALL
    grid[facade & (grid == CHURCH)] = CWALL

    # 7. doors: one per building, in the middle of its longest facade run
    grid = punch_doors(grid, tints)

    # 8. patios. Every colonial house here is built around one and they are
    #    what stops a block reading as a single field of roof.
    grid = carve_patios(grid, tints)

    # 9. trees in the parks and the woods, and palms on the shore
    rnd = np.random.RandomState(20260824)
    green = np.argwhere(np.isin(grid, [GRASS]))
    if len(green):
        pick = green[rnd.choice(len(green), size=len(green) // 14, replace=False)]
        for y, x in pick:
            grid[y, x] = TREE
    sand = np.argwhere(grid == SAND)
    if len(sand):
        pick = sand[rnd.choice(len(sand), size=max(1, len(sand) // 40), replace=False)]
        for y, x in pick:
            grid[y, x] = PALM

    return grid, tints, rows, built


def stamp_roads(grid, edges):
    """Paint the centre of every drivable street back over whatever landed on
    top of it -- and paint it from the GRAPH, not from the source geometry.

    Those are not the same line. The graph rounds every point to a tile,
    because a vehicle has to be somewhere definite, and a line drawn through
    the unrounded points can sit a tile away from the line the traffic
    actually drives. Stamping the source geometry left caponeras driving
    through roofs in the middle of Calle Atravesada; stamping the graph's own
    points cannot, because it is the same list of points.
    """
    img = Image.fromarray(grid)
    d = ImageDraw.Draw(img)
    for a, b, cls, pts in edges:
        d.line([(x, y) for x, y in pts], fill=ROADS[cls][0], width=1)
    return np.asarray(img, dtype=np.uint8).copy()


def punch_doors(grid, tints):
    """A door in the middle of the longest unbroken run of wall, per building.
    Runs are found row by row, which is all a facade ever is."""
    walls = np.isin(grid, [WALL, CWALL])
    for y in range(H):
        x = 0
        row = walls[y]
        while x < W:
            if not row[x]:
                x += 1
                continue
            x0 = x
            while x < W and row[x] and tints[y, x] == tints[y, x0]:
                x += 1
            if x - x0 >= 3:
                grid[y, (x0 + x) // 2] = DOOR
    return grid


def carve_patios(grid, tints):
    """Hollow out anything big enough to have a courtyard. Erode three times:
    a tile only becomes patio if it is roof with roof on all four sides three
    deep, so an ordinary four-tile house keeps its roof and only the big
    places -- the schools, the hotels, the convents -- open up inside."""
    roof = (grid == ROOF)
    inner = roof.copy()
    for _ in range(3):
        nxt = inner.copy()
        nxt[1:, :] &= inner[:-1, :]; nxt[:-1, :] &= inner[1:, :]
        nxt[:, 1:] &= inner[:, :-1]; nxt[:, :-1] &= inner[:, 1:]
        inner = nxt
    grid[inner] = PATIO
    ys, xs = np.nonzero(inner)
    for i in range(0, len(ys), 23):                 # a tree in some of them
        grid[ys[i], xs[i]] = PALM
    return grid


# ── the street graph, which is what vehicles drive on ────────────────────

def graph(rows):
    """Nodes where streets meet, edges along the middle of the road.

    Vehicles need the centreline, not the painted tiles: a car following
    painted pixels has to guess where the lane is, and it will guess wrong at
    every junction. So the lines ship as lines.
    """
    drive = [(k[3:], n, p) for k, n, p in rows
             if k.startswith('hw:') and ROADS[k[3:]][2]]
    key = lambda p: (int(round(p[0])), int(round(p[1])))
    seen = {}
    for cls, n, p in drive:
        for q in p:
            k = key(q)
            seen[k] = seen.get(k, 0) + 1
    nodes, index = [], {}

    def node_id(q):
        k = key(q)
        if k not in index:
            index[k] = len(nodes)
            nodes.append(k)
        return index[k]

    edges = []
    for cls, n, p in drive:
        # Strictly inside the window: a vehicle seeded on a point that was
        # clipped off the painted map drives through nothing at all.
        p = [q for q in p if 0 <= q[0] < W and 0 <= q[1] < H]
        if len(p) < 2:
            continue
        # split the way wherever another way touches it
        run = [p[0]]
        for q in p[1:]:
            run.append(q)
            if seen.get(key(q), 0) > 1 or q is p[-1]:
                if len(run) > 1:
                    edges.append((node_id(run[0]), node_id(run[-1]), cls,
                                  [key(r) for r in run]))
                run = [q]
    return nodes, edges


# ── packing ──────────────────────────────────────────────────────────────

B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'


def varint(n):
    """Six bits a character, top bit says another follows. Values here are
    small -- tile runs and coordinate deltas -- so most take one character."""
    out = []
    n = int(n)
    while True:
        c = n & 31
        n >>= 5
        out.append(B64[c | (32 if n else 0)])
        if not n:
            return ''.join(out)


def zig(n):
    n = int(n)
    return (n << 1) ^ (n >> 31) if n >= 0 else ((-n) << 1) - 1


def rle(a):
    """Run-length encode a tile plane. The city is enormous and repetitive --
    a block of roof, a street, a kilometre of lake -- so this is the whole
    reason the map fits in one HTML file."""
    flat = a.reshape(-1)
    out = []
    i, n = 0, len(flat)
    while i < n:
        v = flat[i]
        j = i + 1
        while j < n and flat[j] == v:
            j += 1
        out.append(varint(int(v)))
        out.append(varint(j - i))
        i = j
    return ''.join(out)


def pack(grid, tints, nodes, edges, spots):
    parts = ['%d,%d' % (W, H), rle(grid), rle(tints)]
    # nodes, delta-coded along the list. The count leads, because the reader
    # on the other side has no way to know where a varint stream ends.
    s, px, py = [varint(len(nodes))], 0, 0
    for x, y in nodes:
        s.append(varint(zig(x - px))); s.append(varint(zig(y - py)))
        px, py = x, y
    parts.append(''.join(s))
    # edges: a, b, class, then the polyline as deltas from the first node
    cls_list = sorted(set(e[2] for e in edges))
    s = [varint(len(edges))]
    for a, b, cls, pts in edges:
        s.append(varint(a)); s.append(varint(b))
        s.append(varint(cls_list.index(cls)))
        s.append(varint(len(pts)))
        px = py = 0
        for i, (x, y) in enumerate(pts):
            if i == 0:
                s.append(varint(zig(x))); s.append(varint(zig(y)))
            else:
                s.append(varint(zig(x - px))); s.append(varint(zig(y - py)))
            px, py = x, y
    parts.append(','.join(cls_list) + '|' + ''.join(s))
    parts.append(json.dumps(spots, ensure_ascii=False, separators=(',', ':')))
    # A seventh line the game never reads and mockups/checkworld.js does: if
    # the injection ever truncates, or the decoder drifts from the packer, the
    # harness says so instead of the city quietly coming out half painted.
    parts.append(json.dumps({
        'w': W, 'h': H,
        'tiles': zlib.crc32(grid.tobytes()),
        'tint': zlib.crc32(tints.tobytes()),
        'nodes': len(nodes), 'edges': len(edges), 'spots': len(spots),
        'solid': int(np.isin(grid, SOLID).sum()),
    }, separators=(',', ':')))
    blob = '\n'.join(parts)
    # It lands inside a JS template literal, so any of these would end it early.
    for bad in ('`', '\\', '${'):
        if bad in blob:
            raise SystemExit('map data contains %r, which would break the '
                             'template literal it is injected into' % bad)
    return blob


# ── the named places an NPC can stand at ─────────────────────────────────

WANTED = {
    u'Parque Central': 'centro', u'Catedral de Nuestra Se\xf1ora de la Asunci\xf3n': 'centro',
    u'Palacio Municipal': 'centro', u'Plaza la Fuente': 'centro',
    u'Plazuela de los Leones': 'centro', u'Palacio Episcopal': 'centro',
    u'Mercado Municipal': 'mercado', u'Terminal Mercado': 'mercado',
    u'Supermercado Pal\xed Granada': 'mercado',
    u'Iglesia de Xalteva': 'xalteva', u'Plaza Xalteva': 'xalteva',
    u'Fortaleza La Polvora': 'xalteva', u'Cementerio Municipal de Granada': 'xalteva',
    u'Iglesia de Nuestra Se\xf1ora de Guadalupe': 'guadalupe',
    u'Iglesia de La Merced': 'centro',
    u'Transnica & King Quality': 'terminal',
    u'Antigua Estaci\xf3n de Tren Granada': 'terminal',
    u'Parque Sandino': 'terminal', u'Plaza Los Leones': 'terminal',
    u'Estadio Roque Tadeo Zavala': 'trabajo',
    u'Hospital Granada': 'tramites', u'Hospital Jap\xf3n-Nicaragua': 'tramites',
    u'Parroquia Nuestra Se\xf1ora del Socorro': 'fiestas',
    u'Iglesia Vieja Ermita El Socorro': 'fiestas',
    u'Parque Otra Banda': 'barrio', u'Barrio Posintepe': 'pantanal',
    u'Isla El Castillo': 'afuera', u'Isla de los Monos': 'afuera',
}


def spots_of(rows):
    out = []
    for k, n, p in rows:
        if not n or n not in WANTED:
            continue
        xs = [q[0] for q in p]; ys = [q[1] for q in p]
        x, y = int(sum(xs) / len(xs)), int(sum(ys) / len(ys))
        if not (0 <= x < W and 0 <= y < H):
            continue
        if any(s['n'] == n for s in out):
            continue
        out.append({'n': n, 'd': WANTED[n], 'x': x, 'y': y})
    return out


# ── looking at it ────────────────────────────────────────────────────────

PREVIEW = {
    GROUND: (150, 133, 108), COBBLE: (138, 122, 99), GRASS: (95, 138, 74),
    TREE: (62, 107, 51), WATER: (43, 108, 134), SHORE: (194, 169, 124),
    ROOF: (168, 80, 58), WALL: (216, 154, 78), DOOR: (90, 58, 36),
    PLAZA: (201, 184, 150), FOUNT: (62, 138, 166), AWNING: (196, 104, 95),
    TABLE: (62, 142, 138), KERB: (160, 148, 126), TOWER: (227, 207, 163),
    SAND: (194, 169, 124), PATIO: (214, 200, 168), PALM: (76, 127, 62),
    ASPHALT: (94, 90, 88), DIRT: (166, 146, 114), SCRUB: (122, 140, 92),
    PITCH: (106, 152, 82), GRAVE: (176, 172, 158), CHURCH: (142, 64, 48),
    CWALL: (227, 207, 163), WALLTOP: (120, 108, 90),
}


def preview(grid, out_dir, rows, spots):
    if not os.path.isdir(out_dir):
        os.makedirs(out_dir)
    lut = np.zeros((256, 3), dtype=np.uint8)
    for t, c in PREVIEW.items():
        lut[t] = c
    rgb = lut[grid]
    Image.fromarray(rgb).save(os.path.join(out_dir, 'granada-city.png'))

    # the colonial core, big enough to see whether a street reads as a street
    cx, cy = None, None
    for s in spots:
        if s['n'] == u'Parque Central':
            cx, cy = s['x'], s['y']
    cx, cy = cx or W // 2, cy or H // 2
    x0, y0 = max(0, cx - 110), max(0, cy - 90)
    crop = rgb[y0:y0 + 180, x0:x0 + 220]
    Image.fromarray(crop).resize((220 * 5, 180 * 5), Image.NEAREST).save(
        os.path.join(out_dir, 'granada-centro.png'))
    return os.path.join(out_dir, 'granada-city.png')


# ── injecting ────────────────────────────────────────────────────────────

BEGIN = '/* ══ MAP DATA — generated by scripts/osm_granada.py, do not edit ══ */'
END = '/* ══ end map data ══ */'


def inject(blob):
    with io.open(HTML, encoding='utf-8') as f:
        html = f.read()
    payload = BEGIN + '\nconst MAPDATA = `' + blob + '`;\n' + END
    if BEGIN in html:
        a = html.index(BEGIN)
        b = html.index(END) + len(END)
        html = html[:a] + payload + html[b:]
    else:
        raise SystemExit('no map markers in granada.html -- add %s / %s' % (BEGIN, END))
    with io.open(HTML, 'w', encoding='utf-8', newline='\n') as f:
        f.write(html)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--fetch', action='store_true')
    ap.add_argument('--raw', nargs='*', help='Overpass JSON on disk to rebuild from')
    ap.add_argument('--preview')
    ap.add_argument('--report')
    ap.add_argument('--no-inject', action='store_true')
    a = ap.parse_args()

    feat = (fetch(a.raw) if (a.fetch or a.raw)
            else json.load(io.open(CACHE, encoding='utf-8')))
    grid, tints, rows, built = rasterise(feat)
    nodes, edges = graph(rows)
    grid = stamp_roads(grid, edges)
    spots = spots_of(rows)
    blob = pack(grid, tints, nodes, edges, spots)

    counts = dict((int(t), int(c)) for t, c in zip(*np.unique(grid, return_counts=True)))
    name = dict(zip(range(26), TILE_NAMES))
    L = [u'window   %.4f..%.4f  %.4f..%.4f  at %g m/tile'
         % (WEST, EAST, SOUTH, NORTH, METRES_PER_TILE),
         u'grid     %d x %d tiles  (%.2f x %.2f km)'
         % (W, H, W * METRES_PER_TILE / 1000., H * METRES_PER_TILE / 1000.),
         u'features %d used of %d in the cache' % (len(rows), len(feat['f'])),
         u'streets  %d ways -> %d nodes, %d edges'
         % (sum(1 for r in rows if r[0].startswith('hw:')), len(nodes), len(edges)),
         u'houses   %d surveyed + %d tiles of street frontage built in'
         % (sum(1 for r in rows if r[0].startswith('bd:')), built),
         u'spots    %d named places' % len(spots),
         u'packed   %.0f KB of map data' % (len(blob) / 1024.),
         u'tiles    ' + u'  '.join(
             u'%s %d' % (name.get(t, t), c) for t, c in
             sorted(counts.items(), key=lambda kv: -kv[1])[:14])]
    for s in spots:
        L.append(u'  %-46s %-9s %4d,%4d' % (s['n'][:46], s['d'], s['x'], s['y']))
    if a.preview:
        L.append(u'preview  ' + preview(grid, a.preview, rows, spots))
    if not a.no_inject:
        inject(blob)
        L.append(u'injected into mockups/granada.html')
    report = u'\n'.join(L) + u'\n'
    if a.report:
        io.open(a.report, 'w', encoding='utf-8').write(report)
    print(report.encode('ascii', 'replace').decode('ascii'))


if __name__ == '__main__':
    main()
