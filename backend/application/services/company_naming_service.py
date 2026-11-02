import re
from typing import Tuple, Optional
from urllib.parse import urlparse

KNOWN_COMPANY_MAP = {
    "goodstack": "Goodstack",
    "asana": "Asana",
    "faculty": "Faculty",
    "kaluza": "Kaluza",
    "plentific": "Plentific",
    "stripe": "Stripe",
    "kota": "Kota",
    "chronograph": "Chronograph",
    "bobyard": "Bobyard",
    "snyk": "Snyk",
    "clenera": "Clenera",
    "certik": "CertiK",
    "ironcladhq": "Ironclad",
    "ironclad": "Ironclad",
    "vitalize": "Vitalize",
    "capco": "Capco",
    "alimentiv-2": "Alimentiv",
    "alimentiv": "Alimentiv",
    "aavantgardebio": "Aavantgarde Bio",
    "hyperexponential": "Hyperexponential",
    "mulberry": "Mulberry",
    "wayve": "Wayve",
    "deliveroo": "Deliveroo",
    "thought-machine": "Thought Machine",
    "thoughtmachine": "Thought Machine",
    "farfetch": "Farfetch",
    "quantexa": "Quantexa",
    "palantir": "Palantir",
    "wpp": "WPP",
    "superiorexecutiveandlegalrecruiting": "Superior Executive and Legal Recruiting",
    "scarlet": "Scarlet",
    "blankstreet": "Blank Street",
    "primee": "Primee",
    "globalizationpartners": "Globalization Partners",
    "peoplegrove": "PeopleGrove",
    "bradyplc": "Brady PLC",
    "olo": "Olo",
    "activeviam": "ActiveViam",
    "guidepoint": "Guidepoint",
    "blacksunplc": "Black Sun PLC",
    "adaptyv": "Adaptyv",
    "lyrahealth": "Lyra Health",
    "lyra-health": "Lyra Health",
    "olix": "Olix",
    "databricks": "Databricks",
    "karbon": "Karbon",
    "firstglobalmanagementservicesinc": "First Global Management Services",
    "firstagency": "First Global Management Services",
    "snowflake": "Snowflake",
    "docker": "Docker",
    "hawk": "Hawk",
    "hiya": "Hiya",
    "helsing": "Helsing",
    "paddle": "Paddle",
    "monzo": "Monzo",
    "elevenlabs": "ElevenLabs",
    "lendable": "Lendable",
    "zopa": "Zopa",
    "trainline": "Trainline",
    "elastic": "Elastic",
    "cloudflare": "Cloudflare",
    "abound": "Abound",
    "seccl": "Seccl",
    "winton": "Winton",
    "ohme": "Ohme",
    "gousto": "Gousto",
    "amazon": "Amazon",
    "apple": "Apple",
    "google": "Google",
    "meta": "Meta",
    "microsoft": "Microsoft",
    "netflix": "Netflix",
    "spotify": "Spotify",
    "uber": "Uber",
    "airbnb": "Airbnb",
    "coinbase": "Coinbase",
    "revolut": "Revolut",
    "wise": "Wise",
    "starling": "Starling Bank",
}

ACRONYMS = {
    "plc", "llc", "ltd", "ai", "hr", "it", "uk", "us", "eu", "api", "emea", "b2b", "saas", "wpp"
}

LOWER_WORDS = {"and", "of", "the", "for", "in", "at", "by", "to"}


def extract_slug_from_url(url: str) -> str:
    """Extract canonical ATS board slug from a job posting URL."""
    if not url:
        return ""
    try:
        parsed = urlparse(url.strip())
        host = parsed.netloc.lower()
        path = parsed.path.strip("/")
        parts = [p for p in path.split("/") if p]

        if "ashbyhq.com" in host and parts:
            return parts[0].lower()
        if "greenhouse.io" in host and parts:
            return parts[0].lower()
        if "lever.co" in host and parts:
            return parts[0].lower()
        if "smartrecruiters.com" in host and parts:
            return parts[0].lower()
        if "bamboohr.com" in host:
            sub = host.split(".bamboohr.com")[0]
            if sub:
                return sub.lower()
        if "myworkdayjobs.com" in host:
            sub = host.split(".")[0]
            if sub and sub.lower() not in ("wd1", "wd2", "wd3", "wd4", "wd5"):
                return sub.lower()

        domain = host.replace("www.", "").split(".")[0]
        if domain:
            return domain.lower()
    except Exception:
        pass
    return ""


def slug_to_display_name(name_or_slug: str, url: str = "") -> str:
    """
    Converts an ATS board slug or company identifier into a clean, human-readable display name.
    Preserves acronyms (PLC, WPP, AI) and title-cases multi-word names.
    """
    s = (name_or_slug or "").strip()
    norm_key = s.lower()
    if norm_key in KNOWN_COMPANY_MAP:
        return KNOWN_COMPANY_MAP[norm_key]

    url_slug = extract_slug_from_url(url)
    if url_slug and url_slug in KNOWN_COMPANY_MAP:
        return KNOWN_COMPANY_MAP[url_slug]

    # If already clean with uppercase letters and spaces (e.g. "Thought Machine", "Blank Street")
    if " " in s and any(c.isupper() for c in s) and any(c.islower() for c in s):
        return s

    # Strip duplicate/suffix numbering e.g. "alimentiv-2"
    s = re.sub(r"-\d+$", "", s)
    # Strip trailing corporate noise in slugs if not already mapped
    if s.lower().endswith("hq") and len(s) > 4:
        s = s[:-2]

    # Split on hyphens and underscores
    tokens = re.split(r"[-_]+", s)
    formatted = []
    for i, t in enumerate(tokens):
        t_low = t.lower()
        if t_low in ACRONYMS:
            formatted.append(t.upper())
        elif i > 0 and t_low in LOWER_WORDS:
            formatted.append(t_low)
        else:
            formatted.append(t.capitalize())

    res = " ".join(formatted)
    return res if res else (name_or_slug or "Unknown")


def extract_slug_and_display_name(raw_name: str, url: str = "") -> Tuple[str, str]:
    """
    Extracts both the slug (technical ATS board identifier) and the clean display name
    (capitalized branding for UI/reports) from raw company text and posting URL.
    """
    url_slug = extract_slug_from_url(url)
    clean_name = (raw_name or "").strip()
    raw_slug = clean_name.lower().replace(" ", "-")

    slug = url_slug if url_slug else raw_slug
    slug = re.sub(r"-\d+$", "", slug)

    display_name = slug_to_display_name(clean_name, url=url)
    return slug, display_name
