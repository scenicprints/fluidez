# -*- coding: utf-8 -*-
"""Pulls the Spanish verb engine out of the original Flutter source into verbs.json.

The conjugator was hardcoded in main.dart, which meant a new language could never
get a verb trainer without an app release. Moving the tables into the language's
own content repo fixes that.
"""
import io, json, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "reference", "flutter-app-original.dart")
OUT = os.path.join(HERE, "..", "build", "verbs.json")

src = io.open(SRC, encoding="utf-8").read()


def block(start_marker, open_ch, close_ch):
    """Grab a balanced {...} or [...] literal that follows a marker."""
    i = src.index(start_marker) + len(start_marker)
    i = src.index(open_ch, i)
    depth, j = 0, i
    while j < len(src):
        if src[j] == open_ch:
            depth += 1
        elif src[j] == close_ch:
            depth -= 1
            if depth == 0:
                return src[i:j + 1]
        j += 1
    sys.exit("unbalanced literal after " + start_marker)


def dart_to_json(text):
    # Dart allows trailing commas; JSON does not.
    text = re.sub(r",(\s*[}\]])", r"\1", text)
    return json.loads(text)


irreg = dart_to_json(block("IRREG = ", "{", "}"))
verb_list = dart_to_json(block("VERB_LIST = ", "[", "]"))
subjects = dart_to_json(block("SUBJECTS = ", "[", "]"))
reg = {
    "ar": dart_to_json(block("_regAr = ", "{", "}")),
    "er": dart_to_json(block("_regEr = ", "{", "}")),
    "ir": dart_to_json(block("_regIr = ", "{", "}")),
}

# Every irregular must also be listed as a drillable verb, or it can never appear.
missing = [v for v in irreg if v not in verb_list]
if missing:
    sys.exit("irregular verbs missing from VERB_LIST: %s" % missing)

# Shape check: 5 subjects, so every conjugation row must have 5 entries.
n = len(subjects)
for verb, tenses in irreg.items():
    for tense, forms in tenses.items():
        if len(forms) != n:
            sys.exit("%s/%s has %d forms, expected %d" % (verb, tense, len(forms), n))
for kind, tenses in reg.items():
    for tense, endings in tenses.items():
        if len(endings) != n:
            sys.exit("regular -%s/%s has %d endings, expected %d" % (kind, tense, len(endings), n))

doc = {
    "subjects": subjects,
    "tenses": ["present", "past", "future"],
    "regular": reg,
    "irregular": irreg,
    "drill": verb_list,
}

os.makedirs(os.path.dirname(OUT), exist_ok=True)
with io.open(OUT, "w", encoding="utf-8") as f:
    f.write(json.dumps(doc, ensure_ascii=False, indent=2) + "\n")

print("subjects  : %s" % ", ".join(subjects))
print("tenses    : %d" % len(doc["tenses"]))
print("regular   : %s" % ", ".join(sorted(reg)))
print("irregular : %d verbs" % len(irreg))
print("drillable : %d verbs" % len(verb_list))
print("wrote %s" % os.path.normpath(OUT))
