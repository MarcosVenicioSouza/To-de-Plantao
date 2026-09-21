"""EscalaFácil backend end-to-end tests.

Covers: auth flow, workplaces CRUD, shift overrides CRUD, holidays CRUD,
authorization boundary between users.
"""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('BACKEND_URL', 'https://nurse-scheduler-15.preview.emergentagent.com').rstrip('/')
API = f"{BASE_URL}/api"

DEMO_EMAIL = 'demo@escalafacil.com'
DEMO_PASSWORD = 'demo123456'
DEMO_NAME = 'Demo Enfermeiro'


# -------- shared fixtures --------
@pytest.fixture(scope='session')
def client():
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    return s


@pytest.fixture(scope='session')
def demo_token(client):
    """Ensure demo user exists & return token."""
    r = client.post(f"{API}/auth/register",
                    json={'name': DEMO_NAME, 'email': DEMO_EMAIL, 'password': DEMO_PASSWORD})
    if r.status_code == 201:
        return r.json()['access_token']
    # already registered → login
    r = client.post(f"{API}/auth/login", json={'email': DEMO_EMAIL, 'password': DEMO_PASSWORD})
    assert r.status_code == 200, f'login failed: {r.status_code} {r.text}'
    return r.json()['access_token']


@pytest.fixture(scope='session')
def demo_headers(demo_token):
    return {'Authorization': f'Bearer {demo_token}', 'Content-Type': 'application/json'}


@pytest.fixture(scope='session')
def user2():
    """Second user with unique email for isolation tests."""
    email = f'user2_{uuid.uuid4().hex[:8]}@test.com'
    password = 'user2pass'
    s = requests.Session()
    s.headers.update({'Content-Type': 'application/json'})
    r = s.post(f"{API}/auth/register",
               json={'name': 'User Two', 'email': email, 'password': password})
    assert r.status_code == 201, f'user2 register failed: {r.status_code} {r.text}'
    token = r.json()['access_token']
    return {'email': email, 'password': password, 'token': token,
            'headers': {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}}


# -------- 1. Auth flow --------
class TestAuth:
    def test_register_new_or_conflict(self, client):
        r = client.post(f"{API}/auth/register",
                        json={'name': DEMO_NAME, 'email': DEMO_EMAIL, 'password': DEMO_PASSWORD})
        assert r.status_code in (201, 400)
        if r.status_code == 201:
            assert 'access_token' in r.json()
        else:
            assert 'já cadastrado' in r.json().get('detail', '')

    def test_login_success(self, client):
        r = client.post(f"{API}/auth/login",
                        json={'email': DEMO_EMAIL, 'password': DEMO_PASSWORD})
        assert r.status_code == 200
        data = r.json()
        assert 'access_token' in data and data['token_type'] == 'bearer'

    def test_login_wrong_password(self, client):
        r = client.post(f"{API}/auth/login",
                        json={'email': DEMO_EMAIL, 'password': 'wrong-password'})
        assert r.status_code == 401

    def test_me_with_token(self, client, demo_headers):
        r = client.get(f"{API}/auth/me", headers=demo_headers)
        assert r.status_code == 200
        data = r.json()
        assert data['email'] == DEMO_EMAIL
        assert data['name'] == DEMO_NAME
        assert 'id' in data

    def test_me_without_token(self, client):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_with_invalid_token(self, client):
        r = requests.get(f"{API}/auth/me",
                         headers={'Authorization': 'Bearer bogus.token.value'})
        assert r.status_code == 401


# -------- 2. Workplaces CRUD --------
class TestWorkplaces:
    """Ensures a clean baseline by clearing user's existing workplaces first."""

    @pytest.fixture(scope='class', autouse=True)
    def cleanup_before(self, demo_headers):
        # remove any existing workplaces so we start empty
        r = requests.get(f"{API}/workplaces", headers=demo_headers)
        if r.status_code == 200:
            for wp in r.json():
                requests.delete(f"{API}/workplaces/{wp['id']}", headers=demo_headers)
        yield

    def test_list_initially_empty(self, demo_headers):
        r = requests.get(f"{API}/workplaces", headers=demo_headers)
        assert r.status_code == 200
        assert r.json() == []

    def test_create_full_body(self, demo_headers, request):
        body = {
            'name': 'Hospital Teste', 'color': '#32827A',
            'cycle_pattern': 'SD_F_SN_F_F', 'cycle_start_date': '2026-01-01',
            'cycle_start_shift': 'SD',
            'sd_start': '07:00', 'sd_end': '19:00',
            'sn_start': '19:00', 'sn_end': '07:00',
            'shift_day_color': '#007AFF', 'shift_night_color': '#FF3B30',
            'avulso_color': '#34C759', 'is_avulso_only': False, 'vacations': [],
        }
        r = requests.post(f"{API}/workplaces", headers=demo_headers, json=body)
        assert r.status_code == 201, r.text
        wp = r.json()
        for k in body:
            assert wp[k] == body[k], f'field mismatch: {k}'
        assert 'id' in wp and 'user_id' in wp and 'created_at' in wp
        request.config._wp_id = wp['id']

    def test_list_returns_one(self, demo_headers):
        r = requests.get(f"{API}/workplaces", headers=demo_headers)
        assert r.status_code == 200
        assert len(r.json()) == 1

    def test_update_workplace(self, demo_headers, request):
        wid = request.config._wp_id
        update = {'name': 'Hospital Renomeado',
                  'vacations': [{'start': '2026-06-01', 'end': '2026-06-15'}]}
        r = requests.put(f"{API}/workplaces/{wid}", headers=demo_headers, json=update)
        assert r.status_code == 200, r.text
        wp = r.json()
        assert wp['name'] == 'Hospital Renomeado'
        assert wp['vacations'] == [{'start': '2026-06-01', 'end': '2026-06-15'}]

        # verify persistence via GET
        r2 = requests.get(f"{API}/workplaces", headers=demo_headers)
        found = next(w for w in r2.json() if w['id'] == wid)
        assert found['name'] == 'Hospital Renomeado'
        assert found['vacations'] == [{'start': '2026-06-01', 'end': '2026-06-15'}]

    def test_update_wrong_id_returns_404(self, demo_headers):
        r = requests.put(f"{API}/workplaces/non-existent-id",
                         headers=demo_headers, json={'name': 'x'})
        assert r.status_code == 404

    def test_delete_workplace(self, demo_headers, request):
        wid = request.config._wp_id
        r = requests.delete(f"{API}/workplaces/{wid}", headers=demo_headers)
        assert r.status_code == 204

        # verify list now empty
        r2 = requests.get(f"{API}/workplaces", headers=demo_headers)
        assert r2.status_code == 200
        assert all(w['id'] != wid for w in r2.json())


# -------- 3. Shift Overrides CRUD --------
class TestShiftOverrides:
    @pytest.fixture(scope='class')
    def workplace_id(self, demo_headers):
        body = {
            'name': 'WP for shifts', 'color': '#32827A',
            'cycle_pattern': 'SD_F_SN_F_F', 'cycle_start_date': '2026-01-01',
            'cycle_start_shift': 'SD',
            'sd_start': '07:00', 'sd_end': '19:00',
            'sn_start': '19:00', 'sn_end': '07:00',
            'shift_day_color': '#007AFF', 'shift_night_color': '#FF3B30',
            'avulso_color': '#34C759', 'is_avulso_only': False, 'vacations': [],
        }
        r = requests.post(f"{API}/workplaces", headers=demo_headers, json=body)
        assert r.status_code == 201, r.text
        wid = r.json()['id']
        yield wid
        requests.delete(f"{API}/workplaces/{wid}", headers=demo_headers)

    def test_create_override(self, demo_headers, workplace_id):
        payload = {'shift_type': 'SN', 'start_time': '19:00', 'end_time': '07:00',
                   'note': 'troca com colega', 'swap_with': 'Maria'}
        r = requests.put(f"{API}/shifts/{workplace_id}/2026-02-15",
                         headers=demo_headers, json=payload)
        assert r.status_code == 200, r.text
        ov = r.json()
        assert ov['shift_type'] == 'SN'
        assert ov['start_time'] == '19:00'
        assert ov['note'] == 'troca com colega'
        assert ov['swap_with'] == 'Maria'
        assert ov['date'] == '2026-02-15'

    def test_list_overrides_contains_date(self, demo_headers, workplace_id):
        r = requests.get(f"{API}/shifts/{workplace_id}",
                         params={'year': 2026, 'month': 2}, headers=demo_headers)
        assert r.status_code == 200
        dates = [o['date'] for o in r.json()]
        assert '2026-02-15' in dates

    def test_upsert_override_ferias(self, demo_headers, workplace_id):
        payload = {'shift_type': 'FERIAS', 'start_time': None,
                   'end_time': None, 'note': None, 'swap_with': None}
        r = requests.put(f"{API}/shifts/{workplace_id}/2026-02-15",
                         headers=demo_headers, json=payload)
        assert r.status_code == 200, r.text
        ov = r.json()
        assert ov['shift_type'] == 'FERIAS'
        assert ov['start_time'] is None
        assert ov['swap_with'] is None

        # verify only one entry for that date
        r2 = requests.get(f"{API}/shifts/{workplace_id}",
                          params={'year': 2026, 'month': 2}, headers=demo_headers)
        matches = [o for o in r2.json() if o['date'] == '2026-02-15']
        assert len(matches) == 1
        assert matches[0]['shift_type'] == 'FERIAS'

    def test_delete_override(self, demo_headers, workplace_id):
        r = requests.delete(f"{API}/shifts/{workplace_id}/2026-02-15",
                            headers=demo_headers)
        assert r.status_code == 204

        r2 = requests.get(f"{API}/shifts/{workplace_id}",
                          params={'year': 2026, 'month': 2}, headers=demo_headers)
        assert r2.status_code == 200
        assert all(o['date'] != '2026-02-15' for o in r2.json())


# -------- 4. Holidays CRUD --------
class TestHolidays:
    def test_list_holidays(self, demo_headers):
        r = requests.get(f"{API}/holidays", headers=demo_headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)

    def test_create_and_verify_and_delete(self, demo_headers):
        r = requests.post(f"{API}/holidays", headers=demo_headers,
                          json={'date': '2026-07-15', 'name': 'Aniversário da Cidade'})
        assert r.status_code == 201, r.text
        h = r.json()
        assert h['date'] == '2026-07-15'
        assert h['name'] == 'Aniversário da Cidade'
        hid = h['id']

        r2 = requests.get(f"{API}/holidays", headers=demo_headers)
        assert any(x['id'] == hid for x in r2.json())

        r3 = requests.delete(f"{API}/holidays/{hid}", headers=demo_headers)
        assert r3.status_code == 204

        r4 = requests.get(f"{API}/holidays", headers=demo_headers)
        assert all(x['id'] != hid for x in r4.json())


# -------- 5. Authorization boundary --------
class TestAuthorizationBoundary:
    def test_user2_cannot_see_or_modify_user1_workplace(self, demo_headers, user2):
        # user1 creates workplace
        body = {
            'name': 'Private WP', 'color': '#32827A',
            'cycle_pattern': 'SD_SN_F_F', 'cycle_start_date': '2026-03-01',
            'cycle_start_shift': 'SD',
            'sd_start': '07:00', 'sd_end': '19:00',
            'sn_start': '19:00', 'sn_end': '07:00',
            'shift_day_color': '#007AFF', 'shift_night_color': '#FF3B30',
            'avulso_color': '#34C759', 'is_avulso_only': False, 'vacations': [],
        }
        r = requests.post(f"{API}/workplaces", headers=demo_headers, json=body)
        assert r.status_code == 201
        wid = r.json()['id']

        try:
            # user2 lists → does not include wid
            r2 = requests.get(f"{API}/workplaces", headers=user2['headers'])
            assert r2.status_code == 200
            assert all(w['id'] != wid for w in r2.json())

            # user2 PUT on user1's id → 404
            r3 = requests.put(f"{API}/workplaces/{wid}",
                              headers=user2['headers'], json={'name': 'hack'})
            assert r3.status_code == 404

            # user2 DELETE on user1's id → 404
            r4 = requests.delete(f"{API}/workplaces/{wid}", headers=user2['headers'])
            assert r4.status_code == 404

            # user1 workplace still intact
            r5 = requests.get(f"{API}/workplaces", headers=demo_headers)
            assert any(w['id'] == wid and w['name'] == 'Private WP' for w in r5.json())
        finally:
            requests.delete(f"{API}/workplaces/{wid}", headers=demo_headers)
