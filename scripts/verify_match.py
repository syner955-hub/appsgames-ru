#!/usr/bin/env python3
"""
Доматчивает 30 несматченных брендов к casino.ru С ПРОВЕРКОЙ ПО H1.
Кандидатов берём из их sitemap, грузим страницу, извлекаем бренд из H1
и принимаем только при строгом совпадении (Вега != Vegas, 88 != 888).

Выход: reports/casino-match-extra.json  { ourSlug: casinoRuSlug | null }
Запуск: python3 scripts/verify_match.py
"""
import json, re, os, subprocess, time, sys
from bs4 import BeautifulSoup

UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36"
CACHE = "/tmp/cru-cache"
os.makedirs(CACHE, exist_ok=True)

TRANSLIT = {'а':'a','б':'b','в':'v','г':'g','д':'d','е':'e','ё':'e','ж':'zh','з':'z','и':'i','й':'i','к':'k','л':'l','м':'m','н':'n','о':'o','п':'p','р':'r','с':'s','т':'t','у':'u','ф':'f','х':'h','ц':'c','ч':'ch','ш':'sh','щ':'sch','ъ':'','ы':'y','ь':'','э':'e','ю':'yu','я':'ya'}
def translit(s): return ''.join(TRANSLIT.get(c, c) for c in s.lower())
def core(s):
    return re.sub(r'[^a-z0-9]', '', translit(str(s)).replace('casino','').replace('kazino','').replace('казино',''))

m = json.load(open("reports/casino-match-map.json", encoding="utf-8"))
cj = json.load(open("src/data/casinos.json", encoding="utf-8"))
unmatched = [(k, cj[k]['nameRu']) for k, v in m.items() if v is None or 'fuzzy' in (v or {}).get('conf', '')]

cru_slugs = [l.strip() for l in open("/tmp/cru-slugs.txt") if l.strip()]
cru_core = {s: core(s.replace('casino-', '').replace('-casino', '')) for s in cru_slugs}

def fetch(slug):
    cf = os.path.join(CACHE, slug + ".html")
    if os.path.exists(cf):
        return open(cf, encoding="utf-8").read()
    time.sleep(2.0)
    html = subprocess.run(["curl", "-sL", "-A", UA, "--compressed", "-m", "30", f"https://casino.ru/{slug}/"],
                          capture_output=True, text=True).stdout
    open(cf, "w", encoding="utf-8").write(html)
    return html

def h1_brand(html):
    s = BeautifulSoup(html, "lxml")
    h = s.find("h1")
    if not h: return None
    t = h.get_text(" ", strip=True)
    # убрать "Онлайн-казино", "Казино", "Обзор"
    t = re.sub(r'(онлайн[- ]?казино|казино|обзор|приложение|скачать)', '', t, flags=re.I).strip()
    return core(t)

result = {}
for slug, nameRu in unmatched:
    stem = core(slug.replace('-casino', '').replace('casino-', ''))
    ru = core(nameRu)
    targets = {stem, ru}
    # кандидаты: точное совпадение core ИЛИ кандидат начинается со stem (строго)
    cands = [s for s, c in cru_core.items() if c in targets]
    # добавим «начинается с» только если короткий бренд не даёт ложных (>=4 симв)
    if len(stem) >= 4:
        cands += [s for s, c in cru_core.items() if c.startswith(stem) and abs(len(c)-len(stem)) <= 2 and s not in cands]
    verified = None
    for cand in cands[:4]:
        try:
            b = h1_brand(fetch(cand))
        except Exception:
            continue
        if b and (b in targets or (len(stem) >= 4 and b == stem)):
            verified = cand; break
    result[slug] = verified
    print(f"  {slug:22} ({nameRu:12}) -> {verified or '— не найдено'}   [cands: {','.join(cands[:4]) or '∅'}]")

json.dump(result, open("reports/casino-match-extra.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
found = sum(1 for v in result.values() if v)
print(f"\nДоматчено с проверкой H1: {found}/{len(unmatched)}")
