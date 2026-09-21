"""EscalaFácil backend tests - verifies new shift types (MANHA/TARDE) and workplace color fields."""
import os
import pytest
import requests

BASE_URL = os.environ.get('EXPO_BACKEND_URL', 'https://nurse-scheduler-15.preview.emergentagent.com').rstrip('/')
EMAIL = 'demo@escalafacil.com'
PASSWORD = 'demo123456'
NAME = 'Demo Enfermeiro'


@pytest.fixture(scope='module')
def token():
    # Try register; if exists (400), fall back to login
    r = requests.post(f'{BASE_URL}/api/auth/register',
                      json={'name': NAME, 'email': EMAIL, 'password': PASSWORD})
    if r.status_code == 201:
        return r.json()['access_token']
    assert r.status_code == 400, f'unexpected register status: {r.status_code} {r.text}'
    r = requests.post(f'{BASE_URL}/api/auth/login',
                      json={'email': EMAIL, 'password': PASSWORD})
    assert r.status_code == 200, f'login failed: {r.status_code} {r.text}'
    return r.json()['access_token']


@pytest.fixture(scope='module')
def headers(token):
    return {'Authorization': f'Bearer {token}', 'Content-Type': 'application/json'}


# ============ Regression: auth ============
class TestAuthRegression:
    def test_get_me(self, headers):
        r = requests.get(f'{BASE_URL}/api/auth/me', headers=headers)
        assert r.status_code == 200
        data = r.json()
        assert data['email'] == EMAIL
        assert 'id' in data and 'name' in data

    def test_list_workplaces_regression(self, headers):
        r = requests.get(f'{BASE_URL}/api/workplaces', headers=headers)
        assert r.status_code == 200
        assert isinstance(r.json(), list)


# ============ Workplace: default color values ============
class TestWorkplaceDefaults:
    created_ids = []

    def test_create_wp_default_colors(self, headers):
        payload = {
            'name': 'TEST_WP_Defaults',
            'cycle_start_date': '2026-01-01',
        }
        r = requests.post(f'{BASE_URL}/api/workplaces', json=payload, headers=headers)
        assert r.status_code == 201, r.text
        data = r.json()
        assert data['manha_color'] == '#FFCC00'
        assert data['tarde_color'] == '#FF9500'
        assert data['avulso_color'] == '#34C759'
        TestWorkplaceDefaults.created_ids.append(data['id'])

    def test_create_wp_custom_colors(self, headers):
        payload = {
            'name': 'TEST_WP_Custom',
            'cycle_start_date': '2026-01-01',
            'manha_color': '#00FF00',
            'tarde_color': '#0000FF',
        }
        r = requests.post(f'{BASE_URL}/api/workplaces', json=payload, headers=headers)
        assert r.status_code == 201, r.text
        data = r.json()
        assert data['manha_color'] == '#00FF00'
        assert data['tarde_color'] == '#0000FF'
        TestWorkplaceDefaults.created_ids.append(data['id'])

    def test_update_wp_partial_manha_color(self, headers):
        wid = TestWorkplaceDefaults.created_ids[1]  # custom one
        r = requests.put(f'{BASE_URL}/api/workplaces/{wid}',
                         json={'manha_color': '#AABBCC'}, headers=headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data['manha_color'] == '#AABBCC'
        # tarde_color must remain from prior create ('#0000FF')
        assert data['tarde_color'] == '#0000FF'
        # GET to verify persistence
        r2 = requests.get(f'{BASE_URL}/api/workplaces', headers=headers)
        assert r2.status_code == 200
        wp = next((w for w in r2.json() if w['id'] == wid), None)
        assert wp is not None
        assert wp['manha_color'] == '#AABBCC'
        assert wp['tarde_color'] == '#0000FF'


# ============ Shift overrides: new types + validation ============
class TestShiftOverridesNewTypes:
    @pytest.fixture(scope='class')
    def wid(self, headers):
        payload = {'name': 'TEST_WP_Shifts', 'cycle_start_date': '2026-01-01'}
        r = requests.post(f'{BASE_URL}/api/workplaces', json=payload, headers=headers)
        assert r.status_code == 201
        return r.json()['id']

    def test_put_manha_override(self, headers, wid):
        r = requests.put(f'{BASE_URL}/api/shifts/{wid}/2026-03-01',
                         json={'shift_type': 'MANHA', 'start_time': '07:00', 'end_time': '13:00'},
                         headers=headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['shift_type'] == 'MANHA'
        assert d['start_time'] == '07:00'
        assert d['end_time'] == '13:00'

    def test_put_tarde_override(self, headers, wid):
        r = requests.put(f'{BASE_URL}/api/shifts/{wid}/2026-03-02',
                         json={'shift_type': 'TARDE', 'start_time': '13:00', 'end_time': '19:00'},
                         headers=headers)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d['shift_type'] == 'TARDE'

    def test_list_overrides_contains_both(self, headers, wid):
        r = requests.get(f'{BASE_URL}/api/shifts/{wid}?year=2026&month=3', headers=headers)
        assert r.status_code == 200
        items = r.json()
        by_date = {i['date']: i for i in items}
        assert '2026-03-01' in by_date and by_date['2026-03-01']['shift_type'] == 'MANHA'
        assert '2026-03-02' in by_date and by_date['2026-03-02']['shift_type'] == 'TARDE'

    def test_put_invalid_shift_type(self, headers, wid):
        r = requests.put(f'{BASE_URL}/api/shifts/{wid}/2026-03-03',
                         json={'shift_type': 'XYZ'}, headers=headers)
        assert r.status_code == 422, f'expected 422, got {r.status_code}: {r.text}'

    @pytest.mark.parametrize('st', ['SD', 'SN', 'FOLGA', 'AVULSO', 'FERIAS'])
    def test_existing_shift_types(self, headers, wid, st):
        date = f'2026-04-{["SD","SN","FOLGA","AVULSO","FERIAS"].index(st)+1:02d}'
        r = requests.put(f'{BASE_URL}/api/shifts/{wid}/{date}',
                         json={'shift_type': st}, headers=headers)
        assert r.status_code == 200, r.text
        assert r.json()['shift_type'] == st


# ============ Other CRUD regression ============
class TestOtherCRUD:
    def test_workplace_update_and_delete(self, headers):
        r = requests.post(f'{BASE_URL}/api/workplaces',
                          json={'name': 'TEST_WP_Del', 'cycle_start_date': '2026-01-01'},
                          headers=headers)
        assert r.status_code == 201
        wid = r.json()['id']
        # update name
        r2 = requests.put(f'{BASE_URL}/api/workplaces/{wid}',
                          json={'name': 'TEST_WP_Renamed'}, headers=headers)
        assert r2.status_code == 200
        assert r2.json()['name'] == 'TEST_WP_Renamed'
        # delete
        r3 = requests.delete(f'{BASE_URL}/api/workplaces/{wid}', headers=headers)
        assert r3.status_code == 204

    def test_holidays_crud(self, headers):
        r = requests.post(f'{BASE_URL}/api/holidays',
                          json={'date': '2026-12-25', 'name': 'TEST_Holiday'}, headers=headers)
        assert r.status_code == 201
        hid = r.json()['id']
        r2 = requests.get(f'{BASE_URL}/api/holidays', headers=headers)
        assert r2.status_code == 200
        assert any(h['id'] == hid for h in r2.json())
        r3 = requests.delete(f'{BASE_URL}/api/holidays/{hid}', headers=headers)
        assert r3.status_code == 204

    def test_events_crud(self, headers):
        r = requests.post(f'{BASE_URL}/api/events',
                          json={'date': '2026-05-10', 'label': 'TEST_Event',
                                'start_time': '08:00', 'end_time': '12:00'},
                          headers=headers)
        assert r.status_code == 201
        eid = r.json()['id']
        r2 = requests.put(f'{BASE_URL}/api/events/{eid}',
                          json={'label': 'TEST_Event_Updated'}, headers=headers)
        assert r2.status_code == 200
        assert r2.json()['label'] == 'TEST_Event_Updated'
        r3 = requests.get(f'{BASE_URL}/api/events?year=2026&month=5', headers=headers)
        assert r3.status_code == 200
        assert any(e['id'] == eid for e in r3.json())
        r4 = requests.delete(f'{BASE_URL}/api/events/{eid}', headers=headers)
        assert r4.status_code == 204


# ============ Cleanup ============
def test_zzz_cleanup(headers):
    """Delete TEST_ workplaces created during tests."""
    r = requests.get(f'{BASE_URL}/api/workplaces', headers=headers)
    assert r.status_code == 200
    for wp in r.json():
        if wp['name'].startswith('TEST_'):
            requests.delete(f"{BASE_URL}/api/workplaces/{wp['id']}", headers=headers)
