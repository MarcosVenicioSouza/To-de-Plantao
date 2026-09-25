"""Regression + new-feature tests for EscalaFácil workplaces.

Covers:
- New CyclePattern value 'SD_SN_F_F_F' (5-day cycle) accepted
- New field cycle_repeat_months (None/1/2/6) round-trips on POST, PUT, GET
- Bogus cycle_pattern rejected with 422
- Regression: legacy patterns still accepted
- Regression: shift overrides (SD/SN/MANHA/TARDE/AVULSO/FOLGA/FERIAS),
  holidays, events, account deletion still function

Run with: pytest /app/backend/tests/test_cycle_repeat_months.py -v -p no:xdist \\
  --junitxml=/app/test_reports/pytest/pytest_cycle_repeat_months.xml
"""
import os
import uuid
import pytest
import requests

BASE_URL = (
    os.environ.get('EXPO_BACKEND_URL')
    or os.environ.get('EXPO_PUBLIC_BACKEND_URL')
    or 'https://nurse-scheduler-15.preview.emergentagent.com'
).rstrip('/')

DEMO_EMAIL = 'demo@escalafacil.com'
DEMO_PASSWORD = 'demo123456'
DEMO_NAME = 'Demo Enfermeiro'


# ================= Auth helpers =================
def _get_token(email: str, password: str, name: str) -> str:
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    r = s.post(f'{BASE_URL}/api/auth/register',
               json={'name': name, 'email': email, 'password': password})
    if r.status_code == 201:
        return r.json()['access_token']
    if r.status_code == 400:
        r2 = s.post(f'{BASE_URL}/api/auth/login',
                    json={'email': email, 'password': password})
        assert r2.status_code == 200, f'login failed: {r2.status_code} {r2.text}'
        return r2.json()['access_token']
    raise AssertionError(f'register failed: {r.status_code} {r.text}')


@pytest.fixture(scope='module')
def token():
    return _get_token(DEMO_EMAIL, DEMO_PASSWORD, DEMO_NAME)


@pytest.fixture(scope='module')
def client(token):
    s = requests.Session()
    s.headers.update({
        'Content-Type': 'application/json',
        'Authorization': f'Bearer {token}',
    })
    return s


# ================= Payload helper =================
def _payload(name, pattern='SD_SN_F_F_F', repeat=None):
    p = {
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
    if repeat is not None:
        p['cycle_repeat_months'] = repeat
    return p


CREATED: dict = {}


# ================= Auth =================
class TestAuth:
    def test_login_or_register_returns_bearer(self, token):
        assert isinstance(token, str) and len(token) > 20

    def test_me_endpoint_returns_user(self, client):
        r = client.get(f'{BASE_URL}/api/auth/me')
        assert r.status_code == 200, r.text
        j = r.json()
        assert j['email'] == DEMO_EMAIL
        assert 'id' in j and 'name' in j


# ================= New feature: SD_SN_F_F_F + cycle_repeat_months =================
class TestNewCyclePattern5Day:
    def test_create_with_new_pattern_and_repeat_2(self, client):
        r = client.post(
            f'{BASE_URL}/api/workplaces',
            json=_payload(f'TEST_5d_{uuid.uuid4().hex[:6]}',
                          pattern='SD_SN_F_F_F', repeat=2),
        )
        assert r.status_code == 201, f'{r.status_code} {r.text}'
        data = r.json()
        assert data['cycle_pattern'] == 'SD_SN_F_F_F'
        assert data['cycle_repeat_months'] == 2
        CREATED['wp_new_pattern'] = data['id']

    def test_create_without_repeat_defaults_to_null(self, client):
        r = client.post(
            f'{BASE_URL}/api/workplaces',
            json=_payload(f'TEST_norepeat_{uuid.uuid4().hex[:6]}',
                          pattern='SD_SN_F_F_F'),  # no cycle_repeat_months key
        )
        assert r.status_code == 201, f'{r.status_code} {r.text}'
        data = r.json()
        assert data['cycle_pattern'] == 'SD_SN_F_F_F'
        assert data['cycle_repeat_months'] is None, (
            f'expected null, got {data["cycle_repeat_months"]!r}'
        )
        CREATED['wp_no_repeat'] = data['id']

    def test_put_update_repeat_to_6(self, client):
        wid = CREATED['wp_no_repeat']
        r = client.put(f'{BASE_URL}/api/workplaces/{wid}',
                       json={'cycle_repeat_months': 6})
        assert r.status_code == 200, r.text
        assert r.json()['cycle_repeat_months'] == 6

    def test_get_list_returns_correct_repeat_values(self, client):
        r = client.get(f'{BASE_URL}/api/workplaces')
        assert r.status_code == 200
        wps = {w['id']: w for w in r.json()}

        a = CREATED['wp_new_pattern']
        b = CREATED['wp_no_repeat']
        assert a in wps and b in wps
        assert wps[a]['cycle_pattern'] == 'SD_SN_F_F_F'
        assert wps[a]['cycle_repeat_months'] == 2
        assert wps[b]['cycle_pattern'] == 'SD_SN_F_F_F'
        assert wps[b]['cycle_repeat_months'] == 6  # updated above

    def test_bogus_cycle_pattern_returns_422(self, client):
        r = client.post(f'{BASE_URL}/api/workplaces',
                        json=_payload('TEST_bogus', pattern='XYZ'))
        assert r.status_code == 422, f'expected 422, got {r.status_code} {r.text}'


# ================= Regression: legacy patterns =================
class TestRegressionLegacyPatterns:
    @pytest.mark.parametrize('pattern', [
        'SD_F_SN_F_F',
        'SD_SN_F_F',
        'SD_F_F_SN_F_F',
        'SD_F_F_SD_F_F',
        'SD_F_SN_F',
    ])
    def test_create_legacy(self, client, pattern):
        r = client.post(
            f'{BASE_URL}/api/workplaces',
            json=_payload(f'TEST_leg_{pattern}_{uuid.uuid4().hex[:6]}', pattern),
        )
        assert r.status_code == 201, f'{pattern}: {r.status_code} {r.text}'
        data = r.json()
        assert data['cycle_pattern'] == pattern
        assert data['cycle_repeat_months'] is None  # default when omitted
        CREATED[f'leg_{pattern}'] = data['id']


# ================= Regression: shift overrides =================
class TestShiftOverrideRegression:
    @pytest.fixture(scope='class')
    def wp_id(self, client):
        r = client.post(f'{BASE_URL}/api/workplaces',
                        json=_payload(f'TEST_shifts_{uuid.uuid4().hex[:6]}',
                                      pattern='SD_F_SN_F_F'))
        assert r.status_code == 201, r.text
        wid = r.json()['id']
        CREATED['wp_shifts'] = wid
        return wid

    @pytest.mark.parametrize('shift_type', [
        'SD', 'SN', 'MANHA', 'TARDE', 'AVULSO', 'FOLGA', 'FERIAS',
    ])
    def test_upsert_shift_types(self, client, wp_id, shift_type):
        # Use a unique date per shift_type to avoid unique-index conflict
        day = 1 + ['SD', 'SN', 'MANHA', 'TARDE', 'AVULSO',
                   'FOLGA', 'FERIAS'].index(shift_type)
        date = f'2026-03-{day:02d}'
        r = client.put(
            f'{BASE_URL}/api/shifts/{wp_id}/{date}',
            json={'shift_type': shift_type, 'note': f'TEST_{shift_type}'},
        )
        assert r.status_code == 200, f'{shift_type}: {r.status_code} {r.text}'
        j = r.json()
        assert j['shift_type'] == shift_type
        assert j['date'] == date
        # verify listing
        g = client.get(f'{BASE_URL}/api/shifts/{wp_id}',
                       params={'year': 2026, 'month': 3})
        assert g.status_code == 200
        assert any(o['date'] == date and o['shift_type'] == shift_type
                   for o in g.json())

    def test_delete_shift_override(self, client, wp_id):
        date = '2026-03-01'
        r = client.delete(f'{BASE_URL}/api/shifts/{wp_id}/{date}')
        assert r.status_code == 204
        g = client.get(f'{BASE_URL}/api/shifts/{wp_id}',
                       params={'year': 2026, 'month': 3})
        assert not any(o['date'] == date for o in g.json())


# ================= Regression: holidays =================
class TestHolidaysRegression:
    def test_holiday_crud(self, client):
        r = client.post(f'{BASE_URL}/api/holidays',
                        json={'date': '2026-05-01', 'name': 'TEST_Labor'})
        assert r.status_code == 201, r.text
        hid = r.json()['id']
        assert r.json()['name'] == 'TEST_Labor'

        g = client.get(f'{BASE_URL}/api/holidays')
        assert g.status_code == 200
        assert any(h['id'] == hid for h in g.json())

        d = client.delete(f'{BASE_URL}/api/holidays/{hid}')
        assert d.status_code == 204
        g2 = client.get(f'{BASE_URL}/api/holidays')
        assert not any(h['id'] == hid for h in g2.json())


# ================= Regression: extra events =================
class TestEventsRegression:
    def test_event_crud(self, client):
        r = client.post(f'{BASE_URL}/api/events',
                        json={'date': '2026-06-15', 'label': 'TEST_evt',
                              'color': '#34C759',
                              'start_time': '08:00', 'end_time': '12:00',
                              'note': 'reg test'})
        assert r.status_code == 201, r.text
        eid = r.json()['id']

        u = client.put(f'{BASE_URL}/api/events/{eid}',
                       json={'label': 'TEST_evt_upd', 'color': '#FF9500'})
        assert u.status_code == 200
        assert u.json()['label'] == 'TEST_evt_upd'
        assert u.json()['color'] == '#FF9500'

        g = client.get(f'{BASE_URL}/api/events',
                       params={'year': 2026, 'month': 6})
        assert g.status_code == 200
        found = [e for e in g.json() if e['id'] == eid]
        assert found and found[0]['label'] == 'TEST_evt_upd'

        d = client.delete(f'{BASE_URL}/api/events/{eid}')
        assert d.status_code == 204


# ================= Regression: account deletion =================
class TestAccountDeletionRegression:
    def test_delete_me_then_reregister(self):
        email = f'test_del_{uuid.uuid4().hex[:8]}@escalafacil.com'
        pwd = 'testpass123'
        # register a throwaway account
        r = requests.post(f'{BASE_URL}/api/auth/register',
                          json={'name': 'Del Me', 'email': email,
                                'password': pwd})
        assert r.status_code == 201, r.text
        tok = r.json()['access_token']

        # delete
        d = requests.delete(f'{BASE_URL}/api/auth/me',
                            headers={'Authorization': f'Bearer {tok}'})
        assert d.status_code == 204, d.text

        # old token should no longer authenticate
        m = requests.get(f'{BASE_URL}/api/auth/me',
                         headers={'Authorization': f'Bearer {tok}'})
        assert m.status_code == 401

        # e-mail can be reused
        r2 = requests.post(f'{BASE_URL}/api/auth/register',
                           json={'name': 'Reused', 'email': email,
                                 'password': pwd})
        assert r2.status_code == 201, r2.text
        # cleanup new account
        tok2 = r2.json()['access_token']
        requests.delete(f'{BASE_URL}/api/auth/me',
                        headers={'Authorization': f'Bearer {tok2}'})


# ================= Cleanup =================
@pytest.fixture(scope='module', autouse=True)
def _cleanup(client):
    yield
    for wid in list(CREATED.values()):
        try:
            client.delete(f'{BASE_URL}/api/workplaces/{wid}')
        except Exception:
            pass
