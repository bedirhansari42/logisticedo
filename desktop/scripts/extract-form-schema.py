#!/usr/bin/env python3
"""documents.html içindeki form bölümlerini (details.fsec) okuyup src/lib/form-schema.json üretir.

Böylece React formu elle yazılmaz; alan, etiket, seçenek ve ızgara düzeni eski sayfayla birebir aynı kalır.
B (taraflar), D (kalemler) ve O (palet) bölümleri özel bileşendir; şemaya yalnızca başlıkları girer.
Yeniden üretmek için:  python3 scripts/extract-form-schema.py
"""
import json
import re
import sys
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT.parent / "documents.html"
OUT = ROOT / "src" / "lib" / "form-schema.json"
VOID = {"input", "br", "img", "meta", "link", "hr", "source", "path", "circle", "rect"}


class Node:
    def __init__(self, tag, attrs, parent):
        self.tag, self.attrs, self.parent = tag, dict(attrs), parent
        self.children, self.text = [], ""

    @property
    def classes(self):
        return (self.attrs.get("class") or "").split()

    def walk(self):
        yield self
        for c in self.children:
            yield from c.walk()

    def find(self, pred):
        return next((n for n in self.walk() if pred(n)), None)

    def all_text(self):
        return (self.text + "".join(c.all_text() + c.tail for c in self.children)).strip()

    tail = ""


class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node("root", [], None)
        self.cur = self.root

    def handle_starttag(self, tag, attrs):
        n = Node(tag, attrs, self.cur)
        self.cur.children.append(n)
        if tag not in VOID:
            self.cur = n

    def handle_startendtag(self, tag, attrs):
        self.cur.children.append(Node(tag, attrs, self.cur))

    def handle_endtag(self, tag):
        n = self.cur
        while n is not None and n.tag != tag:
            n = n.parent
        if n is not None and n.parent is not None:
            self.cur = n.parent

    def handle_data(self, data):
        if self.cur.children:
            self.cur.children[-1].tail += data
        else:
            self.cur.text += data


def placeholder_of(el):
    ph = {"key": None, "text": el.attrs.get("placeholder")}
    for pair in (el.attrs.get("data-i18n-attr") or "").split(";"):
        if ":" in pair:
            a, k = [s.strip() for s in pair.split(":", 1)]
            if a == "placeholder":
                ph["key"] = k
    return ph


def span_of(classes):
    for c in classes:
        m = re.fullmatch(r"span-(\d)", c)
        if m:
            return int(m.group(1))
    return 1


def grid_of(node, stop):
    n = node.parent
    while n is not None and n is not stop:
        for c in n.classes:
            m = re.fullmatch(r"fgrid--(\d)", c)
            if m:
                return id(n), int(m.group(1))
        n = n.parent
    return None, None


def read_field(div):
    label = div.find(lambda n: n.tag == "label")
    ctl = div.find(lambda n: n.tag in ("input", "select", "textarea") and "data-bind" in n.attrs)
    if not ctl:
        return None
    f = {
        "kind": "field",
        "bind": ctl.attrs["data-bind"],
        "control": ctl.tag,
        "labelKey": (label.attrs.get("data-i18n") if label else None) or None,
        "labelText": label.all_text() if label else "",
        "span": span_of(div.classes),
    }
    if ctl.tag == "input":
        f["type"] = ctl.attrs.get("type", "text")
    for a, k in (("inputmode", "inputmode"), ("list", "list"), ("maxlength", "maxlength"), ("rows", "rows"), ("autocapitalize", "autocapitalize")):
        if ctl.attrs.get(a):
            f[k] = ctl.attrs[a]
    if "mono-num" in ctl.classes:
        f["mono"] = True
    ph = placeholder_of(ctl)
    if ph["key"]:
        f["placeholderKey"] = ph["key"]
    elif ph["text"]:
        f["placeholder"] = ph["text"]
    if ctl.tag == "select":
        opts = []
        for o in ctl.children:
            if o.tag != "option":
                continue
            opts.append({"value": o.attrs.get("value", o.all_text()), "text": o.all_text(), "labelKey": o.attrs.get("data-i18n"), "en": o.attrs.get("lang") == "en"})
        f["options"] = opts
    hint = div.find(lambda n: n.tag == "p" and "muted" in n.classes and n.attrs.get("data-i18n"))
    if hint:
        f["hintKey"] = hint.attrs["data-i18n"]
    return f


def read_check(lbl):
    inp = lbl.find(lambda n: n.tag == "input" and n.attrs.get("type") == "checkbox" and "data-bind" in n.attrs)
    sp = lbl.find(lambda n: n.tag == "span")
    if not inp:
        return None
    return {"kind": "check", "bind": inp.attrs["data-bind"], "labelKey": sp.attrs.get("data-i18n") if sp else None, "labelText": sp.all_text() if sp else "", "span": span_of(lbl.classes)}


def read_section(det):
    summary = det.find(lambda n: n.tag == "summary")
    spans = [c for c in summary.children if c.tag == "span"]
    letter = spans[0].all_text()
    title_key = spans[1].attrs.get("data-i18n") if len(spans) > 1 else None
    body = det.find(lambda n: n.tag == "div" and "fsec-body" in n.classes)
    sec = {"letter": letter, "titleKey": title_key, "nodes": []}
    if letter in ("B", "D", "O"):
        return sec

    def visit(n):
        for c in n.children:
            if c.tag == "div" and "field" in c.classes:
                f = read_field(c)
                if f:
                    f["grid"], f["cols"] = grid_of(c, body)
                    sec["nodes"].append(f)
            elif c.tag == "label" and "check" in c.classes:
                ck = read_check(c)
                if ck:
                    ck["grid"], ck["cols"] = grid_of(c, body)
                    sec["nodes"].append(ck)
            elif c.tag == "div" and "sub-head" in c.classes:
                lab = c.find(lambda x: x.attrs.get("data-i18n"))
                hint = [x for x in c.walk() if x.attrs.get("data-i18n")]
                sec["nodes"].append({"kind": "sub", "labelKey": hint[0].attrs["data-i18n"] if hint else None, "hintKey": hint[1].attrs["data-i18n"] if len(hint) > 1 else None})
            elif c.tag == "div" and ("dist" in c.classes or "sum-box" in c.classes or "items-bar" in c.classes):
                continue  # özel bileşenler kodda
            else:
                visit(c)

    visit(body)
    # grid kimliklerini küçük sayılara çevir
    ids = {}
    for n in sec["nodes"]:
        g = n.get("grid")
        if g is not None:
            n["grid"] = ids.setdefault(g, len(ids))
        elif "grid" in n:
            del n["grid"]
        if n.get("cols") is None:
            n.pop("cols", None)
    return sec


def main():
    tree = Tree()
    tree.feed(SRC.read_text(encoding="utf-8"))
    sections = [read_section(d) for d in tree.root.walk() if d.tag == "details" and "fsec" in d.classes]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"sections": sections}, ensure_ascii=False, indent=1), encoding="utf-8")
    total = sum(len(s["nodes"]) for s in sections)
    print(f"{len(sections)} bölüm, {total} düğüm → {OUT.relative_to(ROOT)}")
    for s in sections:
        print(" ", s["letter"], s["titleKey"], len(s["nodes"]))


if __name__ == "__main__":
    sys.exit(main())
