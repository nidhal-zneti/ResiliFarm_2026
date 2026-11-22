"""Small, source-allowlisted Tavily Search API client."""
import os
import time
from urllib.parse import urlparse

import httpx

TAVILY_SEARCH_URL = 'https://api.tavily.com/search'
COUNTRIES = {'TN': 'tunisia', 'JP': 'japan'}
_cache = {}
_CACHE_SECONDS = 900


class SearchUnavailable(RuntimeError):
    pass


def _allowed(url, domains):
    try:
        host = (urlparse(url).hostname or '').lower().rstrip('.')
        return url.startswith('https://') and any(
            host == domain or host.endswith('.' + domain) for domain in domains
        )
    except ValueError:
        return False


def context(query, domains, *, language='en', country='TN', max_tokens=1200):
    """Return fresh, extracted search results from an explicit domain allowlist."""
    key = os.getenv('TAVILY_API_KEY', '').strip()
    if not key:
        raise SearchUnavailable('sourceSearchNotConfigured')
    domains = tuple(sorted(set(domain.lower() for domain in domains)))
    normalized = ' '.join(query.split())
    cache_key = (normalized.lower(), domains, language, country, max_tokens)
    cached = _cache.get(cache_key)
    if cached and time.monotonic() - cached[0] < _CACHE_SECONDS:
        return cached[1]

    # Tavily search is kept at basic depth and five results; content is capped
    # locally before it is passed to the agriculture model.
    payload = {
        'query': normalized,
        'search_depth': 'basic',
        'max_results': 5,
        'chunks_per_source': 2,
        'include_raw_content': False,
        'include_answer': False,
        'include_domains': list(domains),
        'include_domains_mode': 'restrict',
        'country': COUNTRIES.get(country),
        'language': language,
        'filter_by_language': False,
    }
    try:
        response = httpx.post(
            TAVILY_SEARCH_URL,
            headers={'Authorization': 'Bearer ' + key, 'Content-Type': 'application/json'},
            json=payload,
            timeout=httpx.Timeout(20, connect=3),
        )
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError, TypeError) as exc:
        raise SearchUnavailable('sourceSearchUnavailable') from exc

    if not isinstance(data, dict):
        raise SearchUnavailable('sourceSearchUnavailable')
    fetched_at = int(time.time())
    found = []
    for item in data.get('results') or []:
        if not isinstance(item, dict):
            continue
        url = item.get('url')
        if not isinstance(url, str) or not _allowed(url, domains):
            continue
        content = item.get('content')
        if not isinstance(content, str) or not content.strip():
            continue
        found.append({
            'title': str(item.get('title') or url)[:300],
            'url': url,
            'hostname': (urlparse(url).hostname or '').lower(),
            'text': content.strip()[:max(1000, min(5000, max_tokens * 4))],
            'fetched_at': fetched_at,
            'published_date': item.get('published_date'),
        })
    result = found[:5]
    _cache[cache_key] = (time.monotonic(), result)
    return result
