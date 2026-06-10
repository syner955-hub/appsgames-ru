#!/usr/bin/env python3
"""
Извлекает реальные бонусы брендов с casino.ru через BeautifulSoup.
Берёт ТОЛЬКО .bonus-item внутри .bonus-tables/.casino-bonuses,
игнорирует .additional-bonus* (промокоды самого casino.ru) и шапку.

Запуск:
  python3 scripts/casino_extract.py            # пилот: первые 10 exact
  python3 scripts/casino_extract.py --all       # все exact
"""
import json, os, re, sys, time, subprocess
from bs4 import BeautifulSoup

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
CACHE = "/tmp/cru-cache"
os.makedirs(CACHE, exist_ok=True)
ALL = "--all" in sys.argv

m = json.load(open("reports/casino-match-map.json", encoding="utf-8"))
exact = [(k, v) for k, v in m.items() if v and v["conf"] == "exact"]
todo = exact if ALL else exact[:10]


def fetch(slug):
    cf = os.path.join(CACHE, slug + ".html")
    if os.path.exists(cf):
        return open(cf, encoding="utf-8").read()
    url = f"https://casino.ru/{slug}/"
    html = subprocess.run(["curl", "-sL", "-A", UA, "--compressed", "-m", "30", url],
                          capture_output=True, text=True).stdout
    open(cf, "w", encoding="utf-8").write(html)
    return html


def extract(html):
    s = BeautifulSoup(html, "lxml")
    for h in s.select("header, .header, .site-header"):
        h.decompose()
    # реальные бонусы казино — .bonus-item, но НЕ additional-bonus
    items = [el for el in s.select(".bonus-item")
             if "additional-bonus" not in " ".join(el.get("class", []))]
    if not items:
        return None

    # Выбираем ОСНОВНОЙ приветственный бонус, а не промо-фриспины.
    # Приоритет: есть % (депозитный матч) + слова «приветств/первый/депозит».
    def score(el):
        t = (el.select_one(".bonus-item__title") or el).get_text(" ", strip=True).lower()
        sc = 0
        if re.search(r"\d{2,4}\s*%", t): sc += 10            # депозитный матч
        if re.search(r"приветств|первый|депозит", t): sc += 5
        if "промокод" in t: sc -= 2                          # промо casino.ru — менее релевантно
        if re.search(r"^\s*\d{1,3}\s*fs|^\s*\d{1,3}\s*фриспин", t): sc -= 3  # чисто фриспины
        return sc
    first = max(items, key=score)
    def txt(sel):
        e = first.select_one(sel)
        return re.sub(r"\s+", " ", e.get_text(" ", strip=True)).strip() if e else None
    title = txt(".bonus-item__title")
    pct = fs = None
    if title:
        mp = re.search(r"(\d{2,4})\s*%", title); pct = mp.group(1) if mp else None
        mf = re.search(r"(\d{2,4})\s*(?:FS|фриспин)", title, re.I); fs = mf.group(1) if mf else None
    # props
    props = {}
    for p in first.select(".bonus-item__prop"):
        t = re.sub(r"\s+", " ", p.get_text(" ", strip=True))
        mm = re.match(r"(.+?):\s*(.+)", t)
        if mm:
            props[mm.group(1).strip()] = mm.group(2).strip()
    return {
        "title": title,
        "bonusPct": pct,
        "freespins": fs,
        "maxSum": props.get("Макс. сумма"),
        "minDeposit": props.get("Мин. депозит"),
        "wager": props.get("Вейджер"),
        "allProps": props,
        "bonusCount": len(items),
    }


out = {}
for i, (slug, v) in enumerate(todo):
    cf = os.path.join(CACHE, v["casinoRuSlug"] + ".html")
    if not os.path.exists(cf) and i > 0:
        time.sleep(3.5)
    try:
        b = extract(fetch(v["casinoRuSlug"]))
        out[slug] = {"casinoRuSlug": v["casinoRuSlug"], **(b or {})}
        print(f"✓ {slug:24} | {b.get('bonusPct') or '—'}% +{b.get('freespins') or '—'}FS | "
              f"вейджер {b.get('wager') or '—'} | макс {b.get('maxSum') or '—'} | "
              f"мин.деп {b.get('minDeposit') or '—'} | бонусов: {b.get('bonusCount')}")
        print(f"   title: {b.get('title') or '—'}")
    except Exception as e:
        out[slug] = {"casinoRuSlug": v["casinoRuSlug"], "error": str(e)[:60]}
        print(f"✗ {slug} — {str(e)[:50]}")

json.dump(out, open("reports/casino-bonus-extract.json", "w", encoding="utf-8"),
          ensure_ascii=False, indent=2)
print(f"\n✓ reports/casino-bonus-extract.json ({len(out)} брендов)")
