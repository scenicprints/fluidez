# -*- coding: utf-8 -*-
"""Bundles a language's whole course into one file.

Downloading 123 separate JSON files took over two minutes on a good
connection, which is not a first run anybody should have on Nicaraguan
mobile data. This flattens the lot into content/pack.json, so the app makes
one request instead, and writes a tiny content/version.json so checking for
updates does not mean pulling the whole pack down again.

Run inside a language content repo:

    python build-pack.py --root . --language es-ni --version 2026-08-17+abc1234

It is what the repo's GitHub Action runs on every push, so publishing a
lesson stays "edit the JSON, commit" and nothing else.
"""
import argparse, io, json, os, sys

def read(path):
    with io.open(path, encoding="utf-8") as f:
        return json.load(f)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--language", required=True)
    ap.add_argument("--version", required=True)
    ap.add_argument("--out", default=None)
    args = ap.parse_args()

    content_dir = os.path.join(args.root, "content")
    manifest_path = os.path.join(content_dir, "manifest.json")
    if not os.path.exists(manifest_path):
        sys.exit("no content/manifest.json in %s" % os.path.abspath(args.root))
    manifest = read(manifest_path)

    problems = []

    def load(rel, what):
        p = os.path.join(content_dir, rel)
        if not os.path.exists(p):
            problems.append("%s: missing file %s" % (what, rel))
            return None
        try:
            return read(p)
        except ValueError as e:
            problems.append("%s: %s is not valid JSON (%s)" % (what, rel, e))
            return None

    # dictionary — several files merged into one map
    dictionary = {}
    for rel in manifest.get("dictionary", []):
        part = load(rel, "dictionary")
        if isinstance(part, dict):
            dictionary.update(part)
        elif part is not None:
            problems.append("dictionary: %s should be an object" % rel)

    # patterns
    patterns = []
    for rel in manifest.get("patterns", []):
        part = load(rel, "patterns")
        if isinstance(part, list):
            patterns.extend(part)
        elif isinstance(part, dict):
            patterns.append(part)

    def collect(key):
        out = []
        for entry in manifest.get(key, []):
            rel = entry.get("path")
            if not rel:
                problems.append("%s: entry %s has no path" % (key, entry.get("id")))
                continue
            body = load(rel, key)
            if body is None:
                continue
            merged = dict(entry)
            merged.pop("path", None)
            merged.update(body)
            out.append(merged)
        return out

    lessons = collect("lessons")
    scenarios = collect("scenarios")

    verbs = load(manifest["verbs"], "verbs") if manifest.get("verbs") else None
    emergency = load(manifest["emergency"], "emergency") if manifest.get("emergency") else None

    # Sanity checks worth failing a push over — a broken pack breaks the app
    # for everyone at once, and it is far cheaper to catch it here.
    ids = {}
    for kind, items in (("lesson", lessons), ("scenario", scenarios)):
        for item in items:
            i = item.get("id")
            if not i:
                problems.append("%s with no id" % kind)
            elif (kind, i) in ids:
                problems.append("duplicate %s id: %s" % (kind, i))
            ids[(kind, i)] = True
            if kind == "lesson" and not item.get("sn"):
                problems.append("lesson %s has no sentences" % i)
            if kind == "scenario" and not item.get("steps"):
                problems.append("scenario %s has no steps" % i)

    features = manifest.get("features")
    if not features:
        features = ["words"]
        if lessons: features += ["reader", "review", "order"]
        if scenarios: features.append("scenes")
        if patterns: features.append("patterns")
        if verbs: features.append("verbs")
        # Audio is opt-in: several languages have no speech voice at all.

    pack = {
        "version": args.version,
        "language": args.language,
        "name": manifest.get("name"),
        "speech": manifest.get("speech"),
        "features": features,
        "dictionary": dictionary,
        "patterns": patterns,
        "lessons": lessons,
        "scenarios": scenarios,
        "verbs": verbs,
        "emergency": emergency,
    }

    if problems:
        for p in problems:
            print("ERROR: %s" % p)
        sys.exit("refusing to build a broken pack (%d problem(s))" % len(problems))

    out_dir = args.out or content_dir
    pack_path = os.path.join(out_dir, "pack.json")
    with io.open(pack_path, "w", encoding="utf-8") as f:
        json.dump(pack, f, ensure_ascii=False, separators=(",", ":"))

    # Tiny sidecar so "is there anything new?" is a 60-byte request.
    with io.open(os.path.join(out_dir, "version.json"), "w", encoding="utf-8") as f:
        json.dump({"version": args.version, "lessons": len(lessons),
                   "scenarios": len(scenarios), "words": len(dictionary)},
                  f, ensure_ascii=False)

    size = os.path.getsize(pack_path)
    print("pack.json  %d lessons, %d scenarios, %d words, %d patterns%s" %
          (len(lessons), len(scenarios), len(dictionary), len(patterns),
           ", verbs" if verbs else ""))
    print("features   %s" % ", ".join(features))
    print("size       %.1f KB" % (size / 1024.0))
    print("version    %s" % args.version)


if __name__ == "__main__":
    main()
