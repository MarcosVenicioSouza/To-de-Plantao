"""Tests for new cycle_pattern values on /api/workplaces.

Verifies:
- SD_F_F_SN_F_F and SD_F_F_SD_F_F accepted
- Existing patterns still work
- Bogus pattern returns 422
- PUT update to a legacy pattern works
- GET returns the correct cycle_pattern for each row
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('EXPO_BACKEND_URL', 'https://nurse-scheduler-15.preview.emergentagent.com').rstrip('/')

DEMO_EMAIL = 'demo@escalafacil.com'
DEMO_PASSWORD = 'demo123456'
DEMO_NAME = 'Demo Enfermeiro'


@pytest.fixture(scope='module')
def auth_token():
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    # try register first; fallback to login on 400
    r = s.post(f'{BASE_URL}/api/auth/register', json={
        'name': DEMO_NAME, 'email': DEMO_EMAIL, 'password': DEMO_PASSWORD
    })
    if r.status_code == 201:
        return r.json()['access_token']
    if r.status_code == 400:
        r2 = s.post(f'{BASE_URL}/api/auth/login', json={
            'email': DEMO_EMAIL, 'password': DEMO_PASSWORD
        })
        if r2.status_code == 200:
            return r2.json()['access_token']
    # As a last resort create a unique user
    email = f'test_{uuid.uuid4().hex[:8]}@escalafacil.com'
    r3 = s.post(f'{BASE_URL}/api/auth/register', json={
        'name': 'Auto Tester', 'email': email, 'password': 'testpass123'
    })
    assert r3.status_code == 201, f'auth setup failed: {r3.status_code} {r3.text}'
    return r3.json()['access_token']


@pytest.fixture(scope='module')
def client(auth_token):
    s = requests.Session()
    s.headers.update({
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {auth_token}',
    })
    return s


def _payload(name, pattern):
    return {
        'name': name,
        'color': '#32827A',
        'cycle_pattern': pattern,
        'cycle_start_date': '2026-01-01',
        'cycle_start_shift': 'SD',
        'sd_start': '07:00', 'sd_end': '19:00',
        'sn_start': '19:00', 'sn_end': '07:00',
        'shift_day_color': '#007AFF',
        'shift_night_color': '#FF3B30',
        'avulso_color': '#34C759',
        'manha_color': '#FFCC00',
        'tarde_color': '#FF9500',
        'is_avulso_only': False,
        'vacations': [],
    }


# Store IDs across tests via module-level dict
CREATED: dict = {}


class TestNewCyclePatterns:
    """New 6-day patterns must be accepted."""

    def test_create_sd_f_f_sn_f_f(self, client):
        r = client.post(f'{BASE_URL}/api/workplaces',
                        json=_payload(f'TEST_6d_A_{uuid.uuid4().hex[:6]}', 'SD_F_F_SN_F_F'))
        assert r.status_code == 201, f'{r.status_code} {r.text}'
        data = r.json()
        assert data['cycle_pattern'] == 'SD_F_F_SN_F_F'
        assert 'id' in data
        CREATED['SD_F_F_SN_F_F'] = data['id']

    def test_create_sd_f_f_sd_f_f(self, client):
        r = client.post(f'{BASE_URL}/api/workplaces',
                        json=_payload(f'TEST_6d_B_{uuid.uuid4().hex[:6]}', 'SD_F_F_SD_F_F'))
        assert r.status_code == 201, f'{r.status_code} {r.text}'
        data = r.json()
        assert data['cycle_pattern'] == 'SD_F_F_SD_F_F'
        assert 'id' in data
        CREATED['SD_F_F_SD_F_F'] = data['id']


class TestRegressionExistingPatterns:
    """The three previously supported patterns must keep working."""

    @pytest.mark.parametrize('pattern', ['SD_F_SN_F_F', 'SD_SN_F_F', 'SD_F_SN_F'])
    def test_create_legacy_pattern(self, client, pattern):
        r = client.post(f'{BASE_URL}/api/workplaces',
                        json=_payload(f'TEST_leg_{pattern}_{uuid.uuid4().hex[:6]}', pattern))
        assert r.status_code == 201, f'{pattern}: {r.status_code} {r.text}'
        data = r.json()
        assert data['cycle_pattern'] == pattern
        CREATED[pattern] = data['id']


class TestUpdateAndValidation:
    def test_put_update_to_legacy_pattern(self, client):
        # depends on new patterns having been created
        wid = CREATED.get('SD_F_F_SN_F_F')
        assert wid, 'setup missing: SD_F_F_SN_F_F not created'
        r = client.put(f'{BASE_URL}/api/workplaces/{wid}',
                       json={'cycle_pattern': 'SD_F_SN_F_F'})
        assert r.status_code == 200, f'{r.status_code} {r.text}'
        assert r.json()['cycle_pattern'] == 'SD_F_SN_F_F'

        # verify persisted via GET list
        g = client.get(f'{BASE_URL}/api/workplaces')
        assert g.status_code == 200
        wps = {w['id']: w for w in g.json()}
        assert wps[wid]['cycle_pattern'] == 'SD_F_SN_F_F'

    def test_bogus_pattern_rejected(self, client):
        r = client.post(f'{BASE_URL}/api/workplaces',
                        json=_payload('TEST_bogus', 'XYZ'))
        assert r.status_code == 422, f'expected 422, got {r.status_code} {r.text}'

    def test_get_returns_correct_patterns(self, client):
        r = client.get(f'{BASE_URL}/api/workplaces')
        assert r.status_code == 200
        wps = {w['id']: w for w in r.json()}
        # SD_F_F_SD_F_F should still hold its pattern (not updated)
        b = CREATED.get('SD_F_F_SD_F_F')
        assert b in wps
        assert wps[b]['cycle_pattern'] == 'SD_F_F_SD_F_F'
        # legacy patterns still there with expected value
        for p in ['SD_SN_F_F', 'SD_F_SN_F']:
            wid = CREATED.get(p)
            assert wid in wps
            assert wps[wid]['cycle_pattern'] == p


@pytest.fixture(scope='module', autouse=True)
def cleanup(client):
    yield
    for wid in list(CREATED.values()):
        try:
            client.delete(f'{BASE_URL}/api/workplaces/{wid}')
        except Exception:
            pass
