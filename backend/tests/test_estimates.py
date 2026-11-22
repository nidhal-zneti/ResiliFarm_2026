"""Approximate planning contracts; all search/model calls are mocked."""
import json
from pathlib import Path

import httpx
import pytest

from backend.app import studio_assistant as assistant
from backend.app import supplier_prices as prices
from backend.app.search import SearchUnavailable


REGION = {'country_code': 'TN', 'name': 'Tunis', 'country_name': 'Tunisia'}
PROFILE = {'area_ha': 1, 'zones': 2, 'irrigation_method': 'drip',
           'water_source': 'well', 'source_flow_lpm': 40, 'head_m': 20,
           'field_length_m': 100, 'field_width_m': 100, 'row_spacing_m': 2,
           'water_distance_m': 10}


@pytest.fixture(autouse=True)
def no_external_services(monkeypatch):
    for key in ('STUDIO_AI_BASE_URL', 'STUDIO_AI_MODEL', 'STUDIO_AI_API_KEY',
                'TAVILY_API_KEY', 'STUDIO_SUPPLIER_DOMAINS_TN', 'STUDIO_SUPPLIER_DOMAINS_JP'):
        monkeypatch.delenv(key, raising=False)
    def forbidden(*args, **kwargs):
        raise AssertionError('Unexpected network call')
    monkeypatch.setattr(httpx, 'post', forbidden)


def provider(monkeypatch, content):
    monkeypatch.setenv('STUDIO_AI_BASE_URL', 'http://model.invalid/v1')
    monkeypatch.setenv('STUDIO_AI_MODEL', 'test-model')
    calls = []
    def respond(url, **kwargs):
        calls.append(kwargs['json'])
        return httpx.Response(200, request=httpx.Request('POST', url),
                              json={'choices': [{'message': {'content': content}}]})
    monkeypatch.setattr(httpx, 'post', respond)
    return calls


def listing(title, text, suffix='product'):
    return {'title': title, 'text': text, 'url': 'https://hobbystart.tn/' + suffix,
            'fetched_at': 1_790_000_000}


@pytest.mark.parametrize('currency,text,expected', [
    ('TND', 'ESP32 board 40 DT or 60 DT', [40, 60]),
    ('TND', 'Budget 40–60 DT', [40, 60]),
    ('TND', 'DT 40–60', [40, 60]),
    ('TND', '12,500 TND', [12.5]),
    ('TND', '1 200 DT', [1200]),
    ('JPY', '¥1,200–2,500', [1200, 2500]),
    ('JPY', '1,200円', [1200]),
    ('JPY', '¥0', []),
    ('TND', 'ESP32 board USD 40', []),
])
def test_listing_price_ranges(currency, text, expected):
    assert prices._extract_prices(text, currency) == expected


@pytest.mark.parametrize('text,expected', [
    ('Dripline roll of 100 m', 2), ('Goutte à goutte rouleau de 100 m', 2),
    ('Dripline 100 m roll', 2), ('Dripline 101m long', None),
    ('Pipe diameter 16 mm', None), ('Pipe 2 DT / m', 200),
    ('Pipe roll of 100 m or roll of 50 m', None),
])
def test_pipe_units_are_normalized_only_when_explicit(text, expected):
    assert prices._per_metre_price('dripline', 200, text) == expected


def test_comparable_listings_and_rolls_keep_sources(monkeypatch):
    monkeypatch.setenv('STUDIO_SUPPLIER_DOMAINS_TN', 'hobbystart.tn')
    sources = [listing('ESP32 development board', '40–60 DT'),
               listing('ESP32 devkit board', '80 DT', 'second'),
               listing('Dripline roll of 100 m', '200 DT', 'drip')]
    monkeypatch.setattr(prices, 'search_context', lambda *a, **k: sources)
    complete_profile = {
        **PROFILE,
        'row_spacing_m': 1,
        'laterals_per_row': 1,
        'emitter_spacing_m': 0.3,
        'emitter_flow_lph': 2,
    }
    result = prices.estimate(REGION, complete_profile)
    items = {item['key']: item for item in result['items']}
    assert items['controller']['unit_price'] == 60
    assert items['controller']['unit_price_low'] == 40
    assert items['controller']['unit_price_high'] == 80
    assert len(items['controller']['sources']) == 2
    assert items['controller']['price_basis'] == 'comparable_listings'
    assert items['dripline']['unit_price'] == 2
    assert items['dripline']['line_total'] == 20000
    assert result['subtotal_low'] == 20040
    assert result['subtotal_high'] == 20080
    assert result['priced_subtotal'] == 20060
    assert not result['complete']
    assert result['accuracy_validated'] is False


def test_model_budgets_work_without_supplier_search(monkeypatch):
    calls = provider(monkeypatch, json.dumps({'currency': 'TND', 'items': [
        {'key': 'controller', 'low': 30, 'high': 50, 'assumption': 'Basic ESP32 board'},
        {'key': 'soil_sensor', 'low': 10, 'high': 20, 'assumption': 'Basic capacitive probe'},
    ]}))
    def forbidden_search(*a, **k):
        raise AssertionError('Supplier access was not enabled')
    monkeypatch.setattr(prices, 'search_context', forbidden_search)
    result = prices.estimate(REGION, PROFILE)
    assert len(calls) == 1
    assert result['priced_subtotal'] == 70
    assert result['subtotal_low'] == 50
    assert result['subtotal_high'] == 90
    assert result['status'] == 'supplierAccessNotAuthorized'
    assert result['model_estimate_status'] == 'ready'
    for item in result['items'][:2]:
        assert item['price_basis'] == 'model_estimate'
        assert item['source_url'] is None and item['sources'] == []
        assert item['price_checked_at'] is None
        assert item['assumptions']


def test_missing_quantities_remain_excluded_from_totals(monkeypatch):
    provider(monkeypatch, json.dumps({'currency': 'TND', 'items': [
        {'key': 'soil_sensor', 'low': 10, 'high': 20, 'assumption': 'Basic probe'},
    ]}))
    result = prices.estimate(REGION, {})
    item = next(item for item in result['items'] if item['key'] == 'soil_sensor')
    assert item['unit_price'] == 15
    assert item['quantity'] is None and item['line_total'] is None
    assert result['priced_subtotal'] is None and result['subtotal_low'] is None
    assert not result['complete']


@pytest.mark.parametrize('change', [
    {'low': -1}, {'high': 10}, {'low': '10'}, {'low': True}, {'high': float('inf')},
    {'assumption': ' '}, {'key': 'unsupported'}, {'source_url': 'https://fake.invalid'},
])
def test_invalid_model_price_cannot_be_presented_as_an_estimate(monkeypatch, change):
    item = {'key': 'controller', 'low': 10, 'high': 20, 'assumption': 'Basic board', **change}
    provider(monkeypatch, json.dumps({'currency': 'TND', 'items': [item]}))
    result = prices.estimate(REGION, PROFILE)
    assert result['priced_subtotal'] is None
    assert result['model_estimate_status'] == 'unavailable'
    assert all(item['price_basis'] == 'unpriced' for item in result['items'])


@pytest.mark.parametrize('invalid', ['wrong_currency', 'duplicate', 'malformed'])
def test_invalid_model_response_preserves_comparable_prices(monkeypatch, invalid):
    item = {'key': 'soil_sensor', 'low': 10, 'high': 20, 'assumption': 'Basic probe'}
    body = {'currency': 'JPY' if invalid == 'wrong_currency' else 'TND',
            'items': [item, item] if invalid == 'duplicate' else [item]}
    provider(monkeypatch, 'not json' if invalid == 'malformed' else json.dumps(body))
    monkeypatch.setenv('STUDIO_SUPPLIER_DOMAINS_TN', 'hobbystart.tn')
    monkeypatch.setattr(prices, 'search_context', lambda *a, **k: [listing('ESP32 devkit board', '40 DT')])
    result = prices.estimate(REGION, PROFILE)
    assert result['priced_subtotal'] == 40
    assert result['items'][0]['price_basis'] == 'comparable_listings'
    assert result['model_estimate_status'] == 'unavailable'


@pytest.mark.parametrize('search_state', ['sourceSearchNotConfigured', 'sourceSearchUnavailable', 'empty'])
def test_agriculture_answers_without_retrieved_sources(monkeypatch, search_state):
    calls = provider(monkeypatch, 'General guidance: this is a preliminary estimate.')
    def search(*a, **k):
        if search_state == 'empty':
            return []
        raise SearchUnavailable(search_state)
    monkeypatch.setattr(assistant, 'search_context', search)
    result = assistant.answer_agriculture('How should I plan irrigation?', [], REGION, 'en')
    assert result['reply'].startswith('General guidance')
    assert result['answer_basis'] == 'model_estimate' and result['citations'] == []
    assert result['source_status'] == ('noMatchingSources' if search_state == 'empty' else search_state)
    prompt = calls[0]['messages'][0]['content']
    assert 'No retrieved sources are available' in prompt
    assert 'Never claim a measured accuracy' in prompt


def test_retrieved_evidence_can_be_supplemented_with_estimates(monkeypatch):
    calls = provider(monkeypatch, 'Source-supported guidance [1]. Preliminary estimate with assumptions.')
    source = listing('Reference', 'General agricultural guidance')
    monkeypatch.setattr(assistant, 'search_context', lambda *a, **k: [source])
    result = assistant.answer_agriculture('Estimate irrigation needs', [], REGION, 'fr')
    assert result['answer_basis'] == 'sources_and_model'
    assert result['citations'][0]['url'] == source['url']
    assert 'supplement gaps' in calls[0]['messages'][0]['content']


def test_model_failure_is_still_explicit(monkeypatch):
    provider(monkeypatch, 'unused')
    monkeypatch.setattr(assistant, 'search_context', lambda *a, **k: [])
    def timeout(*a, **k):
        raise httpx.ReadTimeout('offline')
    monkeypatch.setattr(httpx, 'post', timeout)
    with pytest.raises(assistant.AssistantUnavailable, match='studioAiUnavailable'):
        assistant.answer_agriculture('Question', [], REGION, 'en')
    result = prices.estimate(REGION, PROFILE)
    assert result['priced_subtotal'] is None


def test_estimate_labels_exist_in_every_locale():
    root = Path(__file__).resolve().parents[2] / 'frontend/src/i18n'
    keys = {'answerBasis_sources_and_model', 'answerBasis_model_estimate',
            'priceBasis_comparable_listings', 'priceBasis_model_estimate', 'priceBasis_unpriced',
            'modelPriceEstimateNote', 'comparablePriceEstimateNote', 'modelPriceUnavailable'}
    for locale in ('en', 'fr', 'ja', 'ar'):
        translations = json.loads((root / f'{locale}.json').read_text(encoding='utf-8'))
        assert keys <= translations.keys()
        assert all(translations[key] for key in keys)


@pytest.fixture
def assistant_api(monkeypatch):
    from fastapi.testclient import TestClient
    from sqlalchemy import create_engine
    from sqlalchemy.pool import StaticPool
    from backend.app import auth, db
    from backend.app.main import app
    engine = create_engine('sqlite://', connect_args={'check_same_thread': False}, poolclass=StaticPool)
    monkeypatch.setattr(db, 'engine', engine)
    monkeypatch.setitem(app.dependency_overrides, auth.current_user, lambda: {'id': 1})
    try:
        with TestClient(app) as client:
            with engine.begin() as connection:
                connection.execute(db.users.insert().values(
                    id=1, email='estimate@example.invalid', full_name='Test', password_hash='unused'))
            yield client
    finally:
        engine.dispose()


def test_api_persists_answer_provenance_when_search_is_missing(monkeypatch, assistant_api):
    provider(monkeypatch, 'General model guidance with assumptions.')
    response = assistant_api.post('/api/v1/aiot/assistant/messages', json={
        'region_id': 1, 'text': 'What affects crop water needs?', 'language': 'en'})
    assert response.status_code == 200
    data = response.json()
    assert data['result']['answer_basis'] == 'model_estimate'
    thread = assistant_api.get(f"/api/v1/aiot/assistant/conversations/{data['conversation']['id']}").json()
    assert thread['messages'][-1]['payload']['source_status'] == 'sourceSearchNotConfigured'
    assert thread['messages'][-1]['payload']['citations'] == []


def test_api_saves_budget_ranges_in_design_and_conversation(monkeypatch, assistant_api):
    from sqlalchemy import select
    from backend.app import db
    provider(monkeypatch, 'unused')
    def respond(url, **kwargs):
        schema_name = kwargs['json']['response_format']['json_schema']['name']
        if schema_name == 'material_budget_ranges':
            content = {'currency': 'TND', 'items': [
                {'key': 'controller', 'low': 30, 'high': 50, 'assumption': 'Basic ESP32 board'}]}
        else:
            assert schema_name == 'irrigation_plan'
            content = {'supported': True, 'action': 'design', 'changes': {}}
        return httpx.Response(200, request=httpx.Request('POST', url),
                              json={'choices': [{'message': {'content': json.dumps(content)}}]})
    monkeypatch.setattr(httpx, 'post', respond)
    with db.engine.begin() as connection:
        cid = connection.execute(db.studio_conversations.insert().values(
            user_id=1, region_id=1, title='Budget', context={
                'design_intake': True, 'design_request': 'Build an irrigation controller',
                    'farm_profile': {
                        **PROFILE,
                        'laterals_per_row': 1,
                        'emitter_spacing_m': 0.3,
                        'emitter_flow_lph': 2,
                        'crop': 'wheat',
                        'energy_source': 'grid',
                    },
            })).inserted_primary_key[0]
    response = assistant_api.post('/api/v1/aiot/assistant/messages', json={
        'conversation_id': cid, 'region_id': 1, 'text': 'Prepare the estimate', 'language': 'en'})
    assert response.status_code == 200, response.text
    data = response.json()
    estimate = data['result']['project']['design']['material_estimate']
    assert estimate['subtotal_low'] == 30 and estimate['subtotal_high'] == 50
    assert estimate['items'][0]['price_basis'] == 'model_estimate'
    assert data['conversation']['messages'][-1]['payload']['estimate'] == estimate
    with db.engine.connect() as connection:
        saved = connection.execute(select(db.versions.c.design)).scalar_one()
    assert saved['material_estimate'] == estimate
    assert 'digitalWrite(relayPin, LOW)' in saved['firmware']
