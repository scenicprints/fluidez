# -*- coding: utf-8 -*-
"""Every beat must be winnable: the tiles laid down in their written order have
to be one of the accepted answers, and every accepted answer has to be
buildable from the chunks the tray actually offers."""
import io, unicodedata

PUNCT = set(u"¿?¡!.,;:\"'")

def norm(t):
    t = t.lower()
    t = u"".join(c for c in unicodedata.normalize("NFD", t) if not unicodedata.combining(c))
    t = u"".join(u" " if c in PUNCT else c for c in t)
    return u" ".join(t.split())

def strings_in(seg):
    """Pull the single-quoted literals out of a JS array literal."""
    out, i = [], 0
    while True:
        a = seg.find(u"'", i)
        if a < 0:
            return out
        b = seg.find(u"'", a + 1)
        if b < 0:
            return out
        out.append(seg[a + 1:b])
        i = b + 1

def field(block, key):
    at = block.find(key + u":[")
    if at < 0:
        return []
    start = at + len(key) + 2
    end = block.find(u"]", start)
    return strings_in(block[start:end])

s = io.open("granada.html", encoding="utf-8").read()

# Beats start at "{ es:'" and run to the end of their decoys array.
blocks, i = [], 0
while True:
    a = s.find(u"{ es:'", i)
    if a < 0:
        break
    d = s.find(u"decoys:[", a)
    if d < 0:
        break
    e = s.find(u"] }", d)
    blocks.append(s[a:e])
    i = e

bad = 0
for b in blocks:
    say = field(b, u"say") or strings_in(b[b.find(u"say:'"):b.find(u"say:'") + 200])
    say = say[0] if say else u"?"
    tiles, extra, ok = field(b, u"tiles"), field(b, u"extra"), field(b, u"ok")
    ok_n = set(norm(x) for x in ok)
    in_order = norm(u" ".join(tiles))
    winnable = in_order in ok_n
    pool = set(norm(u" ".join(tiles + extra)).split())
    unbuildable = [x for x in ok if not set(norm(x).split()) <= pool]
    if not winnable or unbuildable:
        bad += 1
    print(u"%-30s tiles=%d extra=%d ok=%d  %s"
          % (say[:28], len(tiles), len(extra), len(ok),
             u"" if winnable else u"<-- CORRECT ORDER REJECTED"))
    print(u"    builds: %s" % in_order)
    for u_ in unbuildable:
        print(u"    UNBUILDABLE accepted answer: %s" % u_)

print(u"\nbeats: %d   problem beats: %d" % (len(blocks), bad))
